import { ScrollArea } from "./ui/scroll-area"
import { Badge } from "./ui/badge"
import { Separator } from "./ui/separator"
import { StepRow } from "./StepRow"
import { fmtDur, fmtTokens, shortPath } from "@/lib/utils"
import type { Run } from "../types"

export function Transcript({ run }: { run: Run | null }) {
  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-xs">
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

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
      {/* Header: Conv ID + cwd (truncated) + elapsed */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border text-xs min-h-[41px]">
        <span className="text-foreground font-medium truncate">
          {run.convId || shortPath(run.file)}
        </span>
        <div className="flex items-center gap-3 text-muted-foreground/60 text-xs shrink-0 ml-4">
          {run.cwd && (
            <span className="truncate max-w-[200px]" title={run.cwd}>
              {shortPath(run.cwd)}
            </span>
          )}
          {elapsed && <span>{elapsed}</span>}
        </div>
      </div>

      {/* Steps */}
      <ScrollArea className="flex-1">
        <div className="py-2.5 space-y-1">
          {steps.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-xs">
              Waiting for events…
            </div>
          )}
          {steps.map((s) => (
            <StepRow key={s.idx} step={s} />
          ))}
        </div>
      </ScrollArea>

      {/* Result Footer: Status badge + duration + turns + token breakdown only */}
      {run.result && (
        <div className="px-4 py-3 border-t border-border bg-card/20 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={run.result.status === "SUCCESS" ? "success" : "error"}>
              {run.result.status || "COMPLETED"}
            </Badge>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              {run.result.duration_seconds != null && (
                <span>{fmtDur(run.result.duration_seconds)}</span>
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
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/50">
              {fmtTokens(run.result.usage)
                .split("  ")
                .filter(Boolean)
                .map((t, i) => (
                  <span key={i}>{t}</span>
                ))}
            </div>
          )}

          {run.result.error && (
            <div className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded px-2.5 py-1.5 whitespace-pre-wrap break-words">
              {run.result.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

