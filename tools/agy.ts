import { tool } from "@opencode-ai/plugin"
import { spawn, spawnSync } from "node:child_process"
import { writeFile, mkdir } from "node:fs/promises"
import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname } from "node:path"
import os from "node:os"
import path from "node:path"

/**
 * Windows workaround: agy's embedded ripgrep handler (grep_handler.go) chokes
 * on paths containing spaces — strconv.Atoi tries to parse the file path as a
 * line number. We create a directory junction from a no-space temp path so
 * agy/ripgrep sees a clean path. Junctions are cleaned up after agy exits.
 */
const _junctions: string[] = []
function noSpacePath(original: string): string {
  if (!original || !original.includes(" ")) return original
  if (process.platform !== "win32") return original
  const base = path.join(os.tmpdir(), "agy-junctions")
  try { mkdirSync(base, { recursive: true }) } catch { /* might already exist */ }
  const junctionDir = path.join(base, `w${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  try {
    spawnSync("cmd", ["/c", "mklink", "/J", junctionDir, original], { stdio: "ignore" })
    if (existsSync(junctionDir)) {
      _junctions.push(junctionDir)
      return junctionDir
    }
  } catch { /* fall through to original */ }
  return original
}
function cleanupJunctions() {
  for (const j of _junctions) {
    try { spawnSync("cmd", ["/c", "rmdir", j], { stdio: "ignore" }) } catch {}
  }
  _junctions.length = 0
}

/**
 * opencode custom tool: delegates to Antigravity (agy) as a blocking one-shot.
 * Self-contained — copy this single file to ~/.config/opencode/tools/ .
 *
 * Uses opencode's context.metadata() for live progress (TUI title updates while
 * agy runs), which MCP does not have — that's why this opencode-specific tool
 * exists alongside the portable MCP server (mcp/server.ts).
 *
 * Core logic also lives in src/core.ts (shared with the MCP server). If you
 * change behavior here, mirror it there.
 */

// agy binary + defaults (mirror mcp-server-google-antigravity/index.js)
const AGY_BIN = process.env.AGY_PATH || "agy"
const DEFAULT_AUTO_APPROVE = (process.env.AGY_AUTO_APPROVE || "true").toLowerCase() !== "false"
const DEFAULT_SANDBOX = (process.env.AGY_SANDBOX || "false").toLowerCase() === "true"
const DEFAULT_PRINT_TIMEOUT = process.env.AGY_PRINT_TIMEOUT || "10m"

// thinking_depth is a prompt prefix (not an agy flag)
const DEPTH_PREFIX = {
  low: "Answer briefly and directly. No need for deep reasoning.",
  high: "Think step by step very carefully before answering.",
}

// One line of agy `--output-format stream-json` (agy 1.1.13+).
interface AgyStreamEvent {
  event?: string
  conversation_id?: string
  result?: {
    conversation_id?: string
    status?: string
    response?: string
    error?: string
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number }
  }
  step_update?: {
    conversation_id?: string
    text_delta?: string
    step_type?: string
    state?: string
  }
  message?: string
  text?: string
  pid?: number
}

function shortTail(s: string, max = 72): string {
  const t = (s || "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  return t.length > max ? "…" + t.slice(t.length - max - 1) : t
}

function extractLastCodeBlock(text: string): string {
  const close = text.lastIndexOf("```")
  if (close === -1) return text
  const open = text.lastIndexOf("```", close - 1)
  if (open === -1) return text
  let inner = text.slice(open + 3, close)
  const nl = inner.indexOf("\n")
  if (nl > -1 && /^[a-zA-Z0-9_+.#-]*$/.test(inner.slice(0, nl).trim())) inner = inner.slice(nl + 1)
  return inner.trim()
}

export default tool({
  description:
    "Delegate a task to Antigravity (Gemini / agy). Blocking one-shot: spawns `agy --print --output-format stream-json`, streams live progress via metadata, and returns the full response when done — no polling. Mirrors the agy CLI flags: add_dirs, auto_approve, sandbox, model, agent, mode, project, conversation_id, etc. Good for web search, large-codebase analysis, file/folder creation, viewing images/PDFs.",
  args: {
    prompt: tool.schema
      .string()
      .describe("The question or task to send to Antigravity (agy)."),
    thinking_depth: tool.schema
      .enum(["low", "high"])
      .optional()
      .describe("low = quick, high = deep reasoning (prepended to the prompt as a prefix)."),
    add_dirs: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Absolute folder paths to add to agy's workspace so it can read/write them."),
    auto_approve: tool.schema
      .boolean()
      .optional()
      .describe("Auto-approve all tool/file permissions (default true). Set false for cautious/read-only runs."),
    new_project: tool.schema
      .boolean()
      .optional()
      .describe("Create a new Antigravity project for this session."),
    model: tool.schema
      .string()
      .optional()
      .describe("Model id (e.g. gemini-3.5-flash)."),
    mode: tool.schema
      .enum(["plan", "accept-edits"])
      .optional()
      .describe("agy execution mode: plan (read-only planning) or accept-edits (auto-apply edits)."),
    agent: tool.schema
      .string()
      .optional()
      .describe("agy agent profile to use for this session."),
    project: tool.schema
      .string()
      .optional()
      .describe("agy project ID or name to run this session under."),
    sandbox: tool.schema
      .boolean()
      .optional()
      .describe("Run agy in a sandbox with terminal restrictions enabled. Safer than auto_approve for untrusted prompts."),
    print_timeout: tool.schema
      .string()
      .optional()
      .describe("agy print timeout, e.g. 10m (default 10m)."),
    conversation_id: tool.schema
      .string()
      .optional()
      .describe("Resume a previous agy conversation by ID (maps to --conversation)."),
    write_to_file: tool.schema
      .string()
      .optional()
      .describe("Absolute output file path; the final response is also written here."),
    extract: tool.schema
      .enum(["last_code_block"])
      .optional()
      .describe("Extract the last fenced code block from the response before returning it."),
    tee_file: tool.schema
      .string()
      .optional()
      .describe("Absolute path to tee agy's raw stream-json output line-by-line (one JSON object per line) so you can `tail -f` it in another terminal to watch the full process live. Defaults to ~/.agy-bridge/agy-<sessionId>.jsonl."),
  },
  async execute(args, context) {
    const effectiveAutoApprove = args.auto_approve == null ? DEFAULT_AUTO_APPROVE : !!args.auto_approve
    const effectiveSandbox = args.sandbox == null ? DEFAULT_SANDBOX : !!args.sandbox
    const printTimeout = args.print_timeout || DEFAULT_PRINT_TIMEOUT
    const prefix = args.thinking_depth ? DEPTH_PREFIX[args.thinking_depth] + "\n\n" : ""
    const fullPrompt = prefix + args.prompt

    // Tee raw stream-json line-by-line to a file so the user can `tail -f` it
    // live in another terminal to watch the full process (every init/step/result
    // event), not just the 1-line title tail in the TUI.
    const teePath = args.tee_file || path.join(os.homedir(), ".agy-bridge", `agy-${context.sessionID.slice(0, 8)}.jsonl`)
    const tee = (line: string) => {
      try {
        appendFileSync(teePath, line + "\n")
      } catch {
        /* best-effort */
      }
    }
    try {
      appendFileSync(teePath, "")
    } catch {
      /* ignore */
    }

    // Write prompt as first event so the viewer can display it
    try {
      appendFileSync(teePath, JSON.stringify({ event: "prompt", text: args.prompt }) + "\n")
    } catch {}

    const agyArgs: string[] = [
      "-p",
      fullPrompt,
      "--output-format",
      "stream-json",
      "--log-file",
      path.join(os.homedir(), ".agy-bridge", `agy-${context.sessionID.slice(0, 8)}.log`),
    ]
    if (effectiveAutoApprove) agyArgs.push("--dangerously-skip-permissions")
    if (effectiveSandbox) agyArgs.push("--sandbox")
    if (args.new_project) agyArgs.push("--new-project")
    if (args.project) agyArgs.push("--project", args.project)
    if (args.agent) agyArgs.push("--agent", args.agent)
    if (args.model) agyArgs.push("--model", args.model)
    if (args.mode) agyArgs.push("--mode", args.mode)
    agyArgs.push("--print-timeout", printTimeout)
    ;(args.add_dirs || []).forEach((d) => {
      if (d) agyArgs.push("--add-dir", noSpacePath(d))
    })
    if (args.conversation_id) agyArgs.push("--conversation", args.conversation_id)

    // Use a no-space cwd so agy's embedded ripgrep doesn't choke on spaces
    const spawnOpts: { stdio: ("ignore" | "pipe")[]; cwd?: string } = { stdio: ["ignore", "pipe", "pipe"] }
    const cwd = process.cwd()
    if (cwd.includes(" ")) {
      const safeCwd = noSpacePath(cwd)
      if (safeCwd !== cwd) spawnOpts.cwd = safeCwd
    }
    const proc = spawn(AGY_BIN, agyArgs, spawnOpts)

    // Write PID event so viewer and server can track and interrupt if needed
    try {
      if (proc.pid) {
        appendFileSync(teePath, JSON.stringify({ event: "process", pid: proc.pid }) + "\n")
      }
    } catch {}

    let conversationId: string | undefined
    let resultText = ""
    let stderr = ""
    let turnError = ""
    let lastTail = ""
    let usage: { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number } | undefined

    // cancel -> kill agy
    const onAbort = () => {
      try {
        proc.kill("SIGTERM")
      } catch {
        /* already dead */
      }
    }
    if (context.abort?.aborted) onAbort()
    else if (context.abort) context.abort.addEventListener("abort", onAbort)

    // throttled live progress via metadata (title is the rendered field)
    const started = Date.now()
    let lastMeta = 0
    const pushMeta = (force = false) => {
      const now = Date.now()
      if (!force && now - lastMeta < 250) return
      lastMeta = now
      const secs = Math.round((now - started) / 1000)
      const tail = shortTail(lastTail)
      context.metadata({
        title: `agy · ${secs}s${tail ? " · " + tail : ""}`,
        metadata: { conversation_id: conversationId, elapsedSeconds: secs },
      })
    }

    let pending = ""
    const handleLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      // tee the raw stream-json line to file (live, per-line flush for tail -f)
      tee(trimmed)
      let evt: AgyStreamEvent | undefined
      if (trimmed.startsWith("{")) {
        try {
          evt = JSON.parse(trimmed) as AgyStreamEvent
        } catch {
          evt = undefined
        }
      }
      if (!evt) {
        // agy fell back to plain text — keep newline so multi-line isn't flattened
        resultText += line + "\n"
        lastTail = line
        pushMeta()
        return
      }
      if (evt.event === "init" && evt.conversation_id && !conversationId) {
        conversationId = evt.conversation_id
        pushMeta(true)
      }
      if (evt.event === "result" && evt.result) {
        const r = evt.result
        if (r.conversation_id && !conversationId) conversationId = r.conversation_id
        if (typeof r.response === "string") {
          resultText = r.response
          lastTail = r.response
        }
        if (r.usage) usage = r.usage
        // sticky: a later SUCCESS must not erase an earlier failure
        if (r.status && r.status !== "SUCCESS") turnError = turnError || r.status
        if (typeof r.error === "string" && r.error.trim()) turnError = r.error.trim()
        pushMeta(true)
      } else if (evt.event === "step_update" && evt.step_update) {
        // streaming text deltas live here (agent_response chunks)
        if (typeof evt.step_update.text_delta === "string") {
          lastTail = evt.step_update.text_delta
          pushMeta()
        }
      } else if (typeof evt.message === "string") {
        lastTail = evt.message
        pushMeta()
      } else if (typeof evt.text === "string") {
        lastTail = evt.text
        pushMeta()
      }
    }

    proc.stdout?.on("data", (data: Buffer) => {
      pending += data.toString()
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      for (const line of lines) handleLine(line)
    })
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    return await new Promise((resolve, reject) => {
      proc.on("close", (code) => {
        cleanupJunctions()
        if (pending) handleLine(pending)
        if (turnError) {
          reject(new Error(turnError))
          return
        }
        if (code !== 0) {
          reject(new Error(stderr || `Antigravity exited with code ${code}`))
          return
        }

        let output = resultText.replace(/\n$/, "")
        if (args.extract === "last_code_block") output = extractLastCodeBlock(output)
        if (args.write_to_file) {
          mkdir(dirname(args.write_to_file), { recursive: true })
            .then(() => writeFile(args.write_to_file!, output, "utf8"))
            .catch(() => {})
        }
        context.metadata({
          title: `agy done${conversationId ? " · " + conversationId.slice(0, 8) : ""}`,
          metadata: { conversation_id: conversationId, tee_file: teePath },
        })
        resolve({
          title: "agy done",
          output,
          metadata: { conversation_id: conversationId, tee_file: teePath, usage },
        })
      })
      proc.on("error", (err) => {
        cleanupJunctions()
        reject(err)
      })
    })
  },
})
