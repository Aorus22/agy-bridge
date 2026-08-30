import { Wrench, Brain, Bot, MessageSquare, Check, X, Loader2 } from "lucide-react"
import { Badge } from "./ui/badge"
import { cn } from "@/lib/utils"
import { fmtDur, fmtTokens } from "@/lib/utils"
import type { Step } from "../types"

function renderMd(text: string): string {
  let h = text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">")
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, __, c) => `<pre class="bg-zinc-900 border border-border rounded p-2 overflow-x-auto my-1 text-xs">${c.replace(/\n$/, "")}</pre>`)
  h = h.replace(/`([^`]+)`/g, '<code class="bg-zinc-900 px-1 py-0.5 rounded text-xs">$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline">$1</a>')
  return h
}

function Params({ params }: { params: Record<string, unknown> | null }) {
  if (!params) return null
  const entries = Object.entries(params)
  if (entries.length === 0) return null
  return (
    <div className="text-xs text-muted-foreground mono mt-0.5">
      {entries.map(([k, v], i) => {
        let val = typeof v === "string" ? v : v == null ? "null" : JSON.stringify(v)
        if (val.length > 120) val = val.slice(0, 120) + "…"
        return <span key={k}>{i > 0 && "  ·  "}<span className="text-zinc-600">{k}:</span> <span className="text-zinc-300">{val}</span></span>
      })}
    </div>
  )
}

export function StepRow({ step }: { step: Step }) {
  const isTool = step.type === "tool"
  const isThinking = step.type === "agent_response" && !step.text.trim()
  const isResponse = step.type === "agent_response" && step.text.trim()
  const isUser = step.type === "user_input"

  const icon = isTool ? <Wrench className="w-3.5 h-3.5" /> : isThinking ? <Brain className="w-3.5 h-3.5" /> : isResponse ? <Bot className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />
  const iconColor = isTool ? "text-blue-400" : isThinking ? "text-purple-400" : isResponse ? "text-green-400" : "text-muted-foreground"
  const labelColor = isTool ? "text-blue-400" : isThinking ? "text-purple-400" : isResponse ? "text-green-400" : "text-muted-foreground"
  const label = isTool ? step.tool : isThinking ? "thinking" : isResponse ? "response" : "prompt received"

  const isActive = step.state === "ACTIVE"
  const isDone = step.state === "DONE"
  const isError = step.state === "ERROR"
  const stateIcon = isActive ? <Loader2 className="w-3 h-3 agy-pulse" /> : isDone ? <Check className="w-3 h-3 text-green-500" /> : isError ? <X className="w-3 h-3 text-destructive" /> : null

  return (
    <div className="relative pl-6 pr-3 py-1 group hover:bg-muted/30">
      {/* left border accent */}
      <div className={cn("absolute left-2 top-0 bottom-0 w-0.5", isTool ? "bg-blue-500/40" : isThinking ? "bg-purple-500/40" : isResponse ? "bg-green-500/40" : "bg-border")} />
      {/* icon */}
      <div className={cn("absolute left-1 top-1 w-4 h-4 flex items-center justify-center bg-background", iconColor)}>{icon}</div>

      <div className="flex items-baseline gap-2">
        <span className={cn("text-xs font-medium", labelColor)}>{label}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {stateIcon}
          {step.duration != null && <span className="text-[10px] text-muted-foreground mono">{fmtDur(step.duration)}</span>}
          {isThinking && step.thinking > 0 && <span className="text-[10px] text-muted-foreground mono">{step.thinking.toLocaleString()} tokens</span>}
        </div>
      </div>

      {/* params for tool */}
      {isTool && <Params params={step.params} />}
      {/* output */}
      {isTool && step.output && <div className="text-xs text-green-500/80 mono mt-0.5">→ {step.output.slice(0, 200)}</div>}
      {/* error */}
      {isTool && step.error && <div className="text-xs text-destructive mono mt-0.5">✗ {step.error}</div>}
      {/* AI response text */}
      {isResponse && (
        <div className="text-sm mt-1 prose-invert" dangerouslySetInnerHTML={{ __html: renderMd(step.text.trim()) }} />
      )}
      {/* per-step tokens */}
      {(isThinking || isResponse) && step.usage && (
        <div className="text-[10px] text-muted-foreground mono mt-0.5">{fmtTokens(step.usage)}</div>
      )}
    </div>
  )
}
