import { useState, useEffect, useCallback } from "react"
import { Menu } from "lucide-react"
import { Sheet, SheetContent } from "./components/ui/sheet"
import { Sidebar } from "./components/Sidebar"
import { Transcript } from "./components/Transcript"
import { useAgySSE } from "./hooks/useAgySSE"
import type { Run } from "./types"

function getSlugFromPath(): string {
  const p = window.location.pathname.replace(/^\/+|\/+$/g, "")
  if (!p || p === "index.html") return ""
  return p
}

function getSessionSlug(run: Run): string {
  if (run.convId) return run.convId.slice(0, 8)
  const base = run.file.split("/").pop() || run.file
  return base.replace(/\.jsonl$/i, "")
}

function findRunBySlug(runs: Map<string, Run>, slug: string): Run | null {
  if (!slug) return null
  const s = slug.toLowerCase()
  for (const r of runs.values()) {
    if (r.convId && r.convId.toLowerCase().startsWith(s)) return r
    const fileSlug = (r.file.split("/").pop() || r.file).replace(/\.jsonl$/i, "").toLowerCase()
    if (fileSlug === s || fileSlug.startsWith(s)) return r
  }
  return null
}

export default function App() {
  const runs = useAgySSE()
  const [routeSlug, setRouteSlug] = useState<string>(getSlugFromPath)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, setTick] = useState(0)

  // Listen to browser popstate (back/forward navigation)
  useEffect(() => {
    const onPopState = () => {
      setRouteSlug(getSlugFromPath())
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  // Live timer for running sessions
  useEffect(() => {
    let active = false
    for (const r of runs.values()) {
      if (r.status === "running") {
        active = true
        break
      }
    }
    if (!active) return
    const iv = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(iv)
  }, [runs])

  // Sync selected session with route slug or fallback to latest
  useEffect(() => {
    if (runs.size === 0) return

    if (routeSlug) {
      const matched = findRunBySlug(runs, routeSlug)
      if (matched) {
        setSelectedFile(matched.file)
        return
      }
    }

    // If no route slug (path is /), auto-select most recent session without changing URL
    if (!routeSlug) {
      if (selectedFile && runs.has(selectedFile)) return
      let latest: Run | null = null
      for (const r of runs.values()) {
        if (!latest || r.start > latest.start) latest = r
      }
      if (latest) {
        setSelectedFile(latest.file)
      }
    }
  }, [runs, routeSlug, selectedFile])

  const handleSelect = useCallback(
    (file: string) => {
      setSelectedFile(file)
      const run = runs.get(file)
      if (run) {
        const slug = getSessionSlug(run)
        setRouteSlug(slug)
        if (window.location.pathname !== `/${slug}`) {
          window.history.pushState({ slug, file }, "", `/${slug}`)
        }
      }
      setMobileOpen(false)
    },
    [runs]
  )

  const selectedRun = selectedFile ? runs.get(selectedFile) ?? null : null

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      <div className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 border-b border-border shrink-0 select-none flex items-center justify-between">
        <span>Sessions</span>
        {runs.size > 0 && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 text-muted-foreground/50 bg-muted/40 rounded tabular-nums animate-fade-in">
            {runs.size}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <Sidebar
          runs={runs}
          selectedFile={selectedFile}
          onSelect={handleSelect}
        />
      </div>
    </div>
  )

  return (
    <div className="h-screen flex overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] min-w-[240px] flex-col bg-card border-r border-border transition-colors">
        {sidebarContent}
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex flex-col p-0 w-[280px]">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-3 py-2 border-b border-border bg-card">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open sessions menu"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all duration-150 cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-foreground/80 truncate">
            {selectedRun?.convId ? selectedRun.convId.slice(0, 12) : "agy"}
          </span>
        </div>

        <Transcript run={selectedRun} />
      </main>
    </div>
  )
}
