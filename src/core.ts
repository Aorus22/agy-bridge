/**
 * Shared core: spawn `agy --print --output-format stream-json`, parse the
 * stream line-by-line, tee to a file, and resolve with the full response.
 *
 * Used by both the opencode custom tool (tools/agy.ts) and the MCP server
 * (mcp/server.ts) so the logic is not duplicated.
 *
 * Framework-agnostic: callers pass an `onProgress` callback to surface live
 * updates (opencode uses context.metadata(), MCP may send progress
 * notifications or ignore it).
 */
import { spawn, type ChildProcess } from "node:child_process"
import { appendFileSync } from "node:fs"
import { writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import os from "node:os"
import path from "node:path"

const AGY_BIN = process.env.AGY_PATH || "agy"
const DEFAULT_AUTO_APPROVE = (process.env.AGY_AUTO_APPROVE || "true").toLowerCase() !== "false"
const DEFAULT_SANDBOX = (process.env.AGY_SANDBOX || "false").toLowerCase() === "true"
const DEFAULT_PRINT_TIMEOUT = process.env.AGY_PRINT_TIMEOUT || "10m"

const DEPTH_PREFIX = {
  low: "Answer briefly and directly. No need for deep reasoning.",
  high: "Think step by step very carefully before answering.",
}

/** One line of agy `--output-format stream-json` (agy 1.1.13+). */
export interface AgyStreamEvent {
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
}

export interface AgyCallArgs {
  prompt: string
  thinking_depth?: "low" | "high"
  add_dirs?: string[]
  auto_approve?: boolean
  new_project?: boolean
  model?: string
  mode?: "plan" | "accept-edits"
  agent?: string
  project?: string
  sandbox?: boolean
  print_timeout?: string
  conversation_id?: string
  write_to_file?: string
  extract?: "last_code_block"
  tee_file?: string
}

export interface AgyProgress {
  conversationId?: string
  tail: string
  elapsedSeconds: number
  /** raw stream-json line, for tee/logging */
  rawLine?: string
}

export interface AgyResult {
  output: string
  conversationId?: string
  teePath: string
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number }
}

function shortTail(s: string, max = 72): string {
  const t = (s || "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  return t.length > max ? "…" + t.slice(t.length - max - 1) : t
}

export function extractLastCodeBlock(text: string): string {
  const close = text.lastIndexOf("```")
  if (close === -1) return text
  const open = text.lastIndexOf("```", close - 1)
  if (open === -1) return text
  let inner = text.slice(open + 3, close)
  const nl = inner.indexOf("\n")
  if (nl > -1 && /^[a-zA-Z0-9_+.#-]*$/.test(inner.slice(0, nl).trim())) inner = inner.slice(nl + 1)
  return inner.trim()
}

/** Build the agy CLI argv for a call. Exported for tests. */
export function buildAgyArgs(args: AgyCallArgs): string[] {
  const effectiveAutoApprove = args.auto_approve == null ? DEFAULT_AUTO_APPROVE : !!args.auto_approve
  const effectiveSandbox = args.sandbox == null ? DEFAULT_SANDBOX : !!args.sandbox
  const printTimeout = args.print_timeout || DEFAULT_PRINT_TIMEOUT
  const prefix = args.thinking_depth ? DEPTH_PREFIX[args.thinking_depth] + "\n\n" : ""
  const fullPrompt = prefix + args.prompt

  const agyArgs: string[] = [
    "-p",
    fullPrompt,
    "--output-format",
    "stream-json",
    "--log-file",
    path.join(os.tmpdir(), `agy-${Date.now().toString(36)}.log`),
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
    if (d) agyArgs.push("--add-dir", d)
  })
  if (args.conversation_id) agyArgs.push("--conversation", args.conversation_id)
  return agyArgs
}

/**
 * Run agy as a blocking one-shot. Resolves with the full response.
 * `onProgress` is called (throttled by the caller's policy) with live updates.
 * `abortSignal`, if provided, kills the agy process on abort.
 */
export function runAgy(
  args: AgyCallArgs,
  opts: {
    sessionId?: string
    onProgress?: (p: AgyProgress) => void
    abortSignal?: AbortSignal
  } = {},
): Promise<AgyResult> {
  const sessionId = opts.sessionId || "core"
  const teePath =
    args.tee_file || path.join(os.tmpdir(), `agy-${sessionId.slice(0, 8)}.jsonl`)

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

  const agyArgs = buildAgyArgs(args)
  const proc: ChildProcess = spawn(AGY_BIN, agyArgs, { stdio: ["ignore", "pipe", "pipe"] })

  let conversationId: string | undefined
  let resultText = ""
  let stderr = ""
  let turnError = ""
  let lastTail = ""
  let usage: AgyResult["usage"]
  const started = Date.now()

  // throttle progress to ~4x/sec
  let lastEmit = 0
  const maybeEmit = (force = false) => {
    const now = Date.now()
    if (!force && now - lastEmit < 250) return
    lastEmit = now
    opts.onProgress?.({
      conversationId,
      tail: shortTail(lastTail),
      elapsedSeconds: Math.round((now - started) / 1000),
    })
  }

  const onAbort = () => {
    try {
      proc.kill("SIGTERM")
    } catch {
      /* already dead */
    }
  }
  if (opts.abortSignal?.aborted) onAbort()
  else if (opts.abortSignal) opts.abortSignal.addEventListener("abort", onAbort, { once: true })

  let pending = ""
  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
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
      resultText += line + "\n"
      lastTail = line
      maybeEmit()
      return
    }
    if (evt.event === "init" && evt.conversation_id && !conversationId) {
      conversationId = evt.conversation_id
      maybeEmit(true)
    }
    if (evt.event === "result" && evt.result) {
      const r = evt.result
      if (r.conversation_id && !conversationId) conversationId = r.conversation_id
      if (typeof r.response === "string") {
        resultText = r.response
        lastTail = r.response
      }
      if (r.usage) usage = r.usage
      if (r.status && r.status !== "SUCCESS") turnError = turnError || r.status
      if (typeof r.error === "string" && r.error.trim()) turnError = r.error.trim()
      maybeEmit(true)
    } else if (evt.event === "step_update" && evt.step_update) {
      if (typeof evt.step_update.text_delta === "string") {
        lastTail = evt.step_update.text_delta
        maybeEmit()
      }
    } else if (typeof evt.message === "string") {
      lastTail = evt.message
      maybeEmit()
    } else if (typeof evt.text === "string") {
      lastTail = evt.text
      maybeEmit()
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

  return new Promise<AgyResult>((resolve, reject) => {
    proc.on("close", (code) => {
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
      resolve({ output, conversationId, teePath, usage })
    })
    proc.on("error", (err) => reject(err))
  })
}

export { AGY_BIN, DEFAULT_AUTO_APPROVE, DEFAULT_SANDBOX, DEFAULT_PRINT_TIMEOUT, DEPTH_PREFIX }
