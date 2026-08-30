import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"

/**
 * opencode custom tool: replays an agy `tee_file` (raw stream-json NDJSON) and
 * renders it as a subagent-style transcript. Reads a file written by the `agy`
 * tool's `tee_file` argument — call `agy_view` after `agy` finishes to inspect
 * the full process (init header, per-step reasoning/text, final result + tokens).
 *
 * Self-contained — copy this single file to ~/.config/opencode/tools/ .
 */

// One line of agy `--output-format stream-json` (agy 1.1.13+).
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

interface AgyUsage {
  input_tokens?: number
  output_tokens?: number
  thinking_tokens?: number
  cache_read_tokens?: number
  total_tokens?: number
}

interface Step {
  index: number
  type: string
  state?: string
  text: string
  duration?: number
  usage?: AgyUsage
}

function fmtTokens(u?: AgyUsage): string {
  if (!u) return ""
  const parts: string[] = []
  if (u.input_tokens) parts.push(`▲ ${u.input_tokens.toLocaleString()} in`)
  if (u.output_tokens) parts.push(`▼ ${u.output_tokens.toLocaleString()} out`)
  if (u.thinking_tokens) parts.push(`✦ ${u.thinking_tokens.toLocaleString()} thinking`)
  if (u.total_tokens) parts.push(`= ${u.total_tokens.toLocaleString()} total`)
  return parts.join("   ")
}

function truncate(s: string, max: number): string {
  if (!s) return s
  if (s.length <= max) return s
  return s.slice(0, max) + "\n  … [truncated " + (s.length - max).toLocaleString() + " chars]"
}

function fmtDur(s?: number): string {
  if (s == null) return ""
  return s < 1 ? s.toFixed(2) + "s" : Math.round(s * 10) / 10 + "s"
}

function parseTeeFile(path: string): AgyStreamEvent[] {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch (e) {
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
  const W = 56

  // ── header ──
  out.push("╭─ agy (Gemini) " + "─".repeat(Math.max(0, W - 15)))
  if (convId) out.push(`│ conversation: ${convId}`)
  if (init?.cwd) out.push(`│ workspace:   ${init.cwd}`)
  if (init?.tools) {
    const names = init.tools
    const preview = names.slice(0, 4).join(", ") + (names.length > 4 ? `, …` : "")
    out.push(`│ tools:       ${names.length} available (${preview})`)
  }
  if (init?.permission_mode) out.push(`│ permission:  ${init.permission_mode}`)
  out.push("╰" + "─".repeat(W + 1))
  out.push("")

  // ── steps ──
  const sorted = [...steps.values()].sort((a, b) => a.index - b.index)
  for (const s of sorted) {
    const label = `step ${s.index + 1} · ${s.type}`
    const dur = fmtDur(s.duration).padStart(6)
    out.push(`◇ ${label.padEnd(W - dur.length - 3)}${dur}`)
    const text = truncate(s.text.trim(), maxStepText)
    if (text) {
      for (const ln of text.split("\n")) out.push("  " + ln)
    }
    if (s.usage) out.push(`  ${fmtTokens(s.usage)}`)
    out.push("")
  }

  // ── result ──
  if (result) {
    const status = result.status || "unknown"
    const mark = status === "SUCCESS" ? "✓" : "✗"
    const line1 = `${mark} result · ${status}`
    const meta = `${fmtDur(result.duration_seconds)} · ${result.num_turns ?? 0} turn${result.num_turns === 1 ? "" : "s"}`
    out.push(`${line1.padEnd(W - meta.length - 3)}${meta}`)
    if (result.usage) out.push(`  ${fmtTokens(result.usage)}`)
    if (result.error) {
      out.push("  error: " + truncate(result.error, maxStepText))
    }
    out.push("")
    if (typeof result.response === "string" && result.response.trim()) {
      out.push("──── final response " + "─".repeat(Math.max(0, W - 18)))
      out.push(result.response.replace(/\n$/, ""))
    }
  } else {
    out.push("⋯ still running — no result event yet (agy may still be in progress)")
  }

  return out.join("\n")
}

export default tool({
  description:
    "Replay an agy run by reading its tee_file (raw stream-json NDJSON written by the `agy` tool's `tee_file` argument) and rendering it as a subagent-style transcript: init header (conversation, workspace, tools, permission), per-step reasoning/text with durations, and the final result with token usage. Use it to inspect the full process of an agy run after it finishes. Pass the same tee_file path you gave to `agy`.",
  args: {
    tee_file: tool.schema
      .string()
      .describe("Absolute path to the agy tee_file (the raw stream-json NDJSON written by the `agy` tool's tee_file argument)."),
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
