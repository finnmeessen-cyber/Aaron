"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function MobileNavStrip() {
  const pathname = usePathname();

  return (
    <div className="min-w-0 max-w-full overflow-x-auto pb-3 md:hidden">
      <div className="flex w-full gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition",
                active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
