import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtDur(s?: number): string {
  if (s == null) return ""
  if (s < 1) return s.toFixed(2) + "s"
  if (s < 60) return (Math.round(s * 10) / 10) + "s"
  const m = Math.floor(s / 60), r = Math.round(s % 60)
  return `${m}m${r}s`
}

export function fmtTokens(u?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number; cache_read_tokens?: number; total_tokens?: number }): string {
  if (!u) return ""
  const p: string[] = []
  if (u.input_tokens) p.push(`▲ ${u.input_tokens.toLocaleString()}`)
  if (u.output_tokens) p.push(`▼ ${u.output_tokens.toLocaleString()}`)
  if (u.thinking_tokens) p.push(`✦ ${u.thinking_tokens.toLocaleString()}`)
  if (u.cache_read_tokens) p.push(`♻ ${u.cache_read_tokens.toLocaleString()}`)
  if (u.total_tokens) p.push(`= ${u.total_tokens.toLocaleString()}`)
  return p.join("  ")
}

export function shortPath(p: string): string {
  const parts = p.split("/")
  return parts[parts.length - 1] || p
}
