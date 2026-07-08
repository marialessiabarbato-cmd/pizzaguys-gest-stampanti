import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 text-sm",
  {
    variants: {
      variant: {
        default: "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))] hover:opacity-90",
        secondary:
          "bg-[hsl(var(--pg-secondary))] text-[hsl(var(--pg-secondary-foreground))] hover:opacity-90",
        outline:
          "border border-[hsl(var(--pg-border))] bg-transparent hover:bg-[hsl(var(--pg-muted))]",
        ghost: "hover:bg-[hsl(var(--pg-muted))]",
        danger: "bg-[hsl(var(--pg-danger))] text-white hover:opacity-90",
      },
      size: {
        default: "h-12 min-h-12 min-w-12 px-4",
        lg: "h-14 min-h-14 px-6 text-base",
        sm: "h-9 min-h-9 min-w-0 px-3",
        compact: "h-8 min-h-8 min-w-0 px-2 text-xs",
        icon: "h-12 w-12 min-h-12 min-w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
