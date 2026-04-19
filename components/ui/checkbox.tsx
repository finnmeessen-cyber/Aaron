"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  className?: string;
};

export function Checkbox({ checked, onCheckedChange, label, description, className }: CheckboxProps) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex min-h-14 w-full touch-manipulation items-center gap-4 rounded-2xl border border-border bg-card px-4 text-left transition hover:border-primary/40 hover:bg-muted",
        checked && "border-primary/50 bg-primary/10",
        className
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border bg-background",
          checked && "border-primary bg-primary text-primary-foreground"
        )}
      >
        {checked ? <Check className="h-4 w-4" /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{label}</span>
        {description ? (
          <span className="text-xs leading-5 text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
