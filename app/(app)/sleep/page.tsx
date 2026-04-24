import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SetupRequired } from "@/components/ui/setup-required";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SleepPage() {
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
        eyebrow="Sleep"
        title="Fitbit"
        description="Dedizierter Placeholder für die spätere Fitbit Sleep-Integration."
      />

      <Card className="space-y-4 p-5 md:p-6">
        <div>
          <CardTitle>Fitbit Placeholder</CardTitle>
          <CardDescription className="mt-2">
            Fitbit sleep sync will be added later.
          </CardDescription>
        </div>
        <div className="rounded-2xl border border-border bg-muted px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Sleep</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Noch keine Fitbit API-Integration. Dieser Bereich reserviert die klare Provider-Fläche
            für Sleep, ohne Fake-Daten oder vorgezogene Sync-Logik.
          </p>
        </div>
      </Card>
    </PageShell>
  );
}
