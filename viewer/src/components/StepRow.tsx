import {
  Wrench,
  Terminal,
  FileEdit,
  FilePlus,
  FileText,
  Search,
  Globe,
  Brain,
  Check,
  X,
  Loader2,
} from "lucide-react"
import { Card } from "./ui/card"
import { fmtDur, fmtTokens } from "@/lib/utils"
import type { Step } from "../types"

function getToolIcon(toolName: string) {
  const name = (toolName || "").toLowerCase()
  if (
    name.includes("command") ||
    name.includes("terminal") ||
    name.includes("bash") ||
    name.includes("shell") ||
    name.includes("exec")
  ) {
    return Terminal
  }
  if (name.includes("write") || name.includes("create")) {
    return FilePlus
  }
  if (name.includes("edit") || name.includes("replace") || name.includes("patch")) {
    return FileEdit
  }
  if (name.includes("view") || name.includes("read") || name.includes("cat")) {
    return FileText
  }
  if (name.includes("grep") || name.includes("search") || name.includes("find")) {
    return Search
  }
  if (
    name.includes("url") ||
    name.includes("fetch") ||
    name.includes("http") ||
    name.includes("web") ||
    name.includes("browser")
  ) {
    return Globe
  }
  return Wrench
}

function Params({ params }: { params: Record<string, unknown> | null }) {
  if (!params) return null
  const entries = Object.entries(params)
  if (entries.length === 0) return null
  return (
    <div className="font-mono text-[11px] leading-relaxed break-all">
      {entries.map(([k, v], i) => {
        let val = typeof v === "string" ? v : v == null ? "null" : JSON.stringify(v)
        if (val.length > 120) val = val.slice(0, 120) + "…"
        return (
          <span key={k}>
            {i > 0 && <span className="text-muted-foreground/30 mx-1.5">·</span>}
            <span className="text-muted-foreground/60">{k}=</span>
            <span className="text-foreground/75">{val}</span>
          </span>
        )
      })}
    </div>
  )
}

function renderMd(text: string): string {
  let h = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  h = h.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, __, code) =>
      `<pre class="bg-card border border-border rounded-md p-2.5 overflow-x-auto my-2 text-xs font-mono text-foreground/90"><code>${code.replace(/\n$/, "")}</code></pre>`
  )
  h = h.replace(
    /`([^`]+)`/g,
    '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono border border-border/40 text-foreground/90">$1</code>'
  )
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em class="text-foreground/80">$2</em>')
  h = h.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-primary hover:underline">$1</a>'
  )
  return h
}

export function StepRow({ step }: { step: Step }) {
  const isTool = step.type === "tool"
  const isThinking = step.type === "agent_response" && !step.text.trim()
  const isResponse = step.type === "agent_response" && !!step.text.trim()
  const isUser = step.type === "user_input"
  const isActive = step.state === "ACTIVE"
  const isDone = step.state === "DONE"
  const isError = step.state === "ERROR"

  // ── user input: minimal ──
  if (isUser) {
    return <div className="px-4 py-1 text-xs font-mono text-muted-foreground/40">prompt received</div>
  }

  // ── thinking: subtle line with icon ──
  if (isThinking) {
    return (
      <div className="px-4 py-1 flex items-center gap-2 text-xs text-muted-foreground/50">
        <Brain className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
        <span>thinking</span>
        {step.thinking > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground/40">
            {step.thinking.toLocaleString()} tokens
          </span>
        )}
        {step.duration != null && (
          <span className="font-mono text-[11px] text-muted-foreground/40">
            {fmtDur(step.duration)}
          </span>
        )}
      </div>
    )
  }

  // ── tool call: compact card with icon & status ──
  if (isTool) {
    const ToolIcon = getToolIcon(step.tool)
    const hasParams = step.params && Object.keys(step.params).length > 0

    return (
      <div className="px-4 py-1.5">
        <Card className="bg-card/70 border-border/80 text-xs">
          <div className="flex items-center gap-2 px-3 py-2">
            <ToolIcon className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
            <span className="font-mono text-xs text-foreground/90 font-medium">{step.tool || "tool"}</span>
            <div className="ml-auto flex items-center gap-2">
              {step.duration != null && (
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {fmtDur(step.duration)}
                </span>
              )}
              {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />}
              {isDone && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              {isError && <X className="w-3.5 h-3.5 text-red-400 shrink-0" />}
            </div>
          </div>
          {(hasParams || step.output || step.error) && (
            <div className="px-3 pb-2.5 pt-0 space-y-1.5">
              {hasParams && <Params params={step.params} />}
              {step.output && (
                <div className="font-mono text-[11px] text-emerald-400/80 bg-emerald-950/20 border border-emerald-900/30 rounded px-2 py-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                  {step.output.length > 400 ? step.output.slice(0, 400) + "…" : step.output}
                </div>
              )}
              {step.error && (
                <div className="font-mono text-[11px] text-red-400/90 bg-red-950/20 border border-red-900/30 rounded px-2 py-1 whitespace-pre-wrap break-words">
                  {step.error}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    )
  }

  // ── AI response: clean markdown text ──
  if (isResponse) {
    return (
      <div className="px-4 py-2 space-y-1">
        <div
          className="text-sm leading-relaxed text-foreground/90 break-words whitespace-pre-wrap font-sans"
          dangerouslySetInnerHTML={{ __html: renderMd(step.text.trim()) }}
        />
        {(step.duration != null || step.usage) && (
          <div className="flex items-center gap-3 pt-0.5 text-[10px] text-muted-foreground/50 font-mono">
            {step.duration != null && <span>{fmtDur(step.duration)}</span>}
            {step.usage && <span>{fmtTokens(step.usage)}</span>}
          </div>
        )}
      </div>
    )
  }

  return null
}
