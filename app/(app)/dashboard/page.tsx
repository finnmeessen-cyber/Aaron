import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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
    <PageShell className="space-y-6">
      <Card className="rounded-2xl border-zinc-200 bg-muted/70 p-6 shadow-sm dark:border-border/70 dark:bg-muted/40">
        <div className="space-y-6">
          <PageHeader
            eyebrow="Dashboard"
            title={formatDisplayDate(data.dateLabel)}
            description="Dein täglicher Überblick für Lean Bulk, Recovery, Supplement-Compliance und Quit-Fokus."
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
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">{data.statusLabel}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {data.todayEntry
                  ? data.currentPhase?.summary ||
                    "Wähle eine aktuelle Phase, damit dein Dashboard den richtigen Kontext zeigt."
                  : data.todayChecklistCompletion > 0
                    ? "Checklisten sind schon in Bewegung. Ergänze jetzt noch Gewicht, Scores und Kalorien für einen vollständigen Tag."
                    : "Starte den Tag mit Gewicht, Scores und Checklisten. Danach läuft der Rest deutlich sauberer."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/daily"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                >
                  Heute tracken
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/weekly-review"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-card px-5 text-sm font-medium transition hover:bg-muted dark:border-border/70 dark:bg-card"
                >
                  Wochenreview ansehen
                </Link>
                <Link
                  href="/supplements"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-card px-5 text-sm font-medium transition hover:bg-muted dark:border-border/70 dark:bg-card"
                >
                  Stack öffnen
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-card p-5 shadow-sm dark:border-border/70 dark:bg-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                    Tagesfokus
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                    {data.todayChecklistCompletion}% erledigt
                  </h3>
                </div>
                <Badge tone="muted">{data.streak} Tage Streak</Badge>
              </div>
              <div className="mt-5">
                <ProgressBar value={data.todayChecklistCompletion} />
                <p className="mt-3 text-sm text-muted-foreground">
                  {complianceLabel(data.todayChecklistCompletion)}
                </p>
              </div>
              {data.currentPhase && data.phaseDurationLabel ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  Aktuelle Phase: {data.currentPhase.name} {data.phaseDurationLabel}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Kernmetriken</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Die wichtigsten Signale für Gewicht, Performance und Compliance im Überblick.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {data.cards.map((card) => (
            <Card key={card.label} className="rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">{card.label}</p>
              <p className="mt-4 text-2xl font-semibold">{card.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{card.hint}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Heute auf einen Blick</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Quick Stats für Tagesform, Training und Kalorien.
            </p>
          </div>
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
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                Next Action
              </p>
              <CardTitle className="mt-3 text-2xl">Heute noch offen</CardTitle>
              <CardDescription className="mt-2">
                {data.openLoopCount > 0
                  ? `${data.openLoopCount} kurze Schritte bringen den Tag auf saubere Schienen.`
                  : "Heute ist alles sauber erfasst. Nutze den Hub für den nächsten sinnvollen Step."}
              </CardDescription>
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
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-medium text-primary">{action.ctaLabel}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Trends</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kurze Verlaufskarten für Gewicht, Energie und Cravings.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
            <CardTitle>Gewicht</CardTitle>
            <Sparkline values={data.chartSeries.map((point) => point.weight)} />
            <CardDescription>7- bis 14-Tage-Verlauf für schnelle Lean-Bulk-Kontrolle.</CardDescription>
          </Card>
          <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
            <CardTitle>Energie</CardTitle>
            <Sparkline values={data.chartSeries.map((point) => point.energy)} className="text-success" stroke="currentColor" />
            <CardDescription>Hohe Energie ist oft die beste Kombi aus Schlaf, Carbs und Stressmanagement.</CardDescription>
          </Card>
          <Card className="space-y-4 rounded-2xl border-zinc-200 bg-card p-4 shadow-sm dark:border-border/70 dark:bg-card">
            <CardTitle>Cravings</CardTitle>
            <Sparkline values={data.chartSeries.map((point) => point.cravings)} className="text-warning" stroke="currentColor" />
            <CardDescription>Niedriger ist hier besser. So erkennst du Trigger schneller.</CardDescription>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
