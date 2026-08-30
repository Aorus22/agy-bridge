import { useState } from "react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible"
import { ScrollArea } from "./ui/scroll-area"
import { cn, shortPath, fmtDur } from "@/lib/utils"
import type { Run } from "../types"

function StatusDot({ status }: { status: Run["status"] }) {
  const color = status === "done" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-blue-400 agy-pulse"
  return <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", color)} />
}

function relTime(r: Run): string {
  if (r.result?.duration_seconds != null) return fmtDur(r.result.duration_seconds)
  if (r.status === "running") return Math.round((Date.now() - r.start) / 1000) + "s"
  return ""
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
    return <div className="p-4 text-sm text-muted-foreground/40">No sessions yet</div>
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {Array.from(groups.entries()).map(([proj, rs]) => {
          const isCollapsed = collapsed.has(proj)
          return (
            <Collapsible key={proj} open={!isCollapsed} onOpenChange={() => toggle(proj)}>
              <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground/70 hover:text-foreground cursor-pointer">
                <span className="text-muted-foreground/40 text-[10px]">{isCollapsed ? "▶" : "▼"}</span>
                <span className="flex-1 truncate text-left" title={proj}>{shortPath(proj)}</span>
                <span className="text-[10px] text-muted-foreground/30">{rs.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {rs.sort((a, b) => b.start - a.start).map(r => (
                  <button
                    key={r.file}
                    onClick={() => onSelect(r.file)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer text-left",
                      r.file === selectedFile
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    )}
                  >
                    <StatusDot status={r.status} />
                    <span className="font-mono text-[11px] flex-1 truncate">
                      {r.convId ? r.convId.slice(0, 8) : shortPath(r.file)}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/40 flex-shrink-0">{relTime(r)}</span>
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </ScrollArea>
  )
}
