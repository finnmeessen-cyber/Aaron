import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHero({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl border-zinc-200 bg-muted/70 p-5 shadow-sm dark:border-border/70 dark:bg-muted/40 md:p-6",
        className
      )}
    >
      {children}
    </Card>
  );
}
