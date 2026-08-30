import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"

/**
 * opencode custom tool: replays an agy `tee_file` (raw stream-json NDJSON) and
 * renders it as a detailed subagent-style transcript — showing what the AI
 * thought, said, and which tools it called (with parameters, outputs, errors).
 *
 * Self-contained — copy this single file to ~/.config/opencode/tools/ .
 */

interface AgyUsage {
  input_tokens?: number
  output_tokens?: number
  thinking_tokens?: number
  cache_read_tokens?: number
  total_tokens?: number
}

interface ToolInfo {
  name?: string
  parameters?: Record<string, unknown>
  output?: string
  error?: { type?: string; message?: string }
}

interface AgyStreamEvent {
  event?: string
  conversation_id?: string
  init?: {
    cwd?: string
    tools?: string[]
    permission_mode?: string
  }
  step_update?: {
    conversation_id?: string
    step_index?: number
    state?: string
    step_type?: string
    text_delta?: string
    tool_name?: string
    tool_info?: ToolInfo
    duration_seconds?: number
    usage?: AgyUsage
  }
  result?: {
    conversation_id?: string
    status?: string
    response?: string
    error?: string
    duration_seconds?: number
    num_turns?: number
    usage?: AgyUsage
  }
}

interface Step {
  index: number
  type: string
  state?: string
  text: string
  toolName?: string
  toolParams?: Record<string, unknown>
  toolOutput?: string
  toolError?: { type?: string; message?: string }
  duration?: number
  usage?: AgyUsage
}

function fmtTokens(u?: AgyUsage): string {
  if (!u) return ""
  const parts: string[] = []
  if (u.input_tokens) parts.push(`${u.input_tokens.toLocaleString()} in`)
  if (u.output_tokens) parts.push(`${u.output_tokens.toLocaleString()} out`)
  if (u.thinking_tokens) parts.push(`${u.thinking_tokens.toLocaleString()} thinking`)
  if (u.cache_read_tokens) parts.push(`${u.cache_read_tokens.toLocaleString()} cached`)
  return parts.join(" · ")
}

function truncate(s: string, max: number): string {
  if (!s) return s
  if (max <= 0) return s
  if (s.length <= max) return s
  return s.slice(0, max) + "\n  … [+" + (s.length - max).toLocaleString() + " chars]"
}

function fmtDur(s?: number): string {
  if (s == null) return ""
  if (s < 1) return s.toFixed(2) + "s"
  if (s < 60) return Math.round(s * 10) / 10 + "s"
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m${sec}s`
}

function fmtParams(params?: Record<string, unknown>): string {
  if (!params) return ""
  const entries = Object.entries(params)
  if (entries.length === 0) return ""
  return entries
    .map(([k, v]) => {
      let val: string
      if (typeof v === "string") val = v
      else if (v == null) val = "null"
      else val = JSON.stringify(v)
      if (val.length > 200) val = val.slice(0, 200) + "…"
      return `   ${k}: ${val}`
    })
    .join("\n")
}

function parseTeeFile(path: string): AgyStreamEvent[] {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    throw new Error(
      `Cannot read tee_file at ${path}. Check the path is absolute and that the agy run has started writing to it.`,
    )
  }
  const events: AgyStreamEvent[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t || !t.startsWith("{")) continue
    try {
      events.push(JSON.parse(t) as AgyStreamEvent)
    } catch {
      /* skip malformed */
    }
  }
  if (events.length === 0) {
    throw new Error(`No stream-json events found in ${path}. The agy run may not have started, or this is not an agy tee_file.`)
  }
  return events
}

function render(events: AgyStreamEvent[], maxStepText: number): string {
  let convId: string | undefined
  let init: AgyStreamEvent["init"]
  const steps = new Map<number, Step>()
  let result: AgyStreamEvent["result"]

  for (const e of events) {
    if (e.event === "init") {
      if (e.conversation_id) convId = e.conversation_id
      if (e.init) init = e.init
    } else if (e.event === "step_update" && e.step_update) {
      const su = e.step_update
      const idx = su.step_index ?? steps.size
      const st = steps.get(idx) || { index: idx, type: su.step_type || "step", text: "" }
      if (su.step_type) st.type = su.step_type
      if (su.state) st.state = su.state
      if (typeof su.text_delta === "string") st.text += su.text_delta
      if (su.tool_name) st.toolName = su.tool_name
      if (su.tool_info) {
        if (su.tool_info.name) st.toolName = su.tool_info.name
        if (su.tool_info.parameters) st.toolParams = su.tool_info.parameters
        if (su.tool_info.output) st.toolOutput = su.tool_info.output
        if (su.tool_info.error) st.toolError = su.tool_info.error
      }
      if (su.duration_seconds != null) st.duration = su.duration_seconds
      if (su.usage) st.usage = su.usage
      if (su.conversation_id && !convId) convId = su.conversation_id
      steps.set(idx, st)
    } else if (e.event === "result" && e.result) {
      result = e.result
      if (e.result.conversation_id && !convId) convId = e.result.conversation_id
    }
  }

  const out: string[] = []
  const W = 60

  // ── header ──
  out.push("╭─ agy (Gemini) " + "─".repeat(Math.max(0, W - 15)))
  if (convId) out.push(`│ conversation: ${convId}`)
  if (init?.cwd) out.push(`│ workspace:   ${init.cwd}`)
  if (init?.tools) out.push(`│ tools:       ${init.tools.length} available`)
  if (init?.permission_mode) out.push(`│ permission:  ${init.permission_mode}`)
  out.push("╰" + "─".repeat(W + 1))
  out.push("")

  // ── steps ──
  const sorted = [...steps.values()].sort((a, b) => a.index - b.index)
  for (const s of sorted) {
    const dur = fmtDur(s.duration)
    const durPadded = dur ? dur.padStart(7) : ""

    if (s.type === "user_input") {
      out.push(`📨 prompt received`)
      out.push("")
      continue
    }

    if (s.type === "agent_response") {
      const thinking = s.usage?.thinking_tokens ?? 0
      const hasText = s.text.trim().length > 0
      const label = hasText ? "🤖 response" : thinking > 0 ? "⟡ thinking" : "🤖 response"
      const tokens = fmtTokens(s.usage)
      const meta = [dur, tokens].filter(Boolean).join(" · ")
      out.push(`${label.padEnd(W - meta.length - 3)}${meta}`)
      if (hasText) {
        const text = truncate(s.text.trim(), maxStepText)
        for (const ln of text.split("\n")) out.push("  " + ln)
      } else if (thinking > 0) {
        out.push(`  (${thinking.toLocaleString()} thinking tokens — agy doesn't stream thinking text)`)
      }
      out.push("")
      continue
    }

    if (s.type === "tool") {
      const isError = s.state === "ERROR"
      const isDone = s.state === "DONE"
      const icon = isError ? "✗" : isDone ? "✓" : "▸"
      const toolLabel = s.toolName || "tool"
      const meta = [dur, icon].filter(Boolean).join(" ")
      out.push(`🔧 ${toolLabel}`.padEnd(W - meta.length - 3) + meta)
      const params = fmtParams(s.toolParams)
      if (params) {
        for (const ln of params.split("\n")) out.push(ln)
      }
      if (s.toolOutput) {
        out.push(`   → ${truncate(s.toolOutput, maxStepText)}`)
      }
      if (s.toolError) {
        out.push(`   ✗ ${truncate(s.toolError.message || "error", maxStepText)}`)
      }
      out.push("")
      continue
    }

    // unknown step type
    const meta = [dur, fmtTokens(s.usage)].filter(Boolean).join(" · ")
    out.push(`step ${s.index + 1} · ${s.type}`.padEnd(W - meta.length - 3) + meta)
    if (s.text.trim()) {
      for (const ln of truncate(s.text.trim(), maxStepText).split("\n")) out.push("  " + ln)
    }
    out.push("")
  }

  // ── result ──
  if (result) {
    const status = result.status || "unknown"
    const mark = status === "SUCCESS" ? "✓" : "✗"
    const meta = `${fmtDur(result.duration_seconds)} · ${result.num_turns ?? 0} turn${result.num_turns === 1 ? "" : "s"}`
    out.push(`${mark} result · ${status}`.padEnd(W - meta.length - 3) + meta)
    const totUsage = result.usage
    if (totUsage) {
      const parts: string[] = []
      if (totUsage.input_tokens) parts.push(`▲ ${totUsage.input_tokens.toLocaleString()} in`)
      if (totUsage.output_tokens) parts.push(`▼ ${totUsage.output_tokens.toLocaleString()} out`)
      if (totUsage.thinking_tokens) parts.push(`✦ ${totUsage.thinking_tokens.toLocaleString()} thinking`)
      if (totUsage.cache_read_tokens) parts.push(`♻ ${totUsage.cache_read_tokens.toLocaleString()} cached`)
      if (totUsage.total_tokens) parts.push(`= ${totUsage.total_tokens.toLocaleString()} total`)
      out.push("  " + parts.join("   "))
    }
    if (result.error) {
      out.push("  error: " + truncate(result.error, maxStepText))
    }
    out.push("")
  } else {
    out.push("⋯ still running — no result event yet (agy may still be in progress)")
    out.push("")
  }

  return out.join("\n")
}

export default tool({
  description:
    "Replay an agy run by reading its tee_file (raw stream-json NDJSON written by the `agy` tool's `tee_file` argument) and rendering it as a detailed subagent-style transcript. Shows: init header (conversation, workspace, tools, permission), every AI thinking/response step with token usage, every tool call with its name/parameters/output/error, and the final result with total tokens and duration. Use it to inspect the full process of an agy run. Pass the same tee_file path you gave to `agy`.",
  args: {
    tee_file: tool.schema
      .string()
      .describe("Absolute path to the agy tee_file (raw stream-json NDJSON written by the `agy` tool's tee_file argument)."),
    raw: tool.schema
      .boolean()
      .optional()
      .describe("If true, return the raw stream-json lines instead of the formatted transcript (for debugging)."),
    max_step_text: tool.schema
      .number()
      .optional()
      .describe("Max chars of text to show per step before truncating (default 4000). Set 0 to disable truncation."),
  },
  async execute(args, context) {
    const events = parseTeeFile(args.tee_file)
    context.metadata({
      title: `agy_view · ${events.length} events`,
      metadata: { tee_file: args.tee_file },
    })
    if (args.raw) {
      const lines = events.map((e) => JSON.stringify(e))
      return {
        title: "agy_view (raw)",
        output: `${events.length} events\n` + lines.join("\n"),
      }
    }
    const maxText = args.max_step_text == null ? 4000 : args.max_step_text
    const transcript = render(events, maxText)
    return {
      title: "agy_view",
      output: transcript,
    }
  },
})
