import { Card } from "./ui/card"
import { Badge } from "./ui/badge"
import { fmtDur, fmtTokens } from "@/lib/utils"
import type { Step } from "../types"

function Params({ params }: { params: Record<string, unknown> | null }) {
  if (!params) return null
  const entries = Object.entries(params)
  if (entries.length === 0) return null
  return (
    <div className="text-[11px] text-muted-foreground font-mono mt-1 leading-relaxed">
      {entries.map(([k, v], i) => {
        let val = typeof v === "string" ? v : v == null ? "null" : JSON.stringify(v)
        if (val.length > 100) val = val.slice(0, 100) + "…"
        return (
          <span key={k}>
            {i > 0 && " · "}
            <span className="text-muted-foreground/60">{k}</span>{" "}
            <span className="text-foreground/80">{val}</span>
          </span>
        )
      })}
    </div>
  )
}

function renderMd(text: string): string {
  let h = text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">")
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, __, c) => `<pre class="bg-zinc-900/60 border border-border rounded-md p-2.5 overflow-x-auto my-2 text-xs font-mono">${c.replace(/\n$/, "")}</pre>`)
  h = h.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline">$1</a>')
  return h
}

export function StepRow({ step }: { step: Step }) {
  const isTool = step.type === "tool"
  const isThinking = step.type === "agent_response" && !step.text.trim()
  const isResponse = step.type === "agent_response" && step.text.trim()
  const isUser = step.type === "user_input"
  const isActive = step.state === "ACTIVE"
  const isDone = step.state === "DONE"
  const isError = step.state === "ERROR"

  // ── user input: minimal ──
  if (isUser) {
    return <div className="px-3 py-1 text-xs text-muted-foreground/60">prompt received</div>
  }

  // ── thinking: one subtle line ──
  if (isThinking) {
    return (
      <div className="px-3 py-1 text-xs text-muted-foreground/50 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-500/40" />
        <span>thinking</span>
        {step.thinking > 0 && <span className="font-mono">{step.thinking.toLocaleString()} tokens</span>}
        {step.duration != null && <span className="font-mono">{fmtDur(step.duration)}</span>}
      </div>
    )
  }

  // ── tool call: compact Card ──
  if (isTool) {
    return (
      <div className="px-3 py-1.5">
        <Card className="py-0">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="font-mono text-xs text-blue-400">{step.tool}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 agy-pulse" />}
              {isDone && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              {isError && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
              {step.duration != null && <span className="font-mono text-[10px] text-muted-foreground">{fmtDur(step.duration)}</span>}
            </span>
          </div>
          <div className="px-3 pb-2">
            <Params params={step.params} />
            {step.output && <div className="text-[11px] text-emerald-500/70 font-mono mt-1">→ {step.output.slice(0, 200)}</div>}
            {step.error && <div className="text-[11px] text-red-400 font-mono mt-1">✗ {step.error}</div>}
          </div>
        </Card>
      </div>
    )
  }

  // ── AI response: clean text ──
  if (isResponse) {
    return (
      <div className="px-3 py-1.5">
        <div className="text-sm leading-relaxed prose-invert" dangerouslySetInnerHTML={{ __html: renderMd(step.text.trim()) }} />
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/60 font-mono">
          {step.duration != null && <span>{fmtDur(step.duration)}</span>}
          {step.usage && <span>{fmtTokens(step.usage)}</span>}
        </div>
      </div>
    )
  }

  return null
}
