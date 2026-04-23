import type { ReactNode } from "react";

import { ShellContainer } from "@/components/app-shell/shell-container";
import { cn } from "@/lib/utils";

export function PageShell({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <ShellContainer
      className={cn("flex min-w-0 max-w-full flex-col gap-5 pt-4 pb-6 md:pt-5 md:pb-8", className)}
    >
      {children}
    </ShellContainer>
  );
}
