import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-150 select-none",
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary border border-primary/25",
        success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
        error: "bg-red-500/15 text-red-400 border border-red-500/25",
        muted: "bg-muted text-muted-foreground border border-border/40",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
