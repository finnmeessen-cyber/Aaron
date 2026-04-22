import { PageHeader } from "@/components/app-shell/page-header";
import { PageHero } from "@/components/app-shell/page-hero";
import { PageShell } from "@/components/app-shell/page-shell";
import { Card } from "@/components/ui/card";
import { SetupRequired } from "@/components/ui/setup-required";
import { getReviewPageData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/utils";

function SummaryValue({
  label,
  value,
  sublabel
}: {
  label: string;
  sublabel?: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4">
      <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {sublabel ? <p className="mt-1 text-sm text-muted-foreground">{sublabel}</p> : null}
    </div>
  );
}

function DayRow({
  calories,
  cravings,
  date,
  energy,
  sleep,
  trainingCompleted
}: {
  calories: number | null;
  cravings: number | null;
  date: string;
  energy: number | null;
  sleep: number | null;
  trainingCompleted: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <p className="text-sm font-medium">{formatShortDate(date)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{calories !== null ? `${Math.round(calories)} kcal` : "kcal -"}</span>
        <span>{trainingCompleted ? "Training" : "Training -"}</span>
        <span>{sleep !== null ? `Sleep ${sleep.toFixed(1)}` : "Sleep -"}</span>
        <span>{energy !== null ? `Energy ${energy.toFixed(1)}` : "Energy -"}</span>
        <span>{cravings !== null ? `Cravings ${cravings.toFixed(1)}` : "Cravings -"}</span>
      </div>
    </div>
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

  const data = await getReviewPageData(supabase, user.id);

  return (
    <PageShell className="gap-5">
      <PageHero>
        <PageHeader
          title="Diese Woche"
          badge={`${formatShortDate(data.currentWeekStart)} - ${formatShortDate(data.currentWeekEnd)}`}
        />
      </PageHero>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryValue
          label="Kalorien"
          value={
            data.summary.caloriesAverage !== null
              ? `${Math.round(data.summary.caloriesAverage)} kcal`
              : "-"
          }
          sublabel={`${data.summary.caloriesLoggedDays}/7 Tage`}
        />
        <SummaryValue
          label="Training"
          value={`${data.summary.trainingDays}`}
          sublabel={`${data.summary.trackedDays}/7 Tage erfasst`}
        />
        <SummaryValue
          label="Schlaf"
          value={data.summary.sleepAverage !== null ? `${data.summary.sleepAverage.toFixed(1)}/10` : "-"}
        />
        <SummaryValue
          label="Energie"
          value={data.summary.energyAverage !== null ? `${data.summary.energyAverage.toFixed(1)}/10` : "-"}
        />
        <SummaryValue
          label="Cravings"
          value={data.summary.cravingsAverage !== null ? `${data.summary.cravingsAverage.toFixed(1)}/10` : "-"}
        />
      </div>

      <Card className="overflow-hidden p-0">
        {data.days.map((day) => (
          <DayRow key={day.date} {...day} />
        ))}
      </Card>
    </PageShell>
  );
}
