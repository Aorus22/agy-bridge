import { ScrollArea } from "./ui/scroll-area"
import { Badge } from "./ui/badge"
import { StepRow } from "./StepRow"
import { fmtDur, fmtTokens, shortPath } from "@/lib/utils"
import type { Run } from "../types"

function renderMd(text: string): string {
  let h = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, __, c) => `<pre class="bg-muted/40 border border-border rounded-md p-2 overflow-x-auto max-w-full my-1.5 text-xs">${c.replace(/\n$/, "")}</pre>`)
  h = h.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline">$1</a>')
  h = h.replace(/\n/g, "<br/>")
  return h
}

export function Transcript({ run }: { run: Run | null }) {
  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-xs animate-fade-in">
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
    <div key={run.file} className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background max-w-full animate-fade-in">
      {/* Header: Conv ID + cwd (truncated) + elapsed */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border text-xs min-h-[41px] min-w-0 max-w-full bg-card/20 backdrop-blur-xs">
        <div className="flex items-center gap-2 truncate min-w-0 flex-1 mr-2">
          {isRunning && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          )}
          <span className="text-foreground font-medium truncate min-w-0 font-mono text-xs" title={run.convId || run.file}>
            {run.convId || shortPath(run.file)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground/60 text-xs shrink-0">
          {run.cwd && (
            <span className="truncate max-w-[120px] sm:max-w-[200px]" title={run.cwd}>
              {shortPath(run.cwd)}
            </span>
          )}
          {elapsed && <span className="shrink-0 font-mono tabular-nums">{elapsed}</span>}
        </div>
      </div>

      {/* Steps */}
      <ScrollArea className="flex-1 min-w-0 max-w-full">
        <div className="py-2.5 space-y-1 min-w-0 max-w-full overflow-hidden">
          {steps.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-xs animate-fade-in gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 agy-pulse" />
              <span>Waiting for events…</span>
            </div>
          )}
          {steps.map((s) => (
            <StepRow key={s.idx} step={s} />
          ))}
        </div>
      </ScrollArea>

      {/* Result Footer: Status badge + duration + turns + token breakdown only */}
      {run.result && (
        <div className="px-4 py-3 border-t border-border bg-card/30 space-y-2.5 min-w-0 max-w-full overflow-hidden animate-slide-up shadow-lg">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <Badge
              variant={run.result.status === "SUCCESS" ? "success" : "error"}
              className="shrink-0 transition-transform hover:scale-105"
            >
              {run.result.status || "COMPLETED"}
            </Badge>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 shrink-0">
              {run.result.duration_seconds != null && (
                <span className="font-mono tabular-nums">{fmtDur(run.result.duration_seconds)}</span>
              )}
              {run.result.num_turns != null && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span>
                    {run.result.num_turns} turn{run.result.num_turns === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>

          {run.result.usage && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/50 min-w-0 break-words">
              {fmtTokens(run.result.usage)
                .split("  ")
                .filter(Boolean)
                .map((t, i) => (
                  <span
                    key={i}
                    className="break-all px-1.5 py-0.5 rounded bg-muted/30 border border-border/30 hover:border-border/60 transition-colors"
                  >
                    {t}
                  </span>
                ))}
            </div>
          )}

          {run.result.error && (
            <div
              className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded px-2.5 py-1.5 break-words min-w-0 max-w-full overflow-x-auto animate-expand-down"
              dangerouslySetInnerHTML={{ __html: renderMd(run.result.error) }}
            />
          )}
        </div>
      )}
    </div>
  )
}

