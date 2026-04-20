import { PageHeader } from "@/components/app-shell/page-header";
import { PageHero } from "@/components/app-shell/page-hero";
import { PageShell } from "@/components/app-shell/page-shell";
import { Sparkline } from "@/components/charts/sparkline";
import { StrengthProgressCard } from "@/components/hevy/strength-progress-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SetupRequired } from "@/components/ui/setup-required";
import { getHevyStrengthProgressData } from "@/lib/hevy/strength-progress";
import {
  getWeeklyReviewData,
  reviewComparisonLabel,
  reviewTrainingHint
} from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/utils";

export default async function WeeklyReviewPage() {
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

  const [data, strengthProgress] = await Promise.all([
    getWeeklyReviewData(supabase, user.id),
    getHevyStrengthProgressData(supabase, user.id)
  ]);

  return (
    <PageShell className="gap-6">
      <PageHero>
        <PageHeader
          eyebrow="Weekly Review"
          title={`Woche ab ${formatShortDate(data.currentWeekStart)}`}
          description="Automatische Review mit Gewicht, Energie, Cravings, Trainingsanzahl und pragmatischen Anpassungsvorschlägen."
        />
      </PageHero>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Durchschnittsgewicht</p>
          <p className="mt-4 text-3xl font-semibold">
            {data.averageWeight !== null ? `${data.averageWeight.toFixed(1)} kg` : "Keine Daten"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Veränderung: {reviewComparisonLabel(data.weightChange, " kg")}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Cravings-Trend</p>
          <p className="mt-4 text-3xl font-semibold">{reviewComparisonLabel(data.cravingsTrend)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Negativ ist besser.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Energie-Trend</p>
          <p className="mt-4 text-3xl font-semibold">{reviewComparisonLabel(data.energyTrend)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Positiv ist besser.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Trainingsanzahl</p>
          <p className="mt-4 text-3xl font-semibold">{data.trainingSessions}</p>
          <p className="mt-2 text-sm text-muted-foreground">{reviewTrainingHint(data.trainingSessions)}</p>
        </Card>
      </div>

      <StrengthProgressCard data={strengthProgress} />

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Wochenverlauf</CardTitle>
              <CardDescription className="mt-2">
                Gewicht, Energie und Cravings für diese Woche auf einen Blick.
              </CardDescription>
            </div>
            <Badge tone="muted">{data.supplementCompliance}% Supplement-Compliance</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <p className="mb-2 text-sm font-medium">Gewicht</p>
              <Sparkline values={data.chartSeries.map((point) => point.weight)} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Energie</p>
              <Sparkline values={data.chartSeries.map((point) => point.energy)} className="text-success" stroke="currentColor" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Cravings</p>
              <Sparkline values={data.chartSeries.map((point) => point.cravings)} className="text-warning" stroke="currentColor" />
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <CardTitle>Automatische Vorschläge</CardTitle>
          <CardDescription className="mt-2">
            Aus den Wochenwerten abgeleitet, bewusst simpel und alltagstauglich.
          </CardDescription>
          <div className="space-y-3">
            {data.suggestions.map((suggestion) => (
              <div key={suggestion} className="rounded-2xl border border-border bg-muted px-4 py-4 text-sm leading-6">
                {suggestion}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
