import { useState, useEffect } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Menu, X } from "lucide-react"
import { Sidebar } from "./components/Sidebar"
import { Transcript } from "./components/Transcript"
import { useAgySSE } from "./hooks/useAgySSE"
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
    if (!selectedFile) {
      let latest: Run | null = null
      for (const r of runs.values()) {
        if (r.status === "running" && (!latest || r.start > latest.start)) latest = r
      }
      if (latest) setSelectedFile(latest.file)
      else if (runs.size > 0 && !selectedFile) {
        // select most recent overall
        let mostRecent: Run | null = null
        for (const r of runs.values()) if (!mostRecent || r.start > mostRecent.start) mostRecent = r
        if (mostRecent) setSelectedFile(mostRecent.file)
      }
    }
  }, [runs, selectedFile])

  const selectedRun = selectedFile ? runs.get(selectedFile) ?? null : null
  const sidebarContent = (
    <>
      <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 border-b border-border">
        Antigravity · Sessions
      </div>
      <div className="flex-1 overflow-y-auto">
        <Sidebar runs={runs} selectedFile={selectedFile} onSelect={(f) => { setSelectedFile(f); setMobileOpen(false) }} />
      </div>
    </>
  )

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[260px] min-w-[260px] flex-col bg-card border-r border-border">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40 md:hidden" />
          <Dialog.Content className="fixed left-0 top-0 bottom-0 w-[280px] bg-card border-r border-border z-50 flex flex-col md:hidden outline-none">
            <Dialog.Title className="sr-only">Sessions</Dialog.Title>
            {sidebarContent}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-2.5 right-2.5 p-1.5 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Main panel */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-3 py-2.5 border-b border-border bg-card/50">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedRun?.convId ? selectedRun.convId.slice(0, 12) : "agy"}
          </span>
        </div>

        <Transcript run={selectedRun} />
      </main>
    </div>
  )
}
