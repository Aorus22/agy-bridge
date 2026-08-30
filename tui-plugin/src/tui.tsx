/** @jsxImportSource @opentui/solid */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createSignal, onCleanup, onMount } from "solid-js"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

const TEE_DIR = process.env.AGY_TEE_DIR || tmpdir()
const TEE_GLOB = process.env.AGY_TEE_GLOB || "agy-*.jsonl"
const POLL_MS = 500
const STALE_MS = 30_000
const MAX_TEXT = 60

interface AgyEvent {
  event?: string
  conversation_id?: string
  init?: { cwd?: string; tools?: string[] }
  step_update?: {
    step_index?: number
    state?: string
    step_type?: string
    text_delta?: string
    tool_name?: string
    tool_info?: {
      name?: string
      parameters?: Record<string, unknown>
      output?: string
      error?: { message?: string }
    }
    duration_seconds?: number
    usage?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number; total_tokens?: number }
  }
  result?: {
    status?: string
    response?: string
    error?: string
    duration_seconds?: number
    num_turns?: number
    usage?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number; total_tokens?: number }
  }
}

interface RunState {
  file: string
  convId?: string
  status: "running" | "done" | "error"
  activity: string
  detail: string
  elapsed: string
  mtime: number
}

function parseEvents(path: string): AgyEvent[] {
  try {
    const raw = readFileSync(path, "utf8")
    const events: AgyEvent[] = []
    for (const line of raw.split("\n")) {
      const t = line.trim()
      if (!t || !t.startsWith("{")) continue
      try { events.push(JSON.parse(t)) } catch {}
    }
    return events
  } catch {
    return []
  }
}

function truncate(s: string, max: number): string {
  if (!s) return s
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > max ? t.slice(0, max - 1) + "…" : t
}

function fmtParams(p?: Record<string, unknown>): string {
  if (!p) return ""
  const entries = Object.entries(p)
  if (entries.length === 0) return ""
  const first = entries[0]
  let v = typeof first[1] === "string" ? first[1] : String(first[1] ?? "")
  return truncate(first[0] + ": " + v, MAX_TEXT)
}

function buildState(file: string): RunState | undefined {
  const events = parseEvents(file)
  if (events.length === 0) return undefined
  const st = statSync(file)
  const mtime = st.mtimeMs
  const now = Date.now()
  const age = now - mtime

  let convId: string | undefined
  let status: RunState["status"] = "running"
  let activity = ""
  let detail = ""
  let elapsed = ""
  let hasResult = false
  let lastStepIndex = -1
  let lastStepType = ""
  let lastToolName = ""
  let lastText = ""
  let lastToolParams: Record<string, unknown> | undefined
  let lastToolError: string | undefined
  let lastDuration: number | undefined

  for (const e of events) {
    if (e.event === "init" && e.conversation_id) convId = e.conversation_id
    if (e.event === "step_update" && e.step_update) {
      const su = e.step_update
      const idx = su.step_index ?? 0
      if (idx >= lastStepIndex) {
        lastStepIndex = idx
        lastStepType = su.step_type || "step"
        lastToolName = su.tool_name || su.tool_info?.name || ""
        lastText = su.text_delta || lastText
        if (su.tool_info?.parameters) lastToolParams = su.tool_info.parameters
        if (su.tool_info?.error?.message) lastToolError = su.tool_info.error.message
        lastDuration = su.duration_seconds
      }
    }
    if (e.event === "result" && e.result) {
      hasResult = true
      if (e.result.conversation_id && !convId) convId = e.result.conversation_id
      if (e.result.status === "SUCCESS") status = "done"
      else if (e.result.status && e.result.status !== "SUCCESS") status = "error"
      if (e.result.error) lastToolError = e.result.error
      lastDuration = e.result.duration_seconds
    }
  }

  if (hasResult) {
    if (status === "error") {
      activity = "✗ error"
      detail = truncate(lastToolError || "", MAX_TEXT)
    } else {
      activity = "✓ done"
    }
  } else if (lastStepType === "tool" && lastToolName) {
    activity = "🔧 " + lastToolName
    detail = fmtParams(lastToolParams)
  } else if (lastStepType === "agent_response" && lastText) {
    activity = "🤖 " + truncate(lastText, MAX_TEXT)
  } else if (lastStepType === "agent_response") {
    activity = "⟡ thinking"
  } else if (lastStepType === "user_input") {
    activity = "📨 prompt"
  } else if (lastStepType) {
    activity = "▸ " + lastStepType
  } else {
    activity = "▸ starting"
  }

  if (lastDuration != null) {
    elapsed = lastDuration < 60 ? Math.round(lastDuration * 10) / 10 + "s" : Math.floor(lastDuration / 60) + "m"
  }

  // stale cleanup: if no result and file not modified in STALE_MS, mark error
  if (!hasResult && age > STALE_MS) status = "error"

  return { file, convId, status, activity, detail, elapsed, mtime }
}

function scanTeeFiles(): string[] {
  try {
    return readdirSync(TEE_DIR)
      .filter((f) => {
        const glob = TEE_GLOB.replace(/\*/g, ".*").replace(/\./g, "\\.")
        return new RegExp("^" + glob + "$").test(f)
      })
      .map((f) => join(TEE_DIR, f))
      .sort()
  } catch {
    return []
  }
}

function SidebarView(props: { api: TuiPluginApi }) {
  const [runs, setRuns] = createSignal<RunState[]>([])

  const poll = () => {
    const files = scanTeeFiles()
    const now = Date.now()
    const states: RunState[] = []
    for (const f of files) {
      try {
        const st = statSync(f)
        if (now - st.mtimeMs > STALE_MS && !existsSync(f)) continue
        const s = buildState(f)
        if (s) {
          // skip runs that are done/error and stale
          if ((s.status === "done" || s.status === "error") && now - s.mtime > STALE_MS) continue
          states.push(s)
        }
      } catch {}
    }
    setRuns(states)
  }

  onMount(() => {
    poll()
    const interval = setInterval(poll, POLL_MS)
    onCleanup(() => clearInterval(interval))
  })

  const theme = props.api.theme.current as typeof props.api.theme.current & {
    secondary?: string
    textMuted?: string
    error?: string
    success?: string
  }
  const muted = theme.textMuted ?? theme.secondary ?? theme.text
  const errorColor = theme.error ?? muted
  const successColor = theme.success ?? theme.text

  const iconFor = (s: RunState["status"]) =>
    s === "done" ? "✓" : s === "error" ? "✗" : "▸"
  const colorFor = (s: RunState["status"]) =>
    s === "done" ? successColor : s === "error" ? errorColor : theme.text

  return (
    <box flexDirection="column" gap={0}>
      <text fg={theme.text}>
        <b>▶ Antigravity</b> ({runs().filter((r) => r.status === "running").length} active)
      </text>
      {runs().length === 0 ? (
        <text fg={muted} wrapMode="none">  no active runs</text>
      ) : (
        runs().map((r) => (
          <box flexDirection="column">
            <text fg={colorFor(r.status)} wrapMode="none">
              {"  " + iconFor(r.status) + " " + r.activity}{r.elapsed ? " (" + r.elapsed + ")" : ""}
            </text>
            {r.detail ? (
              <text fg={muted} wrapMode="none">    {r.detail}</text>
            ) : null}
            {r.convId ? (
              <text fg={muted} wrapMode="none">    {r.convId.slice(0, 8)}</text>
            ) : null}
          </box>
        ))
      )}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 350,
    slots: {
      sidebar_content() {
        return <SidebarView api={api} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "agy-panel",
  tui,
}

export default plugin
