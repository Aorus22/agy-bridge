import { useState } from "react"
import { Check, X, Loader2, ChevronRight, Square, Folder } from "lucide-react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible"
import { ScrollArea } from "./ui/scroll-area"
import { cn, shortPath, fmtDur } from "@/lib/utils"
import type { Run } from "../types"

function StatusIndicator({ status }: { status: Run["status"] }) {
  if (status === "done") {
    return <Check className="w-3 h-3 text-emerald-400 shrink-0" />
  }
  if (status === "error") {
    return <X className="w-3 h-3 text-rose-400 shrink-0" />
  }
  return <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0" />
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

  // Group by project (cwd)
  const groups = new Map<string, Run[]>()
  for (const r of runs.values()) {
    const p = r.cwd || "default"
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
      <div className="p-4 text-xs font-mono text-neutral-500 text-center animate-fade-in">
        No active sessions
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full min-w-0">
      <div className="p-2 space-y-2 min-w-0 max-w-full overflow-hidden animate-fade-in">
        {Array.from(groups.entries()).map(([proj, rs]) => {
          const isCollapsed = collapsed.has(proj)
          return (
            <Collapsible key={proj} open={!isCollapsed} onOpenChange={() => toggle(proj)} className="min-w-0 max-w-full">
              <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850/50 transition-colors cursor-pointer rounded select-none min-w-0 overflow-hidden group">
                <ChevronRight
                  className={cn(
                    "w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-150 shrink-0",
                    !isCollapsed && "rotate-90"
                  )}
                />
                <Folder className="w-3 h-3 text-neutral-500 shrink-0" />
                <span className="flex-1 truncate text-left min-w-0 font-mono text-[11px]" title={proj}>
                  {shortPath(proj)}
                </span>
                <span className="text-[10px] text-neutral-500 font-mono tabular-nums shrink-0 px-1 py-0.2 rounded bg-neutral-900 border border-neutral-800">
                  {rs.length}
                </span>
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-0.5 pt-0.5 pl-2 min-w-0 max-w-full overflow-hidden">
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
                          "w-full flex items-center gap-2 px-2 py-1 text-xs rounded transition-colors text-left cursor-pointer min-w-0 overflow-hidden group/item border",
                          isSelected
                            ? "bg-neutral-800/80 text-neutral-100 font-medium border-neutral-700/60"
                            : "text-neutral-400 border-transparent hover:bg-neutral-850 hover:text-neutral-200 hover:border-neutral-800/40"
                        )}
                      >
                        <StatusIndicator status={r.status} />
                        <span className="font-mono text-[11px] flex-1 truncate min-w-0">
                          {r.convId ? r.convId.slice(0, 8) : shortPath(r.file)}
                        </span>
                        <span className="font-mono text-[10px] text-neutral-500 group-hover/item:text-neutral-400 shrink-0 tabular-nums">
                          {relTime(r)}
                        </span>
                        {r.status === "running" && (
                          <button
                            type="button"
                            title="Stop session"
                            aria-label="Stop session"
                            onClick={(e) => handleStop(e, r)}
                            className="p-1 -mr-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                          >
                            <Square className="w-2.5 h-2.5 fill-current" />
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
