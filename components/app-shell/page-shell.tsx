import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6", className)}>
      {children}
    </div>
  );
}
