import { useState } from "react"
import { Check, X, Loader2, ChevronRight, Square } from "lucide-react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible"
import { ScrollArea } from "./ui/scroll-area"
import { cn, shortPath, fmtDur } from "@/lib/utils"
import type { Run } from "../types"

function StatusIcon({ status }: { status: Run["status"] }) {
  if (status === "done") {
    return <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-icon-pop" />
  }
  if (status === "error") {
    return <X className="w-3.5 h-3.5 text-red-400 shrink-0 animate-icon-pop" />
  }
  return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
}

function relTime(r: Run): string {
  if (r.result?.duration_seconds != null) return fmtDur(r.result.duration_seconds)
  if (r.status === "running") return Math.round((Date.now() - r.start) / 1000) + "s"
  return ""
}

async function handleStop(e: React.MouseEvent, r: Run) {
  e.stopPropagation()
  try {
    await fetch("/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teeFile: r.file, pid: r.pid }),
    })
  } catch (err) {
    console.error("Failed to stop session:", err)
  }
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
      <div className="p-4 text-xs font-mono text-muted-foreground/40 text-center animate-fade-in">
        No sessions yet
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full min-w-0">
      <div className="py-2 px-2 space-y-1.5 min-w-0 max-w-full overflow-hidden animate-fade-in">
        {Array.from(groups.entries()).map(([proj, rs]) => {
          const isCollapsed = collapsed.has(proj)
          return (
            <Collapsible key={proj} open={!isCollapsed} onOpenChange={() => toggle(proj)} className="min-w-0 max-w-full">
              <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-all duration-150 cursor-pointer rounded-lg select-none min-w-0 overflow-hidden group">
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-transform duration-200 ease-out shrink-0",
                    !isCollapsed && "rotate-90"
                  )}
                />
                <span className="flex-1 truncate text-left min-w-0 font-medium" title={proj}>
                  {shortPath(proj)}
                </span>
                <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] group-hover:text-muted-foreground/70 transition-colors">
                  {rs.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pt-1 min-w-0 max-w-full overflow-hidden">
                {rs
                  .slice()
                  .sort((a, b) => b.start - a.start)
                  .map((r) => {
                    const isSelected = r.file === selectedFile
                    return (
                      <div
                        key={r.file}
                        onClick={() => onSelect(r.file)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onSelect(r.file)
                          }
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-all duration-150 text-left cursor-pointer min-w-0 overflow-hidden group/item relative border",
                          isSelected
                            ? "bg-white/[0.09] text-foreground font-medium border-white/[0.15] shadow-[0_2px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)]"
                            : "text-muted-foreground/80 border-transparent hover:bg-white/[0.045] hover:text-foreground hover:border-white/[0.08] hover:translate-x-0.5 active:translate-x-0"
                        )}
                      >
                        <StatusIcon status={r.status} />
                        <span className="font-mono text-[11px] flex-1 truncate min-w-0">
                          {r.convId ? r.convId.slice(0, 8) : shortPath(r.file)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground/40 group-hover/item:text-muted-foreground/60 shrink-0 tabular-nums transition-colors">
                          {relTime(r)}
                        </span>
                        {r.status === "running" && (
                          <button
                            type="button"
                            title="Stop session"
                            aria-label="Stop session"
                            onClick={(e) => handleStop(e, r)}
                            className="p-1 -mr-1 rounded-md hover:bg-red-500/20 text-muted-foreground/60 hover:text-red-400 active:scale-95 transition-all duration-150 cursor-pointer shrink-0"
                          >
                            <Square className="w-3 h-3 fill-current" />
                          </button>
                        )}
                      </div>
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
