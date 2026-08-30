import { ChevronRight, ChevronDown, Check, X, Loader2 } from "lucide-react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible"
import { cn, shortPath, fmtDur } from "@/lib/utils"
import { useState } from "react"
import type { Run } from "../types"

function StatusIcon({ status }: { status: Run["status"] }) {
  if (status === "done") return <Check className="w-3.5 h-3.5 text-green-500" />
  if (status === "error") return <X className="w-3.5 h-3.5 text-destructive" />
  return <Loader2 className="w-3.5 h-3.5 text-blue-400 agy-pulse" />
}

function relTime(r: Run): string {
  if (r.result?.duration_seconds != null) return fmtDur(r.result.duration_seconds)
  if (r.status === "running") return Math.round((Date.now() - r.start) / 1000) + "s"
  return ""
}

function SessionItem({ run, active, onClick }: { run: Run; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer border-l-2 text-left",
        active ? "bg-primary/15 text-foreground border-primary" : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      <StatusIcon status={run.status} />
      <span className="mono text-[11px] flex-1 truncate">
        {run.convId ? run.convId.slice(0, 8) : shortPath(run.file)}
      </span>
      <span className="text-[10px] text-muted-foreground mono flex-shrink-0">{relTime(run)}</span>
    </button>
  )
}

export function Sidebar({ runs, selectedFile, onSelect }: {
  runs: Map<string, Run>
  selectedFile: string | null
  onSelect: (file: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // group by project (cwd)
  const groups = new Map<string, Run[]>()
  for (const r of runs.values()) {
    const p = r.cwd || "unknown"
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p)!.push(r)
  }

  const toggle = (p: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  if (runs.size === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No sessions yet</div>
    )
  }

  return (
    <div className="py-1">
      {Array.from(groups.entries()).map(([proj, rs]) => {
        const isCollapsed = collapsed.has(proj)
        const name = shortPath(proj)
        return (
          <Collapsible key={proj} open={!isCollapsed} onOpenChange={() => toggle(proj)}>
            <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span className="flex-1 truncate text-left" title={proj}>{name}</span>
              <span className="text-[10px] text-muted-foreground/60">{rs.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {rs.sort((a, b) => b.start - a.start).map(r => (
                <SessionItem
                  key={r.file}
                  run={r}
                  active={r.file === selectedFile}
                  onClick={() => onSelect(r.file)}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
