import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { IntegrationsOverview } from "@/components/settings/integrations-overview";
import { SetupRequired } from "@/components/ui/setup-required";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SettingsIntegrationsPage() {
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

  return (
    <PageShell className="gap-5">
      <PageHeader
        eyebrow="Settings"
        title="Integrations"
        description="Status- und Management-Einstieg fuer FatSecret, Hevy und den spaeteren Fitbit-Bereich."
      />
      <IntegrationsOverview />
    </PageShell>
  );
}
