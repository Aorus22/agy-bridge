import { useState } from "react"
import { Check, X, Loader2, ChevronRight } from "lucide-react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible"
import { ScrollArea } from "./ui/scroll-area"
import { cn, shortPath, fmtDur } from "@/lib/utils"
import type { Run } from "../types"

function StatusIcon({ status }: { status: Run["status"] }) {
  if (status === "done") {
    return <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
  }
  if (status === "error") {
    return <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
  }
  return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
}

function relTime(r: Run): string {
  if (r.result?.duration_seconds != null) return fmtDur(r.result.duration_seconds)
  if (r.status === "running") return Math.round((Date.now() - r.start) / 1000) + "s"
  return ""
}

export function Sidebar({
  runs,
  selectedFile,
  onSelect,
}: {
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
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  if (runs.size === 0) {
    return (
      <div className="p-4 text-xs font-mono text-muted-foreground/40 text-center">
        No sessions yet
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1 px-1.5 space-y-1">
        {Array.from(groups.entries()).map(([proj, rs]) => {
          const isCollapsed = collapsed.has(proj)
          return (
            <Collapsible key={proj} open={!isCollapsed} onOpenChange={() => toggle(proj)}>
              <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded select-none">
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-150 shrink-0",
                    !isCollapsed && "rotate-90"
                  )}
                />
                <span className="flex-1 truncate text-left" title={proj}>
                  {shortPath(proj)}
                </span>
                <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums shrink-0">
                  {rs.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pt-0.5">
                {rs
                  .slice()
                  .sort((a, b) => b.start - a.start)
                  .map((r) => {
                    const isSelected = r.file === selectedFile
                    return (
                      <button
                        key={r.file}
                        onClick={() => onSelect(r.file)}
                        className={cn(
                          "w-full flex items-center gap-2 pl-6 pr-2.5 py-1.5 text-xs rounded transition-colors text-left cursor-pointer",
                          isSelected
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        <StatusIcon status={r.status} />
                        <span className="font-mono text-[11px] flex-1 truncate">
                          {r.convId ? r.convId.slice(0, 8) : shortPath(r.file)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground/40 shrink-0 tabular-nums">
                          {relTime(r)}
                        </span>
                      </button>
                    )
                  })}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </ScrollArea>
  )
}
