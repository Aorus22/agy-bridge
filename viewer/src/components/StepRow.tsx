import { useState } from "react"
import {
  ChevronRight,
  Check,
  X,
  Loader2,
  Brain,
  Terminal,
  FilePlus,
  FileEdit,
  FileText,
  Search,
  Globe,
  Wrench,
} from "lucide-react"
import { cn, fmtDur, fmtTokens } from "@/lib/utils"
import type { Step, DiffLine } from "../types"

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts.pop() || p
}

function getToolIcon(toolName: string) {
  const name = (toolName || "").toLowerCase()
  if (
    name.includes("command") ||
    name.includes("terminal") ||
    name.includes("bash") ||
    name.includes("shell") ||
    name.includes("exec")
  ) {
    return Terminal
  }
  if (name.includes("write") || name.includes("create")) {
    return FilePlus
  }
  if (name.includes("edit") || name.includes("replace") || name.includes("patch")) {
    return FileEdit
  }
  if (name.includes("view") || name.includes("read") || name.includes("cat")) {
    return FileText
  }
  if (name.includes("grep") || name.includes("search") || name.includes("find")) {
    return Search
  }
  if (
    name.includes("url") ||
    name.includes("fetch") ||
    name.includes("http") ||
    name.includes("web") ||
    name.includes("browser")
  ) {
    return Globe
  }
  return Wrench
}

function getToolSummary(toolName: string, params: Record<string, unknown> | null): string {
  if (!params) return ""
  const name = (toolName || "").toLowerCase()

  // Web search
  if (name.includes("search_web") || name.includes("web_search")) {
    const q = params.query || params.Query
    if (typeof q === "string" && q) {
      return q.length > 50 ? q.slice(0, 50) + "…" : q
    }
    return "web search"
  }

  // URL tools
  if (name.includes("url") || name.includes("http") || name.includes("fetch") || name.includes("web")) {
    const urlVal = params.Url || params.url || params.URL
    if (typeof urlVal === "string" && urlVal) {
      return urlVal.length > 50 ? urlVal.slice(0, 50) + "…" : urlVal
    }
  }

  // Search / grep / find: show pattern
  if (name.includes("grep") || name.includes("search") || name.includes("find")) {
    const patternVal =
      params.Pattern ||
      params.pattern ||
      params.Query ||
      params.query ||
      params.search_term ||
      params.regex
    if (typeof patternVal === "string" && patternVal) {
      return patternVal.length > 50 ? patternVal.slice(0, 50) + "…" : patternVal
    }
  }

  // Run command / terminal / shell: show command
  if (
    name.includes("command") ||
    name.includes("terminal") ||
    name.includes("bash") ||
    name.includes("shell") ||
    name.includes("exec")
  ) {
    const cmdVal = params.CommandLine || params.command || params.cmd
    if (typeof cmdVal === "string" && cmdVal) {
      const clean = cmdVal.trim().replace(/\s+/g, " ")
      return clean.length > 60 ? clean.slice(0, 60) + "…" : clean
    }
  }

  // File operations: write_to_file, view_file, replace_file_content, etc.
  const filePathVal =
    params.TargetFile ||
    params.AbsolutePath ||
    params.file_path ||
    params.filePath ||
    params.path ||
    params.file ||
    params.TargetDirectory ||
    params.DirectoryPath ||
    params.SearchDirectory ||
    params.dir_path
  if (typeof filePathVal === "string" && filePathVal) {
    return basename(filePathVal)
  }

  // General command fallback
  const genericCmd = params.CommandLine || params.command || params.cmd
  if (typeof genericCmd === "string" && genericCmd) {
    const clean = genericCmd.trim().replace(/\s+/g, " ")
    return clean.length > 60 ? clean.slice(0, 60) + "…" : clean
  }

  // General pattern / query fallback
  const genericPattern = params.Pattern || params.pattern || params.Query || params.query
  if (typeof genericPattern === "string" && genericPattern) {
    return genericPattern.length > 50 ? genericPattern.slice(0, 50) + "…" : genericPattern
  }

  // Fallback: first param value
  const entries = Object.entries(params)
  if (entries.length > 0) {
    const [, firstVal] = entries[0]
    if (firstVal != null) {
      const str = typeof firstVal === "string" ? firstVal : JSON.stringify(firstVal)
      if ((str.startsWith("/") || str.includes("\\")) && str.length < 80) {
        return basename(str)
      }
      return str.length > 50 ? str.slice(0, 50) + "…" : str
    }
  }

  return ""
}

function ExpandedParams({ params }: { params: Record<string, unknown> | null }) {
  if (!params) return null
  const entries = Object.entries(params)
  if (entries.length === 0) return null

  return (
    <div className="space-y-1.5 font-mono text-[11px] leading-relaxed min-w-0 max-w-full overflow-hidden">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold select-none">
        Parameters
      </div>
      <div className="pl-2.5 border-l border-neutral-800 space-y-1 min-w-0 max-w-full overflow-hidden">
        {entries.map(([k, v]) => {
          const isMultiline = typeof v === "string" && v.includes("\n")
          const val = typeof v === "string" ? v : v == null ? "null" : JSON.stringify(v, null, 2)

          if (isMultiline || val.length > 150) {
            return (
              <div key={k} className="space-y-1 min-w-0 max-w-full">
                <span className="text-neutral-400 break-all">{k}:</span>
                <pre className="text-neutral-200 bg-[#050507] border border-neutral-800/80 rounded p-2 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto max-w-full min-w-0">
                  {val}
                </pre>
              </div>
            )
          }

          return (
            <div key={k} className="text-[11px] break-all min-w-0 max-w-full flex items-baseline gap-1.5">
              <span className="text-neutral-500 shrink-0">{k}:</span>
              <span className="text-neutral-300 whitespace-pre-wrap break-all">{val}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getDiffFilename(params: Record<string, unknown> | null): string {
  if (!params) return "file"
  const filePathVal =
    params.TargetFile ||
    params.targetFile ||
    params.AbsolutePath ||
    params.absolutePath ||
    params.file_path ||
    params.filePath ||
    params.path ||
    params.file ||
    params.TargetDirectory ||
    params.DirectoryPath
  if (typeof filePathVal === "string" && filePathVal) {
    return basename(filePathVal)
  }
  return "file"
}

interface DisplayLine extends DiffLine {
  isDivider?: boolean
  key: string | number
}

function extractHunks(diff: DiffLine[], contextRadius = 3): DisplayLine[] {
  const changedIndices: number[] = []
  for (let i = 0; i < diff.length; i++) {
    if (diff[i].type !== "ctx") {
      changedIndices.push(i)
    }
  }

  if (changedIndices.length === 0) {
    return diff.map((d, i) => ({ ...d, key: i }))
  }

  const included = new Set<number>()
  for (const idx of changedIndices) {
    const start = Math.max(0, idx - contextRadius)
    const end = Math.min(diff.length - 1, idx + contextRadius)
    for (let j = start; j <= end; j++) {
      included.add(j)
    }
  }

  const result: DisplayLine[] = []
  let inGap = !included.has(0)

  for (let i = 0; i < diff.length; i++) {
    if (included.has(i)) {
      if (inGap && result.length > 0) {
        result.push({
          type: "ctx",
          text: "···",
          isDivider: true,
          key: `div-${i}`,
        })
      }
      inGap = false
      result.push({
        ...diff[i],
        key: i,
      })
    } else {
      inGap = true
    }
  }

  return result
}

function DiffView({
  diff,
  params,
}: {
  diff: DiffLine[]
  params: Record<string, unknown> | null
}) {
  const isLong = diff.length > 20
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null)
  const isExpanded = userExpanded !== null ? userExpanded : !isLong

  const filename = getDiffFilename(params)
  const addCount = diff.filter((d) => d.type === "add").length
  const delCount = diff.filter((d) => d.type === "del").length

  const hunkLines = extractHunks(diff, 3)
  const MAX_DISPLAY_LINES = 200
  const displayedLines = hunkLines.slice(0, MAX_DISPLAY_LINES)
  const remainingCount = hunkLines.length - displayedLines.length

  return (
    <div className="space-y-1.5 min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold select-none min-w-0">
          <span className="truncate">Diff // {filename}</span>
          {addCount > 0 && <span className="text-emerald-400 font-normal">+{addCount}</span>}
          {delCount > 0 && <span className="text-rose-400 font-normal">-{delCount}</span>}
        </div>
        {isLong && (
          <button
            type="button"
            onClick={() => setUserExpanded(!isExpanded)}
            className="text-[10px] font-mono text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 shrink-0 select-none flex items-center gap-1"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 shrink-0 transition-transform duration-150",
                isExpanded && "rotate-90"
              )}
            />
            <span>{isExpanded ? "Hide diff" : `Show diff (${diff.length} lines)`}</span>
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="rounded border border-neutral-800 bg-[#050507] overflow-hidden min-w-0 max-w-full animate-expand-down">
          <div className="max-h-80 overflow-y-auto overflow-x-auto min-w-0 max-w-full font-mono text-[11px]">
            {displayedLines.map((line) => {
              if (line.isDivider) {
                return (
                  <div
                    key={line.key}
                    className="px-2 py-0.5 text-[10px] font-mono text-neutral-600 bg-neutral-900/30 select-none tracking-widest text-center"
                  >
                    ···
                  </div>
                )
              }

              const isAdd = line.type === "add"
              const isDel = line.type === "del"
              const isCtx = line.type === "ctx"

              return (
                <div
                  key={line.key}
                  className={cn(
                    "px-2 py-0.5 flex items-start min-w-fit leading-relaxed select-text font-mono",
                    isAdd && "bg-emerald-950/20 text-emerald-300",
                    isDel && "bg-rose-950/20 text-rose-300",
                    isCtx && "text-neutral-400"
                  )}
                >
                  <span className="select-none shrink-0 w-3.5 mr-1 text-center font-semibold">
                    {isAdd ? "+" : isDel ? "-" : " "}
                  </span>
                  <span className="whitespace-pre flex-1">{line.text || " "}</span>
                </div>
              )
            })}
          </div>
          {remainingCount > 0 && (
            <div className="px-2 py-1 text-[10px] font-mono text-neutral-500 italic bg-neutral-900/50 border-t border-neutral-800 select-none">
              … {remainingCount} more lines
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function renderMd(text: string): string {
  let h = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  // code blocks
  h = h.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, __, code) =>
      `<pre class="bg-[#050507] border border-neutral-800/80 rounded-md p-3 overflow-x-auto max-w-full my-2 text-xs font-mono text-neutral-200"><code>${code.replace(/\n$/, "")}</code></pre>`
  )
  // inline code
  h = h.replace(
    /`([^`]+)`/g,
    '<code class="bg-neutral-800/80 border border-neutral-700/60 px-1 py-0.5 rounded text-[11px] font-mono text-neutral-200 break-all">$1</code>'
  )
  // bold
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-neutral-100 font-semibold">$1</strong>')
  // italic
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em class="text-neutral-300">$2</em>')
  // links
  h = h.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-neutral-300 underline underline-offset-2 hover:text-white break-all transition-colors">$1</a>'
  )
  // headers
  h = h.replace(/^### (.+)$/gm, '<div class="text-xs font-semibold uppercase tracking-wider text-neutral-300 mt-2.5 mb-1">$1</div>')
  h = h.replace(/^## (.+)$/gm, '<div class="text-sm font-semibold text-neutral-200 mt-3 mb-1">$1</div>')
  h = h.replace(/^# (.+)$/gm, '<div class="text-base font-semibold text-neutral-100 mt-3.5 mb-1.5">$1</div>')
  // list items
  h = h.replace(/^(?:- |\* )(.+)$/gm, '<div class="text-xs text-neutral-200 pl-3.5 relative before:content-[\'•\'] before:absolute before:left-1 before:text-neutral-500">$1</div>')
  // numbered list items
  h = h.replace(/^(\d+)\. (.+)$/gm, '<div class="text-xs text-neutral-200 pl-4.5"><span class="text-neutral-500">$1.</span> $2</div>')
  // blockquotes
  h = h.replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-neutral-700 bg-neutral-900/30 pl-2.5 py-0.5 text-neutral-400 text-xs my-1.5">$1</blockquote>')
  // horizontal rules
  h = h.replace(/^---$/gm, '<hr class="border-neutral-800 my-2.5"/>')
  // line breaks
  h = h.replace(/\n/g, "<br/>")
  h = h.replace(/<br\/>(<div|<blockquote|<hr|<pre)/g, "$1")
  h = h.replace(/(<\/div>|<\/blockquote>|<\/pre>|<hr\/>)<br\/>/g, "$1")
  return h
}

export function StepRow({ step }: { step: Step }) {
  const [expanded, setExpanded] = useState(false)

  const isTool = step.type === "tool"
  const isThinking = step.type === "agent_response" && !step.text.trim()
  const isResponse = step.type === "agent_response" && !!step.text.trim()
  const isUser = step.type === "user_input"
  const isActive = step.state === "ACTIVE"
  const isDone = step.state === "DONE"
  const isError = step.state === "ERROR"

  // ── user input: minimal prompt marker ──
  if (isUser) {
    return (
      <div className="py-0.5 text-[11px] font-mono text-neutral-500 min-w-0 break-words animate-step-in">
        // prompt received
      </div>
    )
  }

  // ── thinking: subtle line ──
  if (isThinking) {
    return (
      <div className="py-0.5 flex items-center gap-2 text-xs text-neutral-400 min-w-0 overflow-hidden animate-step-in font-mono">
        {isActive ? (
          <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0" />
        ) : (
          <Brain className="w-3 h-3 text-neutral-500 shrink-0" />
        )}
        <span className="text-neutral-400 shrink-0">thinking</span>
        {step.thinking > 0 && (
          <span className="text-[11px] text-neutral-500 truncate min-w-0">
            ({step.thinking.toLocaleString()} tokens)
          </span>
        )}
        {step.duration != null && (
          <span className="text-[11px] text-neutral-500 shrink-0 ml-auto tabular-nums">
            {fmtDur(step.duration)}
          </span>
        )}
      </div>
    )
  }

  // ── tool call: precision harness block ──
  if (isTool) {
    const ToolIcon = getToolIcon(step.tool)
    const summary = getToolSummary(step.tool, step.params)
    const hasParams = !!step.params && Object.keys(step.params).length > 0
    const hasDiff = Array.isArray(step.diff) && step.diff.length > 0
    const hasOutput = !!step.output
    const hasError = !!step.error

    return (
      <div className="min-w-0 max-w-full animate-tool-in">
        <div
          className={cn(
            "rounded border border-neutral-800/90 bg-neutral-900/30 hover:bg-neutral-900/60 hover:border-neutral-700/80 transition-colors overflow-hidden min-w-0 max-w-full group",
            expanded && "border-neutral-700/80 bg-neutral-900/50"
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs select-none hover:bg-neutral-800/30 transition-colors cursor-pointer min-w-0 overflow-hidden",
              expanded && "bg-neutral-900/40"
            )}
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 text-neutral-500 shrink-0 transition-transform duration-150",
                expanded && "rotate-90 text-neutral-300"
              )}
            />
            <ToolIcon className="w-3 h-3 text-neutral-400 group-hover:text-neutral-200 transition-colors shrink-0" />
            <span className="font-mono text-xs text-neutral-200 font-semibold shrink-0">
              {step.tool || "tool"}
            </span>
            {summary && (
              <span className="font-mono text-xs text-neutral-400 group-hover:text-neutral-300 transition-colors truncate min-w-0 flex-1">
                {summary}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {step.duration != null && (
                <span className="font-mono text-[10px] text-neutral-500 tabular-nums">
                  {fmtDur(step.duration)}
                </span>
              )}
              {isActive && <Loader2 className="w-3 h-3 animate-spin text-sky-400 shrink-0" />}
              {isDone && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
              {isError && <X className="w-3 h-3 text-rose-400 shrink-0" />}
            </div>
          </button>

          {expanded && (
            <div className="border-t border-neutral-800 bg-[#070709] p-3 space-y-2.5 text-xs min-w-0 max-w-full overflow-hidden animate-expand-down">
              {hasParams && <ExpandedParams params={step.params} />}
              {hasDiff && <DiffView diff={step.diff!} params={step.params} />}
              {hasOutput && (
                <div className="space-y-1 min-w-0 max-w-full">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-semibold select-none">
                    Output
                  </div>
                  <pre className="font-mono text-[11px] text-neutral-200 bg-[#050507] border border-neutral-800/80 rounded p-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-all min-w-0 max-w-full">
                    {step.output}
                  </pre>
                </div>
              )}
              {hasError && (
                <div className="space-y-1 min-w-0 max-w-full">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-semibold select-none">
                    Error
                  </div>
                  <pre className="font-mono text-[11px] text-rose-300 bg-rose-950/20 border border-rose-900/40 rounded p-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-all min-w-0 max-w-full">
                    {step.error}
                  </pre>
                </div>
              )}
              {!hasParams && !hasDiff && !hasOutput && !hasError && (
                <div className="text-[11px] font-mono text-neutral-500 italic">
                  No additional parameters or output
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── AI response: clean markdown ──
  if (isResponse) {
    return (
      <div className="py-1 space-y-1 min-w-0 max-w-full overflow-hidden animate-step-in">
        <div
          className="text-xs leading-relaxed text-neutral-200 break-words whitespace-pre-wrap font-sans min-w-0 max-w-full overflow-hidden [overflow-wrap:anywhere]"
          dangerouslySetInnerHTML={{ __html: renderMd(step.text.trim()) }}
        />
        {(step.duration != null || step.usage) && (
          <div className="flex items-center gap-3 pt-0.5 text-[10px] text-neutral-500 font-mono min-w-0 flex-wrap">
            {step.duration != null && <span className="shrink-0 tabular-nums">{fmtDur(step.duration)}</span>}
            {step.usage && <span className="break-all">{fmtTokens(step.usage)}</span>}
          </div>
        )}
      </div>
    )
  }

  return null
}
