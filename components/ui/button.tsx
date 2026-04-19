import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = {
  primary:
    "bg-primary text-primary-foreground shadow-soft hover:brightness-105 active:scale-[0.99]",
  secondary:
    "border border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted",
  ghost: "text-foreground hover:bg-white/5 hover:text-foreground",
  danger: "bg-danger text-white hover:brightness-110"
} as const;

const buttonSizes = {
  default: "min-h-12 px-5 text-sm",
  sm: "min-h-10 px-4 text-sm",
  lg: "min-h-14 px-6 text-base",
  icon: "h-11 w-11"
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = "button", variant = "primary", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex touch-manipulation select-none items-center justify-center rounded-2xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-50",
          buttonVariants[variant],
          buttonSizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
