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
import type { Step } from "../types"

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
    <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold select-none">
        Parameters
      </div>
      <div className="pl-2.5 border-l-2 border-border/50 space-y-1.5">
        {entries.map(([k, v]) => {
          const isMultiline = typeof v === "string" && v.includes("\n")
          const val = typeof v === "string" ? v : v == null ? "null" : JSON.stringify(v, null, 2)

          if (isMultiline || val.length > 200) {
            return (
              <div key={k} className="space-y-0.5">
                <span className="text-muted-foreground/70">{k}:</span>
                <pre className="text-foreground/85 bg-background/50 border border-border/40 rounded p-2 text-[11px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {val}
                </pre>
              </div>
            )
          }

          return (
            <div key={k} className="text-[11px] break-words">
              <span className="text-muted-foreground/70 mr-1.5">{k}:</span>
              <span className="text-foreground/85 whitespace-pre-wrap break-all">{val}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function renderMd(text: string): string {
  let h = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  h = h.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, __, code) =>
      `<pre class="bg-card border border-border rounded-md p-2.5 overflow-x-auto my-2 text-xs font-mono text-foreground/90"><code>${code.replace(/\n$/, "")}</code></pre>`
  )
  h = h.replace(
    /`([^`]+)`/g,
    '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono border border-border/40 text-foreground/90">$1</code>'
  )
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em class="text-foreground/80">$2</em>')
  h = h.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-primary hover:underline">$1</a>'
  )
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
    return <div className="px-4 py-1 text-xs font-mono text-muted-foreground/40">prompt received</div>
  }

  // ── thinking: subtle line with icon ──
  if (isThinking) {
    return (
      <div className="px-4 py-1 flex items-center gap-2 text-xs text-muted-foreground/50">
        <Brain className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
        <span>thinking</span>
        {step.thinking > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground/40">
            {step.thinking.toLocaleString()} tokens
          </span>
        )}
        {step.duration != null && (
          <span className="font-mono text-[11px] text-muted-foreground/40">
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
    const hasParams = step.params && Object.keys(step.params).length > 0

    return (
      <div className="px-4 py-0.5">
        <div
          className={cn(
            "rounded-md border border-border/50 bg-card/40 hover:bg-card/70 transition-colors overflow-hidden",
            expanded && "border-border/80 bg-card/60"
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs select-none hover:bg-muted/30 transition-colors cursor-pointer",
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
              <span className="font-mono text-xs text-muted-foreground/70 truncate min-w-0">
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
            <div className="border-t border-border/40 bg-muted/20 px-3 py-2.5 space-y-2.5 text-xs">
              {hasParams && <ExpandedParams params={step.params} />}
              {step.output && (
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40 font-semibold select-none">
                    Output
                  </div>
                  <div className="font-mono text-[11px] text-emerald-400/90 bg-emerald-950/20 border border-emerald-900/30 rounded px-2.5 py-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                    {step.output}
                  </div>
                </div>
              )}
              {step.error && (
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-red-400/60 font-semibold select-none">
                    Error
                  </div>
                  <div className="font-mono text-[11px] text-red-400/90 bg-red-950/20 border border-red-900/30 rounded px-2.5 py-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                    {step.error}
                  </div>
                </div>
              )}
              {!hasParams && !step.output && !step.error && (
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
      <div className="px-4 py-2 space-y-1">
        <div
          className="text-sm leading-relaxed text-foreground/90 break-words whitespace-pre-wrap font-sans"
          dangerouslySetInnerHTML={{ __html: renderMd(step.text.trim()) }}
        />
        {(step.duration != null || step.usage) && (
          <div className="flex items-center gap-3 pt-0.5 text-[10px] text-muted-foreground/50 font-mono">
            {step.duration != null && <span>{fmtDur(step.duration)}</span>}
            {step.usage && <span>{fmtTokens(step.usage)}</span>}
          </div>
        )}
      </div>
    )
  }

  return null
}
