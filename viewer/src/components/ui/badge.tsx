import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider select-none",
  {
    variants: {
      variant: {
        default: "bg-neutral-800/80 text-neutral-200 border border-neutral-700/60",
        success: "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40",
        error: "bg-rose-950/40 text-rose-400 border border-rose-800/40",
        running: "bg-sky-950/40 text-sky-400 border border-sky-800/40",
        muted: "bg-neutral-900 text-neutral-400 border border-neutral-800",
        outline: "border border-neutral-800 text-neutral-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
