/**
 * agy-bridge live viewer.
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
import { readdirSync, readFileSync, statSync, watch } from "node:fs"
import { execSync } from "node:child_process"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname as pdirname, join as pjoin } from "node:path"

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

// ── git diff capture for file-modifying tools ─────────────────────────────

function parseGitDiff(output: string): DiffLine[] {
  const lines = output.split("\n")
  const result: DiffLine[] = []
  let inHunk = false
  for (const line of lines) {
    if (line.startsWith("@@")) { inHunk = true; continue }
    if (line.startsWith("diff ") || line.startsWith("index ")) { inHunk = false; continue }
    if (line.startsWith("---") || line.startsWith("+++")) { continue }
    if (!inHunk) continue
    if (line.startsWith("+")) result.push({ type: "add", text: line.slice(1) })
    else if (line.startsWith("-")) result.push({ type: "del", text: line.slice(1) })
    else if (line.startsWith(" ")) result.push({ type: "ctx", text: line.slice(1) })
    else if (line.startsWith("\\") || line.length === 0) continue
  }
  return result
}

function gitDiff(filePath: string): DiffLine[] | null {
  try {
    const dir = dirname(filePath)
    // check if file is tracked by git
    let output = ""
    try {
      output = execSync(`git diff HEAD --unified=3 -- "${filePath}"`, {
        encoding: "utf8", timeout: 2000, cwd: dir, stdio: ["pipe", "pipe", "pipe"],
      })
    } catch { return null }

    if (output.trim()) {
      const diff = parseGitDiff(output)
      return diff.length > 0 ? diff : null
    }
    // untracked or no changes vs HEAD — try untracked file as fully added
    try {
      execSync(`git ls-files --error-unmatch "${filePath}"`, {
        encoding: "utf8", timeout: 2000, cwd: dir, stdio: ["pipe", "pipe", "pipe"],
      })
      // tracked but no diff (already committed?) — skip
      return null
    } catch {
      // untracked file: show entire content as added
      try {
        const content = readFileSync(filePath, "utf8")
        const lines = content.split("\n").filter((_, i, arr) => i < arr.length - 1 || arr[arr.length - 1] !== "")
        if (lines.length > MAX_DIFF_LINES) return null
        return lines.map((l) => ({ type: "add" as const, text: l }))
      } catch { return null }
    }
  } catch {
    return null
  }
}

/** Parse a tee line, detect file-modifying tools, capture git diff on DONE. */
function processLine(teeFile: string, rawLine: string): string[] {
  const extra: string[] = []
  let evt: any
  try { evt = JSON.parse(rawLine) } catch { return extra }

  if (evt.event !== "step_update" || !evt.step_update) return extra
  const su = evt.step_update
  if (su.step_type !== "tool") return extra

  const toolName = (su.tool_name || su.tool_info?.name || "").toLowerCase()
  if (!toolName.includes("replace") && !toolName.includes("write_to_file") && !toolName.includes("sed_file")) return extra

  const params = su.tool_info?.parameters || {}
  const targetPath =
    params.TargetFile || params.targetFile || params.file_path || params.filePath || params.file || ""
  if (!targetPath || typeof targetPath !== "string") return extra

  console.error(`[diff] ${toolName} ${su.state} → ${targetPath}`)

  // Only capture diff on DONE (file has been modified)
  if (su.state !== "DONE" && su.state !== "ERROR") return extra

  const diff = gitDiff(targetPath)
  console.error(`[diff] gitDiff result: ${diff ? diff.length + " lines" : "null"}`)
  if (diff && diff.length > 0) {
    extra.push(JSON.stringify({
      file: teeFile,
      tool_diff: { step_index: su.step_index, target: targetPath, diff },
    }))
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
    console.error(`[tee] ${path}: ${lines.length} new lines (offset ${offset} → ${size})`)
    const extras: string[] = []
    for (const line of lines) extras.push(...processLine(path, line))
    if (extras.length > 0) console.error(`[tee] ${extras.length} extras generated`)
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

    // Watch tee dir for changes (real-time, not polling)
    const sendNew = () => {
      for (const file of scanTeeFiles()) {
        const { lines, extras } = readNewLines(file)
        if (lines.length > 0) res.write(`data: ${JSON.stringify({ file, lines })}\n\n`)
        for (const ex of extras) res.write(`data: ${ex}\n\n`)
      }
    }

    // fs.watch for real-time detection (key for diff capture)
    let watchTimer: NodeJS.Timeout | null = null
    const watcher = watch(TEE_DIR, () => {
      // debounce: batch rapid writes into one read
      if (watchTimer) clearTimeout(watchTimer)
      watchTimer = setTimeout(sendNew, 20)
    })

    // Fallback poll (catches missed events)
    const interval = setInterval(sendNew, 500)

    const keepalive = setInterval(() => {
      try { res.write(": keepalive\n\n") } catch { clearInterval(interval); clearInterval(keepalive) }
    }, 15000)

    req.on("close", () => { clearInterval(interval); clearInterval(keepalive); watcher.close() })
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
