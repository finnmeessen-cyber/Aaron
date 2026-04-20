"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function CollapsibleSection({
  children,
  className,
  defaultOpen = false,
  title
}: {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={cn("rounded-2xl border border-border bg-card px-4 py-3 shadow-sm", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? <div className="pt-3">{children}</div> : null}
    </section>
  );
}
