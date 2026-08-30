import { ScrollArea } from "./ui/scroll-area"
import { Badge } from "./ui/badge"
import { Separator } from "./ui/separator"
import { StepRow } from "./StepRow"
import { fmtDur, fmtTokens, shortPath } from "@/lib/utils"
import type { Run } from "../types"

export function Transcript({ run }: { run: Run | null }) {
  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-sm">
        Select a session
      </div>
    )
  }

  const steps = Array.from(run.steps.values()).sort((a, b) => a.idx - b.idx)
  const elapsed = run.result?.duration_seconds != null
    ? fmtDur(run.result.duration_seconds)
    : run.status === "running"
    ? Math.round((Date.now() - run.start) / 1000) + "s"
    : ""

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* minimal header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border text-xs">
        <span className="font-mono text-foreground/90">{run.convId ? run.convId.slice(0, 12) : shortPath(run.file)}</span>
        <div className="ml-auto flex items-center gap-3 text-muted-foreground/50">
          {run.cwd && <span className="truncate max-w-[140px]">{shortPath(run.cwd)}</span>}
          {elapsed && <span className="font-mono">{elapsed}</span>}
        </div>
      </div>

      {/* steps */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {steps.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-sm">
              Waiting for events…
            </div>
          )}
          {steps.map((s) => <StepRow key={s.idx} step={s} />)}
        </div>
      </ScrollArea>

      {/* result footer */}
      {run.result && (
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Badge variant={run.result.status === "SUCCESS" ? "success" : "error"}>
              {run.result.status || "done"}
            </Badge>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground/60">
              {fmtDur(run.result.duration_seconds)} · {run.result.num_turns ?? 0} turn{(run.result.num_turns ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
          {run.result.usage && (
            <div className="flex flex-wrap gap-2.5 mt-2 font-mono text-[10px] text-muted-foreground/50">
              {fmtTokens(run.result.usage).split("  ").map((t, i) => <span key={i}>{t}</span>)}
            </div>
          )}
          {run.result.error && <div className="text-xs text-red-400 font-mono mt-1.5">✗ {run.result.error}</div>}
          {run.result.response && run.result.response.trim() && (
            <>
              <Separator className="my-2.5" />
              <div className="text-sm bg-muted/40 rounded-md p-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
                {run.result.response.trim()}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
