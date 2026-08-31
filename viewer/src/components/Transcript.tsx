import { useRef, useEffect } from "react"
import { Loader2, Check, X, Folder, Clock } from "lucide-react"
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
      `<pre class="bg-[#050507] border border-neutral-800/80 rounded p-2.5 overflow-x-auto max-w-full my-2 text-xs font-mono text-neutral-200"><code>${c.replace(/\n$/, "")}</code></pre>`
  )
  h = h.replace(
    /`([^`]+)`/g,
    '<code class="bg-neutral-800/80 border border-neutral-700/60 px-1 py-0.5 rounded text-[11px] font-mono text-neutral-200">$1</code>'
  )
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-neutral-100 font-semibold">$1</strong>')
  h = h.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-neutral-300 underline underline-offset-2 hover:text-white break-all transition-colors">$1</a>'
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
      const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]")
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    }
  }, [run])

  if (!run) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-xs font-mono animate-fade-in gap-2 select-none">
        <span className="text-neutral-600">-- AGY HARNESS VIEWER --</span>
        <span>Select a session from the sidebar</span>
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
  const isDone = run.status === "done"
  const isError = run.status === "error"

  return (
    <div key={run.file} className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#09090b] max-w-full animate-fade-in">
      {/* Header Bar */}
      <div className="h-10 px-3.5 flex items-center justify-between border-b border-neutral-800/80 bg-[#09090b] text-xs shrink-0 select-none">
        <div className="flex items-center gap-2 truncate min-w-0 mr-2">
          {isRunning ? (
            <Badge variant="running" className="animate-pulse-subtle">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>running</span>
            </Badge>
          ) : isDone ? (
            <Badge variant="success">
              <Check className="w-2.5 h-2.5" />
              <span>done</span>
            </Badge>
          ) : (
            <Badge variant="error">
              <X className="w-2.5 h-2.5" />
              <span>error</span>
            </Badge>
          )}

          <span className="font-mono text-xs text-neutral-200 font-medium truncate" title={run.convId || run.file}>
            {run.convId ? run.convId.slice(0, 16) : shortPath(run.file)}
          </span>

          {run.cwd && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-neutral-500 font-mono truncate max-w-[200px]" title={run.cwd}>
              <Folder className="w-3 h-3 text-neutral-600 shrink-0" />
              <span className="truncate">{shortPath(run.cwd)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-neutral-400 text-xs shrink-0">
          {elapsed && (
            <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-neutral-400">
              <Clock className="w-3 h-3 text-neutral-600 shrink-0" />
              <span>{elapsed}</span>
            </div>
          )}
        </div>
      </div>

      {/* Steps List */}
      <ScrollArea ref={scrollRef} className="flex-1 min-w-0 max-w-full bg-[#09090b]">
        <div className="p-3.5 space-y-2 min-w-0 max-w-full overflow-hidden">
          {/* Prompt Card */}
          {run.promptText && (
            <div className="border border-neutral-800 bg-neutral-900/30 rounded-md p-3 animate-fade-in space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-semibold select-none flex items-center gap-1.5">
                <span>Prompt</span>
              </div>
              <div
                className="text-xs text-neutral-200 leading-relaxed font-sans break-words [overflow-wrap:anywhere]"
                dangerouslySetInnerHTML={{ __html: renderMd(run.promptText) }}
              />
            </div>
          )}

          {steps.length === 0 && (
            <div className="flex items-center justify-center h-32 text-neutral-500 text-xs font-mono animate-fade-in gap-2">
              <Loader2 className="w-3.5 h-3.5 text-neutral-400 animate-spin shrink-0" />
              <span>Awaiting events…</span>
            </div>
          )}

          {steps.map((s) => (
            <StepRow key={s.idx} step={s} />
          ))}
        </div>
      </ScrollArea>

      {/* Result Footer */}
      {run.result && (
        <div className="p-3 border-t border-neutral-800/80 bg-[#09090b] space-y-2 shrink-0 animate-fade-in">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={run.result.status === "SUCCESS" ? "success" : "error"}>
                {run.result.status || "COMPLETED"}
              </Badge>
              {run.result.num_turns != null && (
                <span className="text-[11px] font-mono text-neutral-500">
                  {run.result.num_turns} turn{run.result.num_turns === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {run.result.duration_seconds != null && (
              <span className="font-mono text-[11px] tabular-nums text-neutral-400">
                {fmtDur(run.result.duration_seconds)}
              </span>
            )}
          </div>

          {run.result.usage && (
            <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-neutral-400">
              {fmtTokens(run.result.usage)
                .split("  ")
                .filter(Boolean)
                .map((t, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800/80"
                  >
                    {t}
                  </span>
                ))}
            </div>
          )}

          {run.result.error && (
            <div
              className="text-xs text-rose-300 bg-rose-950/20 border border-rose-900/40 rounded p-2.5 break-words min-w-0 max-w-full overflow-x-auto font-mono"
              dangerouslySetInnerHTML={{ __html: renderMd(run.result.error) }}
            />
          )}
        </div>
      )}
    </div>
  )
}
