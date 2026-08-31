// agy-bridge viewer — single-executable web viewer for agy run transcripts.
//
// Bundles the built Vite app (dist/) via go:embed and serves it with:
//   - SSE endpoint /events  (replay + live tee-file streaming)
//   - POST /stop            (SIGTERM a running agy process by PID/session)
//   - SPA fallback          (any GET path serves index.html for client routing)
//
// Build:  bun run build && go build -o ../bin/agy-viewer .
// Run:    bin/agy-viewer [--port 3939]
package main

import (
	"embed"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// teeDir is where agy tee files live (~/.agy-bridge by default).
var teeDir string

// mime types for static assets served from the embedded FS.
var mimeTypes = map[string]string{
	".html": "text/html; charset=utf-8",
	".js":   "application/javascript",
	".css":  "text/css",
	".svg":  "image/svg+xml",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".ico":  "image/x-icon",
	".json": "application/json",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".map":  "application/json",
	".txt":  "text/plain; charset=utf-8",
}

func main() {
	port := flag.Int("port", 3939, "listen port")
	tee := flag.String("tee-dir", "", "tee file directory (default ~/.agy-bridge)")
	flag.Parse()

	home, err := os.UserHomeDir()
	if err != nil {
		log.Fatalf("cannot resolve home dir: %v", err)
	}
	teeDir = *tee
	if teeDir == "" {
		teeDir = filepath.Join(home, ".agy-bridge")
	}
	if err := os.MkdirAll(teeDir, 0o755); err != nil {
		log.Fatalf("cannot create tee dir %s: %v", teeDir, err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/events", handleEvents)
	mux.HandleFunc("/stop", handleStop)
	mux.HandleFunc("/", handleStatic)

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("agy-bridge viewer: http://%s", addr)
	log.Printf("watching: %s/agy-*.jsonl", teeDir)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

// handleStatic serves the embedded dist/ FS with an SPA fallback:
// /, /index.html, /assets/* resolve to real files; any other GET path
// (client routes like /ecd6b914) falls back to index.html.
func handleStatic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")

	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" || path == "index.html" {
		serveFile(w, r, "dist/index.html")
		return
	}

	// Try to serve the real file from the embedded FS.
	full := "dist/" + path
	if f, err := distFS.Open(full); err == nil {
		f.Close()
		serveFile(w, r, full)
		return
	}

	// SPA fallback: any other GET path serves index.html so the client
	// router can pick up the session ID from the URL.
	serveFile(w, r, "dist/index.html")
}

// serveFile writes a single file from the embedded FS with mime detection.
func serveFile(w http.ResponseWriter, r *http.Request, name string) {
	data, err := distFS.ReadFile(name)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	ext := strings.ToLower(filepath.Ext(name))
	if ct, ok := mimeTypes[ext]; ok {
		w.Header().Set("Content-Type", ct)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	_, _ = w.Write(data)
	_ = r // method check done upstream; kept for signature symmetry
}
