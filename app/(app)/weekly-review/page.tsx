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

type NutritionChartPoint = {
  date: string;
  value: number | null;
};

type TrainingTimelineDay = {
  active: boolean;
  date: string;
  durationMinutes: number | null;
};

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

function formatAxisDateLabel(date: string) {
  return formatShortDate(date).slice(0, 5);
}

function getTrainingConsistency(activeDays: number) {
  if (activeDays === 0) {
    return {
      description: "Keine aktiven Trainingstage in dieser Woche.",
      label: "Keine Einheit"
    };
  }

  if (activeDays <= 2) {
    return {
      description: "Leichte Woche mit wenig Trainingsfrequenz.",
      label: "Leichte Woche"
    };
  }

  if (activeDays <= 4) {
    return {
      description: "Solide Frequenz mit guter Wochenabdeckung.",
      label: "Solide Woche"
    };
  }

  return {
    description: "Hohe Aktivität mit vielen Trainingstagen.",
    label: "Hohe Aktivität"
  };
}

function buildNutritionChartGeometry(points: NutritionChartPoint[]) {
  const width = 100;
  const height = 100;
  const presentPoints = points
    .map((point, index) => ({
      index,
      value: point.value
    }))
    .filter((point): point is { index: number; value: number } => point.value !== null);

  if (!presentPoints.length) {
    return {
      circles: [] as Array<{ cx: number; cy: number; value: number }>,
      maxValue: null as number | null,
      minValue: null as number | null,
      path: null as string | null
    };
  }

  const values = presentPoints.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;

  const toX = (index: number) => (index / Math.max(points.length - 1, 1)) * width;
  const toY = (value: number) => height - ((value - minValue) / range) * height;

  const segments: string[] = [];
  let activeSegment: string[] = [];

  points.forEach((point, index) => {
    if (point.value === null) {
      if (activeSegment.length) {
        segments.push(activeSegment.join(" "));
        activeSegment = [];
      }
      return;
    }

    const x = toX(index);
    const y = toY(point.value);
    activeSegment.push(`${activeSegment.length === 0 ? "M" : "L"} ${x} ${y}`);
  });

  if (activeSegment.length) {
    segments.push(activeSegment.join(" "));
  }

  return {
    circles: presentPoints.map((point) => ({
      cx: toX(point.index),
      cy: toY(point.value),
      value: point.value
    })),
    maxValue,
    minValue,
    path: segments.join(" ")
  };
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

function TrainingTimeline({
  days,
  maxDurationMinutes
}: {
  days: TrainingTimelineDay[];
  maxDurationMinutes: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Aktive Tage</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Kompakter Verlauf auf Basis von Aktivität und verfügbarer Dauer.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{days.filter((day) => day.active).length}/7 aktiv</p>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((day) => {
          const barHeight =
            day.durationMinutes !== null && maxDurationMinutes > 0
              ? Math.max(14, (day.durationMinutes / maxDurationMinutes) * 72)
              : 10;

          return (
            <div
              key={day.date}
              className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-border/70 bg-muted/30 px-2 py-3"
            >
              <div className="flex h-20 items-end">
                {day.durationMinutes !== null ? (
                  <div
                    className={`w-6 rounded-full ${
                      day.active ? "bg-primary/80" : "bg-muted-foreground/40"
                    }`}
                    style={{ height: `${barHeight}px` }}
                  />
                ) : (
                  <div
                    className={`w-6 rounded-full border border-dashed ${
                      day.active ? "border-primary/60 bg-primary/10" : "border-border bg-transparent"
                    }`}
                    style={{ height: `${barHeight}px` }}
                  />
                )}
              </div>
              <span className="text-[11px] font-medium">{formatAxisDateLabel(day.date)}</span>
              <span className="text-[11px] text-muted-foreground">
                {day.durationMinutes !== null
                  ? `${Math.round(day.durationMinutes)}m`
                  : day.active
                    ? "aktiv"
                    : "–"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NutritionMetricChart({
  accentClassName,
  description,
  label,
  points,
  suffix,
  summaryValue
}: {
  accentClassName: string;
  description: string;
  label: string;
  points: NutritionChartPoint[];
  suffix: string;
  summaryValue: number | null;
}) {
  const { circles, maxValue, minValue, path } = buildNutritionChartGeometry(points);

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="text-sm font-medium">{formatValue(summaryValue, suffix, { maximumFractionDigits: 0 })}</p>
      </div>

      {path ? (
        <div className="mt-4">
          <div className="relative">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className={`h-36 w-full overflow-visible ${accentClassName}`}
              aria-hidden="true"
            >
              {[20, 50, 80].map((offset) => (
                <line
                  key={offset}
                  x1="0"
                  y1={offset}
                  x2="100"
                  y2={offset}
                  stroke="currentColor"
                  strokeDasharray="2 4"
                  strokeOpacity="0.12"
                />
              ))}
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {circles.map((circle, index) => (
                <circle
                  key={`${circle.value}-${index}`}
                  cx={circle.cx}
                  cy={circle.cy}
                  r="1.9"
                  fill="hsl(var(--background))"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              ))}
            </svg>

            <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-1 text-[11px] text-muted-foreground">
              <span>{formatValue(maxValue, suffix, { maximumFractionDigits: 0 })}</span>
              <span>{formatValue(minValue, suffix, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2 text-[11px] text-muted-foreground">
            {points.map((point) => (
              <span key={`${label}-${point.date}`} className="text-center">
                {formatAxisDateLabel(point.date)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
          Noch keine Datenpunkte in dieser Woche.
        </div>
      )}
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
  const caloriesPoints = data.days.map((day) => ({ date: day.date, value: day.calories }));
  const proteinPoints = data.days.map((day) => ({ date: day.date, value: day.protein }));
  const carbsPoints = data.days.map((day) => ({ date: day.date, value: day.carbs }));
  const fatPoints = data.days.map((day) => ({ date: day.date, value: day.fat }));

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

      <div className="grid gap-3 lg:grid-cols-2">
        <NutritionMetricChart
          label="Kalorien"
          description="Null-Werte bleiben Lücken und werden nicht als 0 gezeichnet."
          points={caloriesPoints}
          suffix=" kcal"
          summaryValue={data.averages.calories}
          accentClassName="text-primary"
        />
        <NutritionMetricChart
          label="Protein"
          description="Tageswerte aus dem Weekly-Overview, ohne zusätzliche Umrechnung."
          points={proteinPoints}
          suffix=" g"
          summaryValue={data.averages.protein}
          accentClassName="text-success"
        />
        <NutritionMetricChart
          label="Kohlenhydrate"
          description="Die 7 festen Tage bleiben erhalten, auch wenn einzelne Werte fehlen."
          points={carbsPoints}
          suffix=" g"
          summaryValue={data.averages.carbs}
          accentClassName="text-warning"
        />
        <NutritionMetricChart
          label="Fett"
          description="Fehlende Tage werden als fehlend behandelt, nicht als künstliche Null."
          points={fatPoints}
          suffix=" g"
          summaryValue={data.averages.fat}
          accentClassName="text-danger"
        />
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
  const consistency = getTrainingConsistency(data.summary.activeDays);
  const trackedDurationDays = data.days.filter((day) => day.durationMinutes !== null).length;
  const trackedVolumeWorkouts = data.days.reduce(
    (sum, day) => sum + day.workoutsWithKnownVolume,
    0
  );
  const averageDurationPerTrackedDay =
    trackedDurationDays > 0 ? data.summary.durationMinutes / trackedDurationDays : null;
  const averageVolumePerTrackedWorkout =
    trackedVolumeWorkouts > 0 ? data.summary.volumeKg / trackedVolumeWorkouts : null;
  const maxDurationMinutes = Math.max(
    ...data.days.map((day) => day.durationMinutes ?? 0),
    0
  );

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryValue label="Konsistenz" value={consistency.label} />
        <SummaryValue
          label="Ø Dauer / Tag*"
          value={formatValue(averageDurationPerTrackedDay, " min", { maximumFractionDigits: 0 })}
        />
        <SummaryValue
          label="Ø Volumen / Workout*"
          value={formatValue(averageVolumePerTrackedWorkout, " kg")}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {consistency.description} Werte mit * basieren nur auf Tagen oder Workouts, für die Dauer
        bzw. Volumen tatsächlich vorliegen.
      </p>

      {data.bestEffort ? (
        <p className="text-sm text-muted-foreground">
          Einige Trainingswerte sind best-effort, weil nicht jede Hevy-Payload vollständige Details enthält.
        </p>
      ) : null}

      <TrainingTimeline
        days={data.days.map((day) => ({
          active: day.active,
          date: day.date,
          durationMinutes: day.durationMinutes
        }))}
        maxDurationMinutes={maxDurationMinutes}
      />

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
