"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BOTTOM_NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/90 px-2 pb-2 pt-2 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active =
            pathname.startsWith(item.href) ||
            (item.href === "/weekly-review" && pathname.startsWith("/review"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition",
                active ? "bg-primary/15 text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
