import { PageHeader } from "@/components/app-shell/page-header";
import { PageHero } from "@/components/app-shell/page-hero";
import { PageShell } from "@/components/app-shell/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SetupRequired } from "@/components/ui/setup-required";
import {
  getWeeklyOverview,
  type WeeklyDayNutrition,
  type WeeklyOverview,
  type WeeklySleepDay,
  type WeeklySourceKind,
  type WeeklyTrainingDay
} from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/utils";

function formatValue(
  value: number | null,
  suffix = "",
  options?: Intl.NumberFormatOptions
) {
  if (value === null) {
    return "–";
  }

  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
    ...options
  }).format(value)}${suffix}`;
}

function WeeklySourceBadge({ source }: { source: WeeklySourceKind }) {
  const config: Record<
    WeeklySourceKind,
    {
      label: string;
      tone: "default" | "success" | "warning" | "muted";
    }
  > = {
    derived: {
      label: "Abgeleitet",
      tone: "warning"
    },
    manual: {
      label: "Manuell",
      tone: "default"
    },
    mixed: {
      label: "Gemischt",
      tone: "warning"
    },
    none: {
      label: "Keine Daten",
      tone: "muted"
    },
    synced: {
      label: "Synchronisiert",
      tone: "success"
    }
  };

  return <Badge tone={config[source].tone}>{config[source].label}</Badge>;
}

function SectionHeader({
  description,
  source,
  title
}: {
  description: string;
  source: WeeklySourceKind;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-1.5">{description}</CardDescription>
      </div>
      <WeeklySourceBadge source={source} />
    </div>
  );
}

function SummaryValue({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SleepRow({ day }: { day: WeeklySleepDay }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <p className="text-sm font-medium">{formatShortDate(day.date)}</p>
        <WeeklySourceBadge source={day.source} />
      </div>
      <p className="text-sm text-muted-foreground">
        {day.sleepMinutes !== null ? `${formatValue(day.sleepMinutes, " min", { maximumFractionDigits: 0 })}` : "Keine Schlafdauer erfasst"}
      </p>
    </div>
  );
}

function NutritionRow({ day }: { day: WeeklyDayNutrition }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 last:border-b-0">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium">{formatShortDate(day.date)}</p>
          <WeeklySourceBadge source={day.source} />
        </div>
        <p className="text-sm text-muted-foreground">{formatValue(day.calories, " kcal", { maximumFractionDigits: 0 })}</p>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3 lg:grid-cols-4">
        <span>Protein {formatValue(day.protein, " g")}</span>
        <span>Kohlenhydrate {formatValue(day.carbs, " g")}</span>
        <span>Fett {formatValue(day.fat, " g")}</span>
      </div>
    </div>
  );
}

function TrainingRow({ day }: { day: WeeklyTrainingDay }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 last:border-b-0">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium">{formatShortDate(day.date)}</p>
          <WeeklySourceBadge source={day.source} />
        </div>
        <p className="text-sm text-muted-foreground">{day.active ? "Aktiv" : "Kein Training"}</p>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <span>Workouts {day.workoutsCompleted}</span>
        <span>Dauer {formatValue(day.durationMinutes, " min", { maximumFractionDigits: 0 })}</span>
        <span>Volumen {formatValue(day.volumeKg, " kg")}</span>
        <span>{day.bestEffort ? "Best-Effort" : "Strukturiert"}</span>
      </div>
    </div>
  );
}

function SleepSection({ data }: { data: WeeklyOverview["sleep"] }) {
  return (
    <Card className="space-y-4">
      <SectionHeader
        title="Sleep"
        description="7 feste Tage, sauber read-only aus dem Weekly-View-Model."
        source={data.source}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryValue
          label="Durchschnitt"
          value={data.summary.averageSleepMinutes !== null ? formatValue(data.summary.averageSleepMinutes, " min", { maximumFractionDigits: 0 }) : "–"}
        />
        <SummaryValue
          label="Gesamt"
          value={formatValue(data.summary.totalSleepMinutes, " min", { maximumFractionDigits: 0 })}
        />
        <SummaryValue label="Erfasste Tage" value={`${data.summary.trackedDays}/7`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70">
        {data.days.map((day) => (
          <SleepRow key={day.date} day={day} />
        ))}
      </div>
    </Card>
  );
}

function NutritionSection({ data }: { data: WeeklyOverview["nutrition"] }) {
  return (
    <Card className="space-y-4">
      <SectionHeader
        title="Nutrition"
        description="Kalorien und Makros pro Tag, direkt aus dem Weekly-Overview."
        source={data.source}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryValue
          label="Kalorien"
          value={formatValue(data.totals.calories, " kcal", { maximumFractionDigits: 0 })}
        />
        <SummaryValue label="Protein" value={formatValue(data.totals.protein, " g")} />
        <SummaryValue label="Kohlenhydrate" value={formatValue(data.totals.carbs, " g")} />
        <SummaryValue label="Fett" value={formatValue(data.totals.fat, " g")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryValue
          label="Ø Kalorien"
          value={formatValue(data.averages.calories, " kcal", { maximumFractionDigits: 0 })}
        />
        <SummaryValue label="Ø Protein" value={formatValue(data.averages.protein, " g")} />
        <SummaryValue label="Ø Kohlenhydrate" value={formatValue(data.averages.carbs, " g")} />
        <SummaryValue label="Ø Fett" value={formatValue(data.averages.fat, " g")} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70">
        {data.days.map((day) => (
          <NutritionRow key={day.date} day={day} />
        ))}
      </div>
    </Card>
  );
}

function TrainingSection({ data }: { data: WeeklyOverview["training"] }) {
  return (
    <Card className="space-y-4">
      <SectionHeader
        title="Training"
        description="Workout-Status und Wochen-Summary auf Basis der bestehenden Hevy- und Daily-Semantik."
        source={data.source}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryValue label="Workouts" value={`${data.summary.workoutsCompleted}`} />
        <SummaryValue
          label="Dauer"
          value={formatValue(data.summary.durationMinutes, " min", { maximumFractionDigits: 0 })}
        />
        <SummaryValue label="Volumen" value={formatValue(data.summary.volumeKg, " kg")} />
        <SummaryValue label="Aktive Tage" value={`${data.summary.activeDays}/7`} />
      </div>

      {data.bestEffort ? (
        <p className="text-sm text-muted-foreground">
          Einige Trainingswerte sind best-effort, weil nicht jede Hevy-Payload vollständige Details enthält.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border/70">
        {data.days.map((day) => (
          <TrainingRow key={day.date} day={day} />
        ))}
      </div>
    </Card>
  );
}

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

  const overview = await getWeeklyOverview(supabase, user.id);

  return (
    <PageShell className="gap-5">
      <PageHero>
        <PageHeader
          title="Diese Woche"
          description="Read-only Wochenansicht für Schlaf, Ernährung und Training."
          badge={`${formatShortDate(overview.range.start)} - ${formatShortDate(overview.range.end)}`}
        />
      </PageHero>

      <SleepSection data={overview.sleep} />
      <NutritionSection data={overview.nutrition} />
      <TrainingSection data={overview.training} />
    </PageShell>
  );
}
