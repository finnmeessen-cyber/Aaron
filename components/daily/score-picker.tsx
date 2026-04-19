"use client";

import { cn } from "@/lib/utils";

export function ScorePicker({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          {value}/10
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, index) => {
          const score = index + 1;
          const active = score === value;
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange(score)}
              className={cn(
                "min-h-12 rounded-2xl border text-sm font-semibold transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              )}
            >
              {score}
            </button>
          );
        })}
      </div>
    </div>
  );
}
