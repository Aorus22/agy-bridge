import { Check, X, Loader2, Globe, Wrench, Shield, Clock } from "lucide-react"
import { StepRow } from "./StepRow"
import { Badge } from "./ui/badge"
import { Separator } from "./ui/separator"
import { fmtDur, fmtTokens, shortPath } from "@/lib/utils"
import type { Run } from "../types"

export function Transcript({ run }: { run: Run | null }) {
  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
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
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/50 text-xs">
        <span className="mono text-foreground font-medium">
          {run.convId ? run.convId.slice(0, 12) : shortPath(run.file)}
        </span>
        <div className="ml-auto flex items-center gap-3 text-muted-foreground">
          {run.cwd && (
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{shortPath(run.cwd)}</span>
          )}
          {run.toolCount > 0 && (
            <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{run.toolCount}</span>
          )}
          {run.perm && (
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{run.perm}</span>
          )}
          {elapsed && (
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{elapsed}</span>
          )}
        </div>
      </div>

      {/* steps */}
      <div className="flex-1 overflow-y-auto py-2">
        {steps.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Waiting for events…
          </div>
        )}
        {steps.map((s) => <StepRow key={s.idx} step={s} />)}
      </div>

      {/* result */}
      {run.result && (
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            {run.result.status === "SUCCESS" ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <X className="w-4 h-4 text-destructive" />
            )}
            <Badge variant={run.result.status === "SUCCESS" ? "success" : "error"}>
              {run.result.status || "done"}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground mono">
              {fmtDur(run.result.duration_seconds)} · {run.result.num_turns ?? 0} turn{(run.result.num_turns ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
          {run.result.usage && (
            <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-muted-foreground mono">
              {fmtTokens(run.result.usage).split("  ").map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          )}
          {run.result.error && (
            <div className="text-xs text-destructive mono mt-1.5">✗ {run.result.error}</div>
          )}
          {run.result.response && run.result.response.trim() && (
            <>
              <Separator className="my-2" />
              <div className="text-sm bg-zinc-900/50 border border-border rounded p-2.5 max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                {run.result.response.trim()}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
