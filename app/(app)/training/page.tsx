import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { HevyCsvUpload } from "@/components/hevy/hevy-csv-upload";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SetupRequired } from "@/components/ui/setup-required";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function TrainingPage() {
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
        eyebrow="Training"
        title="Hevy"
        description="Hevy ist der dedizierte Bereich für synced workouts, API-Sync und CSV-Fallback."
      />

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <HevyCsvUpload />

        <Card className="space-y-4 p-5 md:p-6">
          <div>
            <CardTitle>Provider-Bereich</CardTitle>
            <CardDescription className="mt-2">
              Training lebt jetzt in seinem eigenen Hevy-Bereich und bleibt von Meals und Sleep
              getrennt.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-border bg-muted px-4 py-4">
            <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Hevy</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              API-Sync und CSV-Import bleiben unverändert aktiv. Daily und Weekly lesen weiterhin
              dieselben Hevy-Datenquellen.
            </p>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
