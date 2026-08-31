import { useRef, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { ScrollArea } from "./ui/scroll-area"
import { Badge } from "./ui/badge"
import { StepRow } from "./StepRow"
import { fmtDur, fmtTokens, shortPath } from "@/lib/utils"
import type { Run } from "../types"

function renderMd(text: string): string {
  let h = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  h = h.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, __, c) =>
      `<pre class="bg-black/40 border border-white/10 rounded-lg p-2.5 overflow-x-auto max-w-full my-2 text-xs font-mono text-foreground/90">${c.replace(/\n$/, "")}</pre>`
  )
  h = h.replace(
    /`([^`]+)`/g,
    '<code class="bg-white/10 border border-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-foreground/90">$1</code>'
  )
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong class=\"text-foreground font-semibold\">$1</strong>")
  h = h.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-400 hover:underline break-all">$1</a>'
  )
  h = h.replace(/\n/g, "<br/>")
  return h
}

export function Transcript({ run }: { run: Run | null }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevStepCount = useRef(0)

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (!run) return
    const currentStepCount = run.steps.size
    if (currentStepCount > prevStepCount.current) {
      prevStepCount.current = currentStepCount
      // scroll the ScrollArea viewport to bottom
      const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]")
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    }
  }, [run])

  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-xs animate-fade-in font-mono">
        Select a session
      </div>
    )
  }

  const steps = Array.from(run.steps.values()).sort((a, b) => a.idx - b.idx)
  const elapsed =
    run.result?.duration_seconds != null
      ? fmtDur(run.result.duration_seconds)
      : run.status === "running"
      ? Math.round((Date.now() - run.start) / 1000) + "s"
      : ""

  const isRunning = run.status === "running"

  return (
    <div key={run.file} className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent max-w-full animate-fade-in">
      {/* Header: Conv ID + cwd (truncated) + elapsed (Static blurred panel) */}
      <div className="flex items-center justify-between px-4 py-2.5 glass-header text-xs min-h-[41px] min-w-0 max-w-full shrink-0">
        <div className="flex items-center gap-2 truncate min-w-0 flex-1 mr-2">
          {isRunning && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
          )}
          <span className="text-foreground/90 font-medium truncate min-w-0 font-mono text-xs" title={run.convId || run.file}>
            {run.convId || shortPath(run.file)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground/70 text-xs shrink-0">
          {run.cwd && (
            <span className="truncate max-w-[120px] sm:max-w-[200px]" title={run.cwd}>
              {shortPath(run.cwd)}
            </span>
          )}
          {elapsed && <span className="shrink-0 font-mono tabular-nums">{elapsed}</span>}
        </div>
      </div>

      {/* Steps */}
      <ScrollArea ref={scrollRef} className="flex-1 min-w-0 max-w-full">
        <div className="py-3 space-y-1.5 min-w-0 max-w-full overflow-hidden">
          {/* Prompt — inside scroll area, scrolls with content (Flat translucent, no blur) */}
          {run.promptText && (
            <div className="mx-4 my-1.5 p-3.5 glass-card rounded-xl animate-fade-in">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1.5 select-none">
                prompt
              </div>
              <div
                className="text-sm text-foreground/90 break-words leading-relaxed font-sans"
                dangerouslySetInnerHTML={{ __html: renderMd(run.promptText) }}
              />
            </div>
          )}
          {steps.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-xs animate-fade-in gap-2">
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
              <span>Waiting for events…</span>
            </div>
          )}
          {steps.map((s) => (
            <StepRow key={s.idx} step={s} />
          ))}
        </div>
      </ScrollArea>

      {/* Result Footer: Status badge + duration + turns + token breakdown (Static blurred panel) */}
      {run.result && (
        <div className="px-4 py-3 glass-footer space-y-2.5 min-w-0 max-w-full overflow-hidden shrink-0 animate-slide-up">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <Badge
              variant={run.result.status === "SUCCESS" ? "success" : "error"}
              className="shrink-0 transition-transform hover:scale-105"
            >
              {run.result.status || "COMPLETED"}
            </Badge>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 shrink-0">
              {run.result.duration_seconds != null && (
                <span className="font-mono tabular-nums">{fmtDur(run.result.duration_seconds)}</span>
              )}
              {run.result.num_turns != null && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    {run.result.num_turns} turn{run.result.num_turns === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>

          {run.result.usage && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground/60 min-w-0 break-words">
              {fmtTokens(run.result.usage)
                .split("  ")
                .filter(Boolean)
                .map((t, i) => (
                  <span
                    key={i}
                    className="break-all px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.07] transition-all"
                  >
                    {t}
                  </span>
                ))}
            </div>
          )}

          {run.result.error && (
            <div
              className="text-xs text-red-300 bg-red-950/30 border border-red-500/25 rounded-lg px-3 py-2 break-words min-w-0 max-w-full overflow-x-auto animate-expand-down shadow-xs"
              dangerouslySetInnerHTML={{ __html: renderMd(run.result.error) }}
            />
          )}
        </div>
      )}
    </div>
  )
}
