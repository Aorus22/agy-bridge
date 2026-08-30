import { useEffect, useState, useRef } from "react"
import type { AgyEvent, Run, Step, DiffLine } from "../types"

function makeRun(file: string): Run {
  return { file, convId: null, cwd: null, toolCount: 0, perm: null, status: "running", start: Date.now(), steps: new Map(), result: null, promptText: null, pid: null }
}

function handle(run: Run, e: AgyEvent) {
  if (e.event === "process" && typeof e.pid === "number") {
    run.pid = e.pid
  } else if (e.event === "prompt" && e.text) {
    run.promptText = e.text
  } else if (e.event === "init") {
    if (e.conversation_id) run.convId = e.conversation_id
    if (e.init) { run.cwd = e.init.cwd ?? null; run.toolCount = e.init.tools?.length ?? 0; run.perm = e.init.permission_mode ?? null }
  } else if (e.event === "step_update" && e.step_update) {
    const su = e.step_update
    const idx = su.step_index ?? run.steps.size
    let st: Step = run.steps.get(idx) ?? { idx, type: "step", state: "", text: "", tool: "", params: null, output: null, error: null, duration: null, thinking: 0, usage: null }
    if (su.step_type) st.type = su.step_type
    if (su.state) st.state = su.state
    if (su.tool_name) st.tool = su.tool_name
    if (su.tool_info) {
      if (su.tool_info.name) st.tool = su.tool_info.name
      if (su.tool_info.parameters) st.params = su.tool_info.parameters
      if (su.tool_info.output) st.output = su.tool_info.output
      if (su.tool_info.error?.message) st.error = su.tool_info.error.message
    }
    if (su.text_delta) st.text += su.text_delta
    if (su.duration_seconds != null) st.duration = su.duration_seconds
    if (su.usage) { st.usage = su.usage; st.thinking = su.usage.thinking_tokens ?? 0 }
    run.steps.set(idx, st)
  } else if (e.event === "result" && e.result) {
    run.result = e.result
    run.status = e.result.status === "SUCCESS" ? "done" : "error"
  }
}

export function useAgySSE(url = "/events") {
  const [runs, setRuns] = useState<Map<string, Run>>(new Map())
  const runsRef = useRef(runs)
  runsRef.current = runs

  useEffect(() => {
    const es = new EventSource(url)
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === "ready") return
      // tool_diff event (from server-side file snapshot diffing)
      if (msg.file && msg.tool_diff) {
        setRuns(prev => {
          const next = new Map(prev)
          const run = next.get(msg.file)
          if (run) {
            const st = run.steps.get(msg.tool_diff.step_index)
            if (st) st.diff = msg.tool_diff.diff as DiffLine[]
          }
          return next
        })
        return
      }
      if (msg.file && msg.lines) {
        setRuns(prev => {
          const next = new Map(prev)
          let run = next.get(msg.file)
          if (!run) { run = makeRun(msg.file); next.set(msg.file, run) }
          for (const line of msg.lines) {
            try { handle(run, JSON.parse(line)) } catch {}
          }
          return next
        })
      }
    }
    return () => es.close()
  }, [url])

  return runs
}
