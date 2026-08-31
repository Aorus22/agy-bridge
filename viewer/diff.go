package main

// diff.go — detects file-modifying tool calls in tee streams, captures git
// diffs on completion, tracks agy process PIDs, and serves POST /stop.

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const maxDiffLines = 1000
const gitTimeout = 2 * time.Second

// ── tee stream event shapes (subset we care about) ─────────────────────────

type toolInfo struct {
	Name       string            `json:"name"`
	Parameters map[string]any    `json:"parameters"`
	Output     string            `json:"output"`
	Error      *toolError        `json:"error"`
}

type toolError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

type stepUpdate struct {
	ConversationID string    `json:"conversation_id"`
	StepIndex      int       `json:"step_index"`
	State          string    `json:"state"`
	StepType       string    `json:"step_type"`
	TextDelta      string    `json:"text_delta"`
	ToolName       string    `json:"tool_name"`
	ToolInfo       *toolInfo `json:"tool_info"`
}

type streamEvent struct {
	Event         string      `json:"event"`
	ConversationID string     `json:"conversation_id"`
	Text          string      `json:"text"`     // prompt event
	Pid           json.Number `json:"pid"`      // process event
	StepUpdate    *stepUpdate `json:"step_update"`
}

// ── diff payload ──────────────────────────────────────────────────────────

type diffLine struct {
	Type string `json:"type"` // add | del | ctx
	Text string `json:"text"`
}

type toolDiffPayload struct {
	StepIndex int        `json:"step_index"`
	Target    string     `json:"target"`
	Diff      []diffLine `json:"diff"`
}

// ── PID tracking (event:process) ──────────────────────────────────────────

type pidRegistry struct {
	mu  sync.Mutex
	pids map[string]int // tee file path → agy process PID
}

var pids = &pidRegistry{pids: make(map[string]int)}

// ── processLine ──────────────────────────────────────────────────────────

// processLine inspects a raw tee line and returns zero or more extra SSE
// messages (as pre-marshalled JSON) to emit alongside the raw line:
//   - event:process → records the PID for later /stop requests
//   - tool DONE events for file-modifying tools → git diff payload
func processLine(teeFile, rawLine string) []json.RawMessage {
	var evt streamEvent
	if err := json.Unmarshal([]byte(rawLine), &evt); err != nil {
		return nil
	}

	// Track the spawned agy PID so /stop can kill it later.
	if evt.Event == "process" && evt.Pid != "" {
		if pid, err := evt.Pid.Int64(); err == nil {
			pids.mu.Lock()
			pids.pids[teeFile] = int(pid)
			pids.mu.Unlock()
		}
		return nil
	}

	su := evt.StepUpdate
	if evt.Event != "step_update" || su == nil || su.StepType != "tool" {
		return nil
	}

	toolName := strings.ToLower(su.ToolName)
	if su.ToolInfo != nil && su.ToolInfo.Name != "" && toolName == "" {
		toolName = strings.ToLower(su.ToolInfo.Name)
	}
	if !isFileModifying(toolName) {
		return nil
	}

	target := targetPath(su.ToolInfo)
	if target == "" {
		return nil
	}

	log.Printf("[diff] %s %s → %s", toolName, su.State, target)

	// Only capture a diff on completion — by then the file has been modified.
	if su.State != "DONE" && su.State != "ERROR" {
		return nil
	}

	diff := gitDiff(target)
	if len(diff) == 0 {
		log.Printf("[diff] gitDiff result: null")
		return nil
	}
	log.Printf("[diff] gitDiff result: %d lines", len(diff))

	payload := toolDiffPayload{StepIndex: su.StepIndex, Target: target, Diff: diff}
	b, err := json.Marshal(map[string]any{
		"file":      teeFile,
		"tool_diff": payload,
	})
	if err != nil {
		return nil
	}
	return []json.RawMessage{json.RawMessage(b)}
}

func isFileModifying(tool string) bool {
	for _, frag := range []string{"replace", "write_to_file", "sed_file"} {
		if strings.Contains(tool, frag) {
			return true
		}
	}
	return false
}

func targetPath(info *toolInfo) string {
	if info == nil {
		return ""
	}
	for _, key := range []string{"TargetFile", "targetFile", "file_path", "filePath", "file", "path"} {
		if v, ok := info.Parameters[key].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

// ── git diff ──────────────────────────────────────────────────────────────

// gitDiff returns the diff of a file vs HEAD as DiffLine[] (same shape the
// frontend expects). Untracked files are reported as fully added.
func gitDiff(filePath string) []diffLine {
	dir := filepath.Dir(filePath)

	out, err := runGit(dir, "diff", "HEAD", "--unified=3", "--", filePath)
	if err != nil {
		// Not a git repo (or git missing) — no diff available.
		return nil
	}

	if strings.TrimSpace(out) != "" {
		return parseUnifiedDiff(out)
	}

	// Empty diff vs HEAD: either unchanged (tracked) or untracked.
	if _, err := runGit(dir, "ls-files", "--error-unmatch", "--", filePath); err == nil {
		// Tracked and unchanged — nothing to show.
		return nil
	}

	// Untracked file: show the whole content as added lines.
	return wholeFileAsAdded(filePath)
}

// runGit executes a git command in dir with a hard timeout.
func runGit(dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), gitTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return stdout.String(), err
	}
	return stdout.String(), nil
}

// parseUnifiedDiff converts `git diff --unified=3` output into DiffLine[].
func parseUnifiedDiff(out string) []diffLine {
	var result []diffLine
	inHunk := false
	for _, line := range strings.Split(out, "\n") {
		switch {
		case strings.HasPrefix(line, "@@"):
			inHunk = true
			continue
		case strings.HasPrefix(line, "diff "), strings.HasPrefix(line, "index "):
			inHunk = false
			continue
		case strings.HasPrefix(line, "---"), strings.HasPrefix(line, "+++"):
			continue
		}
		if !inHunk {
			continue
		}
		switch {
		case strings.HasPrefix(line, "+"):
			result = append(result, diffLine{Type: "add", Text: line[1:]})
		case strings.HasPrefix(line, "-"):
			result = append(result, diffLine{Type: "del", Text: line[1:]})
		case strings.HasPrefix(line, " "):
			result = append(result, diffLine{Type: "ctx", Text: line[1:]})
		case strings.HasPrefix(line, "\\"), line == "":
			continue
		}
		if len(result) > maxDiffLines {
			break
		}
	}
	return result
}

// wholeFileAsAdded reads the file and returns every line as an "add" entry.
func wholeFileAsAdded(path string) []diffLine {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) > maxDiffLines {
		return nil
	}
	out := make([]diffLine, 0, len(lines))
	for _, l := range lines {
		out = append(out, diffLine{Type: "add", Text: l})
	}
	return out
}

// ── POST /stop ────────────────────────────────────────────────────────────

type stopRequest struct {
	Pid       json.Number `json:"pid"`
	TeeFile   string      `json:"teeFile"`
	SessionID string      `json:"sessionId"`
}

// handleStop terminates a running agy process by PID, tee file, or session
// ID (8-char conversation prefix matched against tee filenames).
func handleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req stopRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Invalid JSON"})
		return
	}

	// Resolve target PID by priority: explicit pid → teeFile → sessionId.
	target := 0
	if req.Pid != "" {
		if p, err := req.Pid.Int64(); err == nil {
			target = int(p)
		}
	}
	if target == 0 {
		if req.TeeFile != "" {
			target = pidForTee(req.TeeFile)
		} else if req.SessionID != "" {
			target = pidForSession(req.SessionID)
		}
	}

	if target == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "Process PID not found"})
		return
	}

	if err := syscall.Kill(target, syscall.SIGTERM); err != nil {
		log.Printf("[stop] failed to kill PID %d: %v", target, err)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": false, "error": err.Error(), "pid": target,
		})
		return
	}

	log.Printf("[stop] sent SIGTERM to PID %d", target)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "pid": target})
}

func pidForTee(teePath string) int {
	pids.mu.Lock()
	defer pids.mu.Unlock()
	if p, ok := pids.pids[teePath]; ok {
		return p
	}
	return 0
}

// pidForSession resolves a session ID (conversation prefix) to a tee file by
// scanning tee filenames for the prefix, then looks up the recorded PID.
func pidForSession(sessionID string) int {
	for _, file := range scanTeeFiles() {
		name := filepath.Base(file)
		if strings.HasPrefix(name, sessionID) {
			return pidForTee(file)
		}
	}
	return 0
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

var _ = strconv.Itoa // reserved for future use
