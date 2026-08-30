/**
 * agy live viewer server.
 *
 * Serves a single HTML page + an SSE endpoint that watches /tmp/agy-*.jsonl
 * tee files and streams their content live. Open it in OpenChamber's browser
 * panel to watch agy activity (thinking, tool calls, AI responses) in real time.
 *
 * Run: bun run viewer/server.ts  (default port 3939)
 *      bun run viewer/server.ts --port 8080
 */
import { watchFile, readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join as pjoin } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEE_DIR = process.env.AGY_TEE_DIR || tmpdir()
const PORT = (() => {
  const i = process.argv.indexOf("--port")
  return i > -1 ? parseInt(process.argv[i + 1], 10) : 3939
})()

// Track per-file read offsets so we only send new lines
const offsets = new Map<string, number>()

function scanTeeFiles(): string[] {
  try {
    return readdirSync(TEE_DIR)
      .filter((f) => /^agy-.*\.jsonl$/.test(f))
      .map((f) => join(TEE_DIR, f))
  } catch {
    return []
  }
}

function readNewLines(path: string): string[] {
  try {
    const st = statSync(path)
    const size = st.size
    const offset = offsets.get(path) ?? 0
    if (size <= offset) return []
    const buf = readFileSync(path)
    const chunk = buf.subarray(offset).toString("utf8")
    offsets.set(path, size)
    return chunk.split("\n").filter((l) => l.trim().length > 0)
  } catch {
    return []
  }
}

const server = createServer((req, res) => {
  // SSE endpoint
  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    })

    // Send current files (replay)
    for (const file of scanTeeFiles()) {
      offsets.set(file, 0)
      const lines = readNewLines(file)
      if (lines.length > 0) {
        res.write(`data: ${JSON.stringify({ file, lines })}\n\n`)
      }
    }
    res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`)

    // Poll for new lines every 400ms
    const interval = setInterval(() => {
      for (const file of scanTeeFiles()) {
        const lines = readNewLines(file)
        if (lines.length > 0) {
          res.write(`data: ${JSON.stringify({ file, lines })}\n\n`)
        }
      }
    }, 400)

    // keepalive
    const keepalive = setInterval(() => {
      try {
        res.write(": keepalive\n\n")
      } catch {
        clearInterval(interval)
        clearInterval(keepalive)
      }
    }, 15000)

    req.on("close", () => {
      clearInterval(interval)
      clearInterval(keepalive)
    })
    return
  }

  // Serve the HTML page
  if (req.url === "/" || req.url === "/index.html") {
    try {
      const html = readFileSync(pjoin(__dirname, "index.html"), "utf8")
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(html)
    } catch {
      res.writeHead(404)
      res.end("index.html not found")
    }
    return
  }

  res.writeHead(404)
  res.end("not found")
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`agy viewer: http://127.0.0.1:${PORT}`)
  console.log(`watching: ${TEE_DIR}/agy-*.jsonl`)
})
