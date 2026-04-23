import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ShellContainer({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("w-full max-w-full px-4 md:px-5", className)}>{children}</div>;
}
