import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { SettingsForm } from "@/components/settings/settings-form";
import { SetupRequired } from "@/components/ui/setup-required";
import { getSettingsPageData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
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

  const data = await getSettingsPageData(supabase, user.id);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="Einstellungen"
        description="Steuere Makros, Trainingstage, Theme, aktive Supplements und aktuelle Phase zentral an einem Ort."
      />
      <SettingsForm {...data} />
    </PageShell>
  );
}
