package main

// SSE endpoint: streams agy tee-file content to connected clients.
//
// Protocol (identical to the previous TypeScript server):
//   data: {"file":"/home/u/.agy-bridge/agy-x.jsonl","lines":["{...}","{...}"]}\n\n
//   data: {"file":"...","tool_diff":{"step_index":N,"target":"...","diff":[...]}}\n\n
//   data: {"type":"ready"}\n\n
//   : keepalive\n\n

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"
)

const (
	pollInterval = 250 * time.Millisecond
	keepaliveEvery = 15 * time.Second
	readChunkLimit = 1 << 20 // 1MB max per file read
)

var teeNameRe = regexp.MustCompile(`^agy-.*\.jsonl$`)

// teeState holds per-file read offsets so each poll only sends new lines.
type teeState struct {
	mu      sync.Mutex
	offsets map[string]int64 // tee file path → last read offset
}

var tee = &teeState{offsets: make(map[string]int64)}

// scanTeeFiles returns the current set of tee files across all watched
// directories, sorted for stable replay.
func scanTeeFiles() []string {
	var files []string
	for _, dir := range teeDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !teeNameRe.MatchString(e.Name()) {
				continue
			}
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(files)
	return files
}

// teeMessage mirrors the JSON SSE payload shape from the TS server.
type teeMessage struct {
	File     string   `json:"file"`
	Lines    []string `json:"lines,omitempty"`
	ToolDiff *toolDiffPayload `json:"tool_diff,omitempty"`
	Type     string   `json:"type,omitempty"` // "ready"
}

// readNewLines reads newly appended lines from a tee file since the last
// offset. processLine (diff.go) is invoked per line so file-modifying tool
// events generate extra tool_diff messages.
func readNewLines(path string) (lines []string, extras []json.RawMessage, err error) {
	st, err := os.Stat(path)
	if err != nil {
		return nil, nil, err
	}
	size := st.Size()

	tee.mu.Lock()
	offset := tee.offsets[path]
	if size <= offset {
		tee.mu.Unlock()
		return nil, nil, nil
	}
	tee.mu.Unlock()

	// Cap the read chunk so a huge file can't blow up memory.
	if size-offset > readChunkLimit {
		offset = size - readChunkLimit
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	chunk := string(data[offset:])

	tee.mu.Lock()
	tee.offsets[path] = size
	tee.mu.Unlock()

	// The chunk may end mid-line; hold back the trailing partial line until
	// more data arrives by rewinding the offset to the last newline boundary.
	if n := lastIndexByte(chunk, '\n'); n >= 0 && n < len(chunk)-1 {
		partial := chunk[n+1:]
		tee.mu.Lock()
		tee.offsets[path] = size - int64(len(partial))
		tee.mu.Unlock()
		chunk = chunk[:n+1]
	}

	for _, line := range splitLines(chunk) {
		if line == "" {
			continue
		}
		lines = append(lines, line)
		if ex := processLine(path, line); len(ex) > 0 {
			extras = append(extras, ex...)
		}
	}
	return lines, extras, nil
}

// handleEvents serves the SSE endpoint: replays existing tee files once,
// then polls for new lines and forwards them (plus tool_diff extras) live.
func handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no")

	writeMsg := func(v any) bool {
		b, err := json.Marshal(v)
		if err != nil {
			return true
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	// Replay existing files (fresh offsets per client so every client sees
	// full history). Diffs are not generated during replay — the files on
	// disk are post-modification, so git diffs would be stale/duplicated.
	// The replay path writes raw lines only (processLine still records PIDs).
	for _, file := range scanTeeFiles() {
		tee.mu.Lock()
		tee.offsets[file] = 0
		tee.mu.Unlock()
		lines, _, err := readNewLines(file)
		if err != nil || len(lines) == 0 {
			continue
		}
		if !writeMsg(teeMessage{File: file, Lines: lines}) {
			return
		}
	}
	writeMsg(teeMessage{Type: "ready"})

	// Live phase: poll tee dir, forward new lines + extras.
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	keepalive := time.NewTicker(keepaliveEvery)
	defer keepalive.Stop()

	clientGone := r.Context().Done()
	for {
		select {
		case <-clientGone:
			return
		case <-keepalive.C:
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			for _, file := range scanTeeFiles() {
				lines, extras, err := readNewLines(file)
				if err != nil {
					continue
				}
				if len(lines) > 0 {
					if !writeMsg(teeMessage{File: file, Lines: lines}) {
						return
					}
				}
				for _, ex := range extras {
					if _, err := fmt.Fprintf(w, "data: %s\n\n", ex); err != nil {
						return
					}
				}
				if len(extras) > 0 {
					flusher.Flush()
				}
			}
		}
	}
}

// splitLines splits a chunk on \n, filtering out empty/whitespace-only lines.
func splitLines(chunk string) []string {
	var out []string
	start := 0
	for i := 0; i < len(chunk); i++ {
		if chunk[i] == '\n' {
			line := trimSpace(chunk[start:i])
			if line != "" {
				out = append(out, line)
			}
			start = i + 1
		}
	}
	if start < len(chunk) {
		line := trimSpace(chunk[start:])
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t' || s[0] == '\r') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t' || s[len(s)-1] == '\r') {
		s = s[:len(s)-1]
	}
	return s
}

func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}

var _ = log.Printf // keep log import for diff.go parity; may be removed
