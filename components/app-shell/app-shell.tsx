import { MoonStar } from "lucide-react";
import type { ReactNode } from "react";

import { currentPhaseLabel, type AppShellData } from "@/lib/data";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { DesktopNav } from "@/components/navigation/desktop-nav";
import { MobileNavStrip } from "@/components/navigation/mobile-nav-strip";
import { ShellContainer } from "@/components/app-shell/shell-container";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AppShell({
  shellData,
  children
}: {
  shellData: AppShellData;
  children: ReactNode;
}) {
  const displayName = shellData.profile?.display_name || shellData.profile?.email || "Athlete";
  const phaseLabel = shellData.phaseDurationLabel
    ? `${currentPhaseLabel(shellData.currentPhase)} · ${shellData.phaseDurationLabel}`
    : currentPhaseLabel(shellData.currentPhase);

  return (
    <div className="app-shell min-h-screen min-w-0 max-w-full">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <ShellContainer className="flex min-w-0 max-w-full flex-col">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-soft">
                <MoonStar className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{phaseLabel}</p>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <Badge tone="muted">{phaseLabel}</Badge>
              <DesktopNav />
              <SignOutButton />
            </div>
            <div className="md:hidden">
              <SignOutButton compact />
            </div>
          </div>
          <MobileNavStrip />
        </ShellContainer>
      </header>
      <main className="min-w-0 max-w-full">{children}</main>
      <BottomNav />
    </div>
  );
}
