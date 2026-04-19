import { PageShell } from "@/components/app-shell/page-shell";
import { Card } from "@/components/ui/card";

export default function AppLoading() {
  return (
    <PageShell>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-h-72 animate-pulse bg-dashboard-glow opacity-80" />
        <div className="space-y-5">
          <Card className="min-h-32 animate-pulse" />
          <Card className="min-h-32 animate-pulse" />
          <Card className="min-h-32 animate-pulse" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="min-h-40 animate-pulse" />
        <Card className="min-h-40 animate-pulse" />
        <Card className="min-h-40 animate-pulse" />
      </div>
    </PageShell>
  );
}
