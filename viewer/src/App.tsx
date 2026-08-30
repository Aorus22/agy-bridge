import { useState, useEffect } from "react"
import { Menu } from "lucide-react"
import { Sheet, SheetContent, SheetHeader } from "./components/ui/sheet"
import { Sidebar } from "./components/Sidebar"
import { Transcript } from "./components/Transcript"
import { useAgySSE } from "./hooks/useAgySSE"
import { shortPath } from "./lib/utils"
import type { Run } from "./types"

export default function App() {
  const runs = useAgySSE()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, setTick] = useState(0)

  // live timer for running sessions
  useEffect(() => {
    let active = false
    for (const r of runs.values()) if (r.status === "running") { active = true; break }
    if (!active) return
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [runs])

  // auto-select most recent running session
  useEffect(() => {
    if (selectedFile) return
    let latest: Run | null = null
    for (const r of runs.values()) {
      if (!latest || r.start > latest.start) latest = r
    }
    if (latest) setSelectedFile(latest.file)
  }, [runs, selectedFile])

  const selectedRun = selectedFile ? runs.get(selectedFile) ?? null : null

  const sidebarContent = (
    <>
      <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/40 border-b border-border">
        Sessions
      </div>
      <div className="flex-1 min-h-0">
        <Sidebar runs={runs} selectedFile={selectedFile} onSelect={(f) => { setSelectedFile(f); setMobileOpen(false) }} />
      </div>
    </>
  )

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] min-w-[240px] flex-col bg-card border-r border-border">
        {sidebarContent}
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex flex-col p-0">
          <SheetHeader>Sessions</SheetHeader>
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile bar */}
        <div className="md:hidden flex items-center gap-3 px-3 py-2 border-b border-border">
          <button onClick={() => setMobileOpen(true)} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <Menu className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-muted-foreground">
            {selectedRun?.convId ? selectedRun.convId.slice(0, 12) : "agy"}
          </span>
        </div>

        <Transcript run={selectedRun} />
      </main>
    </div>
  )
}
