/**
 * agy-bridge live viewer server.
 *
 * Serves the built Vite app + an SSE endpoint that watches ~/.agy-bridge/agy-*.jsonl
 * tee files and streams their content live.
 *
 * Also detects `replace_file_content` / `multi_replace_file_content` tool calls:
 * snapshots the file before (ACTIVE) and after (DONE), generates a line diff,
 * and emits it as a separate `tool_diff` SSE event so the viewer can render
 * a git-style diff view.
 *
 * Run: bun run viewer/server.ts  (default port 3939)
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join as pjoin } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEE_DIR = process.env.AGY_TEE_DIR || join(homedir(), ".agy-bridge")
const PORT = (() => {
  const i = process.argv.indexOf("--port")
  return i > -1 ? parseInt(process.argv[i + 1], 10) : 3939
})()

const MAX_DIFF_LINES = 1000 // skip diff for files larger than this

// ── line diff (LCS-based) ──────────────────────────────────────────────────
type DiffLine = { type: "add" | "del" | "ctx"; text: string }

function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n")
  const b = after.split("\n")
  const m = a.length, n = b.length

  // LCS DP table (use Uint32Array for memory efficiency)
  const dp: Uint32Array[] = []
  for (let i = 0; i <= m; i++) dp.push(new Uint32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0, j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { result.push({ type: "ctx", text: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { result.push({ type: "del", text: a[i] }); i++ }
    else { result.push({ type: "add", text: b[j] }); j++ }
  }
  while (i < m) { result.push({ type: "del", text: a[i] }); i++ }
  while (j < n) { result.push({ type: "add", text: b[j] }); j++ }
  return result
}

// ── pending file snapshots for diff capture ─────────────────────────────
// key: `${teeFile}:${stepIndex}` → { targetPath: string, before: string }
const pendingSnapshots = new Map<string, { targetPath: string; before: string }>()

function tryReadFile(path: string): string | null {
  try { return readFileSync(path, "utf8") } catch { return null }
}

/** Parse a tee line, detect replace tool calls, capture diffs. Returns extra SSE messages. */
function processLine(teeFile: string, rawLine: string): string[] {
  const extra: string[] = []
  let evt: any
  try { evt = JSON.parse(rawLine) } catch { return extra }

  if (evt.event !== "step_update" || !evt.step_update) return extra
  const su = evt.step_update
  if (su.step_type !== "tool") return extra

  const toolName = (su.tool_name || su.tool_info?.name || "").toLowerCase()
  if (!toolName.includes("replace")) return extra

  const params = su.tool_info?.parameters || {}
  const targetPath =
    params.TargetFile || params.targetFile || params.file_path || params.filePath || params.file || ""
  if (!targetPath || typeof targetPath !== "string") return extra

  const key = `${teeFile}:${su.step_index}`
  const state = su.state

  if (state === "ACTIVE") {
    // snapshot before
    const before = tryReadFile(targetPath)
    pendingSnapshots.set(key, { targetPath, before: before ?? "" })
  } else if (state === "DONE" || state === "ERROR") {
    // snapshot after, diff
    const pending = pendingSnapshots.get(key)
    if (pending) {
      pendingSnapshots.delete(key)
      const after = tryReadFile(pending.targetPath) ?? ""
      const beforeLines = pending.before.split("\n").length
      const afterLines = after.split("\n").length
      if (beforeLines <= MAX_DIFF_LINES && afterLines <= MAX_DIFF_LINES) {
        const diff = lineDiff(pending.before, after)
        if (diff.some((d) => d.type !== "ctx")) {
          extra.push(JSON.stringify({
            file: teeFile,
            tool_diff: { step_index: su.step_index, target: targetPath, diff },
          }))
        }
      }
    }
  }
  return extra
}

// ── tee file reading ─────────────────────────────────────────────────────
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

function readNewLines(path: string): { lines: string[]; extras: string[] } {
  try {
    const st = statSync(path)
    const size = st.size
    const offset = offsets.get(path) ?? 0
    if (size <= offset) return { lines: [], extras: [] }
    const buf = readFileSync(path)
    const chunk = buf.subarray(offset).toString("utf8")
    offsets.set(path, size)
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0)
    const extras: string[] = []
    for (const line of lines) extras.push(...processLine(path, line))
    return { lines, extras }
  } catch {
    return { lines: [], extras: [] }
  }
}

// ── HTTP server ──────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    })

    // Replay existing files (no diffs possible for replayed events)
    for (const file of scanTeeFiles()) {
      offsets.set(file, 0)
      const { lines, extras } = readNewLines(file)
      if (lines.length > 0) res.write(`data: ${JSON.stringify({ file, lines })}\n\n`)
      // extras from replay won't have valid diffs (files already changed) — skip
    }
    res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`)

    // Poll for new lines every 400ms
    const interval = setInterval(() => {
      for (const file of scanTeeFiles()) {
        const { lines, extras } = readNewLines(file)
        if (lines.length > 0) res.write(`data: ${JSON.stringify({ file, lines })}\n\n`)
        for (const ex of extras) res.write(`data: ${ex}\n\n`)
      }
    }, 400)

    const keepalive = setInterval(() => {
      try { res.write(": keepalive\n\n") } catch { clearInterval(interval); clearInterval(keepalive) }
    }, 15000)

    req.on("close", () => { clearInterval(interval); clearInterval(keepalive) })
    return
  }

  // Serve built app
  const distDir = pjoin(__dirname, "dist")
  if (req.url === "/" || req.url === "/index.html") {
    try {
      const html = readFileSync(pjoin(distDir, "index.html"), "utf8")
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(html)
    } catch {
      res.writeHead(404); res.end("index.html not found — run `bun run build` first")
    }
    return
  }

  if (req.url?.startsWith("/assets/")) {
    try {
      const content = readFileSync(pjoin(distDir, req.url))
      const ext = req.url.split(".").pop()
      const types: Record<string, string> = {
        js: "application/javascript", css: "text/css", svg: "image/svg+xml",
        png: "image/png", ico: "image/x-icon",
      }
      res.writeHead(200, { "Content-Type": types[ext || ""] || "application/octet-stream" })
      res.end(content)
    } catch { res.writeHead(404); res.end("not found") }
    return
  }

  res.writeHead(404); res.end("not found")
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`agy-bridge viewer: http://127.0.0.1:${PORT}`)
  console.log(`watching: ${TEE_DIR}/agy-*.jsonl`)
})
