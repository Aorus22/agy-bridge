import { useState, useEffect } from "react"
import { Menu } from "lucide-react"
import { Sheet, SheetContent } from "./components/ui/sheet"
import { Sidebar } from "./components/Sidebar"
import { Transcript } from "./components/Transcript"
import { useAgySSE } from "./hooks/useAgySSE"
import type { Run } from "./types"

export default function App() {
  const runs = useAgySSE()
  const [selectedFile, setSelectedFile] = useState<string | null>(() => {
    try { return localStorage.getItem("agy-bridge:selected") } catch { return null }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, setTick] = useState(0)

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

  // Auto-select most recent session
  useEffect(() => {
    if (selectedFile && runs.has(selectedFile)) return
    let latest: Run | null = null
    for (const r of runs.values()) {
      if (!latest || r.start > latest.start) latest = r
    }
    if (latest) setSelectedFile(latest.file)
  }, [runs, selectedFile])

  const selectedRun = selectedFile ? runs.get(selectedFile) ?? null : null

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      <div className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 border-b border-border shrink-0 select-none flex items-center justify-between">
        <span>Sessions</span>
        {runs.size > 0 && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 text-muted-foreground/50 bg-muted/40 rounded-full tabular-nums animate-fade-in">
            {runs.size}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <Sidebar
          runs={runs}
          selectedFile={selectedFile}
          onSelect={(f) => {
            setSelectedFile(f)
            try { localStorage.setItem("agy-bridge:selected", f) } catch {}
            setMobileOpen(false)
          }}
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
