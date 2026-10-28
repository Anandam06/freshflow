import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
  {
    variants: {
      variant: {
        neutral: "border-slate-200 bg-slate-100 text-slate-700",
        fresh: "border-fresh-100 bg-fresh-50 text-fresh",
        forest: "border-forest/20 bg-forest-50 text-forest",
        risk: "border-risk-100 bg-risk-50 text-risk-dark",
        unsafe: "border-unsafe-100 bg-unsafe-50 text-unsafe-dark",
        info: "border-sky-200 bg-sky-50 text-sky-800",
        violet: "border-violet-200 bg-violet-50 text-violet-800",
        outline: "border-slate-300 bg-white text-slate-700",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";
