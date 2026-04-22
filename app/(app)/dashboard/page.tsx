import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SetupRequired } from "@/components/ui/setup-required";
import { complianceLabel, getDashboardData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn, formatDisplayDate } from "@/lib/utils";

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return <SetupRequired />;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const data = await getDashboardData(supabase, user.id);

  return (
    <PageShell className="gap-5">
      <Card className="rounded-2xl border-zinc-200 bg-muted/70 p-5 shadow-sm dark:border-border/70 dark:bg-muted/40">
        <div className="space-y-5">
          <PageHeader
            eyebrow="Dashboard"
            title={formatDisplayDate(data.dateLabel)}
            description="Dein Überblick für heute."
            badge={
              data.currentPhase
                ? data.phaseDurationLabel
                  ? `${data.currentPhase.name} · ${data.phaseDurationLabel}`
                  : data.currentPhase.name
                : "Phase wählen"
            }
          />

          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="rounded-2xl border border-zinc-200 bg-card p-5 shadow-sm dark:border-border/70 dark:bg-card">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Heute</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{data.statusLabel}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {data.todayEntry
                  ? data.currentPhase?.summary ||
                    "Heute ist sauber eingetragen."
                  : data.todayChecklistCompletion > 0
                    ? "Ergänze noch Gewicht, Scores und Kalorien."
                    : "Starte mit deinem Daily."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/daily"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                >
                  Daily
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href={"/weekly-review" as Route}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-card px-5 text-sm font-medium transition hover:bg-muted dark:border-border/70 dark:bg-card"
                >
                  Weekly
                </Link>
                <Link
                  href="/supplements"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-card px-5 text-sm font-medium transition hover:bg-muted dark:border-border/70 dark:bg-card"
                >
                  Stack
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-card p-5 shadow-sm dark:border-border/70 dark:bg-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Fokus</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                    {data.todayChecklistCompletion}% erledigt
                  </h3>
                </div>
                <Badge tone="muted">{data.streak} Tage Streak</Badge>
              </div>
              <div className="mt-4">
                <ProgressBar value={data.todayChecklistCompletion} />
                <p className="mt-2 text-sm text-muted-foreground">{complianceLabel(data.todayChecklistCompletion)}</p>
              </div>
              {data.currentPhase && data.phaseDurationLabel ? (
                <p className="mt-4 text-sm text-muted-foreground">{data.currentPhase.name} {data.phaseDurationLabel}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Kernmetriken</h2>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {data.cards.map((card) => (
            <Card key={card.label} className="rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold">{card.value}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
          <h2 className="text-xl font-semibold tracking-tight">Heute</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.quickStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card"
              >
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Nächste Schritte</p>
              <CardTitle className="mt-2 text-xl">Offen</CardTitle>
            </div>
            <Badge tone="muted">
              {data.openLoopCount > 0 ? `${data.openLoopCount} offen` : "Erledigt"}
            </Badge>
          </div>

          <div className="space-y-3">
            {data.nextActions.map((action, index) => (
              <Link
                key={action.title}
                href={action.href}
                className={cn(
                  "block rounded-2xl border p-4 shadow-sm transition",
                  index === 0
                    ? "border-primary/30 bg-primary/10 hover:border-primary/50 hover:bg-primary/15"
                    : "border-zinc-200 bg-card hover:border-primary/30 hover:bg-muted dark:border-border/70 dark:bg-card dark:hover:bg-muted"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{action.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium text-primary">{action.ctaLabel}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Trends</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
            <CardTitle>Gewicht</CardTitle>
            <Sparkline values={data.chartSeries.map((point) => point.weight)} />
          </Card>
          <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
            <CardTitle>Energie</CardTitle>
            <Sparkline values={data.chartSeries.map((point) => point.energy)} className="text-success" stroke="currentColor" />
          </Card>
          <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
            <CardTitle>Cravings</CardTitle>
            <Sparkline values={data.chartSeries.map((point) => point.cravings)} className="text-warning" stroke="currentColor" />
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
