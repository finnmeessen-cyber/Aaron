import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { PhaseSelector } from "@/components/phases/phase-selector";
import { SetupRequired } from "@/components/ui/setup-required";
import { getPhasesPageData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SettingsPhasesPage() {
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

  const data = await getPhasesPageData(supabase, user.id);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="Phasen-System"
        description="Entzug, Stabilisierung und Performance Mode mit Ziel, Timing und aktiven Supplements."
      />
      <PhaseSelector {...data} />
    </PageShell>
  );
}
