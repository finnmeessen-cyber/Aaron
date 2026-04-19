import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { SupplementStack } from "@/components/supplements/supplement-stack";
import { SetupRequired } from "@/components/ui/setup-required";
import { getSupplementsPageData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SupplementsPage() {
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

  const data = await getSupplementsPageData(supabase, user.id);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Stack"
        title="Supplement-Plan"
        description="Aktiviere deinen Stack, passe Dosis und Timing an und halte Hinweise pro Supplement fest."
      />
      <SupplementStack {...data} />
    </PageShell>
  );
}
