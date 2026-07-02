import * as React from "react";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors [&_svg]:size-3 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-card text-muted-foreground",
        neutral: "border-border bg-surface-card text-muted-foreground",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        info: "border-sky-500/20 bg-sky-500/10 text-sky-400",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        danger: "border-red-500/20 bg-red-500/10 text-red-400",
        purple: "border-violet-500/20 bg-violet-500/10 text-violet-300",
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
