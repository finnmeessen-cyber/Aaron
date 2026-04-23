import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-12 min-w-0 w-full max-w-full rounded-2xl border border-border bg-card px-4 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
