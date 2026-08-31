import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    preserveSymlinks: true,
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
})
