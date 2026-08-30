import { useState } from "react"
import {
  ChevronDown,
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
  return p.split("/").pop() || p
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
      if (str.startsWith("/") && str.includes("/")) {
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
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold select-none">
        Parameters
      </div>
      <div className="pl-2.5 border-l-2 border-border/50 space-y-1.5 min-w-0 max-w-full overflow-hidden">
        {entries.map(([k, v]) => {
          const isMultiline = typeof v === "string" && v.includes("\n")
          const val = typeof v === "string" ? v : v == null ? "null" : JSON.stringify(v, null, 2)

          if (isMultiline || val.length > 200) {
            return (
              <div key={k} className="space-y-0.5 min-w-0 max-w-full">
                <span className="text-muted-foreground/70 break-all">{k}:</span>
                <pre className="text-foreground/85 bg-background/50 border border-border/40 rounded p-2 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto overflow-x-auto max-w-full min-w-0">
                  {val}
                </pre>
              </div>
            )
          }

          return (
            <div key={k} className="text-[11px] break-all min-w-0 max-w-full">
              <span className="text-muted-foreground/70 mr-1.5 shrink-0">{k}:</span>
              <span className="text-foreground/85 whitespace-pre-wrap break-all">{val}</span>
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
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50 font-semibold select-none min-w-0">
          <span className="truncate">Diff — {filename}</span>
          {addCount > 0 && <span className="text-emerald-400 font-normal">+{addCount}</span>}
          {delCount > 0 && <span className="text-red-400 font-normal">-{delCount}</span>}
        </div>
        {isLong && (
          <button
            type="button"
            onClick={() => setUserExpanded(!isExpanded)}
            className="text-[10px] font-mono text-muted-foreground/60 hover:text-foreground cursor-pointer transition-colors px-1.5 py-0.5 rounded bg-muted/30 hover:bg-muted/60 shrink-0 select-none flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronDown className="w-3 h-3 shrink-0" />
                <span>Hide diff</span>
              </>
            ) : (
              <>
                <ChevronRight className="w-3 h-3 shrink-0" />
                <span>Show diff ({diff.length} lines)</span>
              </>
            )}
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="rounded border border-border/40 bg-background/50 overflow-hidden min-w-0 max-w-full">
          <div className="max-h-80 overflow-y-auto overflow-x-auto min-w-0 max-w-full font-mono text-[11px]">
            {displayedLines.map((line) => {
              if (line.isDivider) {
                return (
                  <div
                    key={line.key}
                    className="px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground/30 bg-muted/10 select-none tracking-widest text-center"
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
                    "px-2.5 py-0.5 flex items-start min-w-fit leading-relaxed select-text",
                    isAdd && "bg-emerald-950/20 text-emerald-400",
                    isDel && "bg-red-950/20 text-red-400",
                    isCtx && "text-muted-foreground/40"
                  )}
                >
                  <span className="select-none shrink-0 w-3.5 mr-1 text-center font-mono font-semibold">
                    {isAdd ? "+" : isDel ? "-" : " "}
                  </span>
                  <span className="whitespace-pre font-mono flex-1">{line.text || " "}</span>
                </div>
              )
            })}
          </div>
          {remainingCount > 0 && (
            <div className="px-2.5 py-1 text-[10px] font-mono text-muted-foreground/40 italic bg-muted/10 border-t border-border/20 select-none">
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
      `<pre class="bg-card border border-border rounded-md p-2.5 overflow-x-auto max-w-full my-2 text-xs font-mono text-foreground/90"><code>${code.replace(/\n$/, "")}</code></pre>`
  )
  // inline code
  h = h.replace(
    /`([^`]+)`/g,
    '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono border border-border/40 text-foreground/90 break-all">$1</code>'
  )
  // bold
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
  // italic
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em class="text-foreground/80">$2</em>')
  // links
  h = h.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-primary hover:underline break-all">$1</a>'
  )
  // headers (###, ##, #)
  h = h.replace(/^### (.+)$/gm, '<div class="text-sm font-semibold text-foreground mt-2 mb-1">$1</div>')
  h = h.replace(/^## (.+)$/gm, '<div class="text-base font-semibold text-foreground mt-2.5 mb-1">$1</div>')
  h = h.replace(/^# (.+)$/gm, '<div class="text-lg font-semibold text-foreground mt-3 mb-1.5">$1</div>')
  // list items (- and *)
  h = h.replace(/^(?:- |\* )(.+)$/gm, '<div class="text-sm text-foreground/90 pl-4 relative before:content-[""] before:absolute before:left-1 before:top-2 before:w-1 before:h-1 before:rounded-full before:bg-muted-foreground/50">$1</div>')
  // numbered list items (1. 2. etc)
  h = h.replace(/^(\d+)\. (.+)$/gm, '<div class="text-sm text-foreground/90 pl-5"><span class="text-muted-foreground/60">$1.</span> $2</div>')
  // blockquotes
  h = h.replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-border pl-3 text-muted-foreground text-sm my-1">$1</blockquote>')
  // horizontal rules
  h = h.replace(/^---$/gm, '<hr class="border-border my-2"/>')
  // line breaks (but not inside pre/code)
  h = h.replace(/\n/g, "<br/>")
  // clean up extra brs around block elements
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

  // ── user input: minimal ──
  if (isUser) {
    return <div className="px-4 py-1 text-xs font-mono text-muted-foreground/40 min-w-0 break-words">prompt received</div>
  }

  // ── thinking: subtle line with icon ──
  if (isThinking) {
    return (
      <div className="px-4 py-1 flex items-center gap-2 text-xs text-muted-foreground/50 min-w-0 overflow-hidden">
        <Brain className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
        <span className="shrink-0">thinking</span>
        {step.thinking > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground/40 truncate min-w-0">
            {step.thinking.toLocaleString()} tokens
          </span>
        )}
        {step.duration != null && (
          <span className="font-mono text-[11px] text-muted-foreground/40 shrink-0 ml-auto">
            {fmtDur(step.duration)}
          </span>
        )}
      </div>
    )
  }

  // ── tool call: git-style collapsible row ──
  if (isTool) {
    const ToolIcon = getToolIcon(step.tool)
    const summary = getToolSummary(step.tool, step.params)
    const hasParams = !!step.params && Object.keys(step.params).length > 0
    const hasDiff = Array.isArray(step.diff) && step.diff.length > 0
    const hasOutput = !!step.output
    const hasError = !!step.error

    return (
      <div className="px-4 py-0.5 min-w-0 max-w-full">
        <div
          className={cn(
            "rounded-md border border-border/50 bg-card/40 hover:bg-card/70 transition-colors overflow-hidden min-w-0 max-w-full",
            expanded && "border-border/80 bg-card/60"
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs select-none hover:bg-muted/30 transition-colors cursor-pointer min-w-0 overflow-hidden",
              expanded && "bg-muted/20"
            )}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            )}
            <ToolIcon className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
            <span className="font-mono text-xs text-foreground/90 font-medium shrink-0">
              {step.tool || "tool"}
            </span>
            {summary && (
              <span className="font-mono text-xs text-muted-foreground/70 truncate min-w-0 flex-1">
                {summary}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {step.duration != null && (
                <span className="font-mono text-[10px] text-muted-foreground/50">
                  {fmtDur(step.duration)}
                </span>
              )}
              {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />}
              {isDone && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              {isError && <X className="w-3.5 h-3.5 text-red-400 shrink-0" />}
            </div>
          </button>

          {expanded && (
            <div className="border-t border-border/40 bg-muted/20 px-3 py-2.5 space-y-2.5 text-xs min-w-0 max-w-full overflow-hidden">
              {hasParams && <ExpandedParams params={step.params} />}
              {hasDiff && <DiffView diff={step.diff!} params={step.params} />}
              {hasOutput && (
                <div className="space-y-1 min-w-0 max-w-full">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40 font-semibold select-none">
                    Output
                  </div>
                  <pre className="font-mono text-[11px] text-foreground/85 bg-background/50 border border-border/40 rounded px-2.5 py-1.5 max-h-48 overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all min-w-0 max-w-full">
                    {step.output}
                  </pre>
                </div>
              )}
              {hasError && (
                <div className="space-y-1 min-w-0 max-w-full">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-red-400/60 font-semibold select-none">
                    Error
                  </div>
                  <pre className="font-mono text-[11px] text-red-400/90 bg-red-950/20 border border-red-900/30 rounded px-2.5 py-1.5 max-h-48 overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all min-w-0 max-w-full">
                    {step.error}
                  </pre>
                </div>
              )}
              {!hasParams && !hasDiff && !hasOutput && !hasError && (
                <div className="text-[11px] font-mono text-muted-foreground/40 italic">
                  No additional parameters or output
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── AI response: clean markdown text ──
  if (isResponse) {
    return (
      <div className="px-4 py-2 space-y-1 min-w-0 max-w-full overflow-hidden">
        <div
          className="text-sm leading-relaxed text-foreground/90 break-words whitespace-pre-wrap font-sans min-w-0 max-w-full overflow-hidden [overflow-wrap:anywhere]"
          dangerouslySetInnerHTML={{ __html: renderMd(step.text.trim()) }}
        />
        {(step.duration != null || step.usage) && (
          <div className="flex items-center gap-3 pt-0.5 text-[10px] text-muted-foreground/50 font-mono min-w-0 flex-wrap">
            {step.duration != null && <span className="shrink-0">{fmtDur(step.duration)}</span>}
            {step.usage && <span className="break-all">{fmtTokens(step.usage)}</span>}
          </div>
        )}
      </div>
    )
  }

  return null
}
