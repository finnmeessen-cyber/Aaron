import { PageHeader } from "@/components/app-shell/page-header";
import { PageHero } from "@/components/app-shell/page-hero";
import { PageShell } from "@/components/app-shell/page-shell";
import { DailyTrackerForm } from "@/components/daily/daily-tracker-form";
import { SetupRequired } from "@/components/ui/setup-required";
import { getDailyPageData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDisplayDate } from "@/lib/utils";

export default async function DailyPage({
  searchParams
}: {
  searchParams?: {
    date?: string;
  };
}) {
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

  const data = await getDailyPageData(supabase, user.id, searchParams?.date);

  return (
    <PageShell className="gap-6">
      <PageHero>
        <PageHeader
          eyebrow="Daily Tracker"
          title={formatDisplayDate(data.selectedDate)}
          description="Gewicht, Schlaf, Energie, Cravings, Training und komplette Checklisten in einer mobilen Erfassungsfläche."
        />
      </PageHero>
      <DailyTrackerForm {...data} />
    </PageShell>
  );
}
