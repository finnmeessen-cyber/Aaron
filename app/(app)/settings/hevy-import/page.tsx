import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { PageHero } from "@/components/app-shell/page-hero";
import { PageShell } from "@/components/app-shell/page-shell";
import { HevyCsvUpload } from "@/components/hevy/hevy-csv-upload";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SetupRequired } from "@/components/ui/setup-required";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SETTINGS_ROUTE = "/settings" as Route;

export default async function HevyImportPage() {
  if (!hasSupabaseEnv()) {
    return <SetupRequired />;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <PageShell className="gap-6">
      <PageHero className="space-y-5">
        <div className="flex">
          <Link
            href={SETTINGS_ROUTE}
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-medium transition hover:border-primary/40 hover:bg-background"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück zu Settings
          </Link>
        </div>

        <PageHeader
          eyebrow="Settings"
          title="Hevy Import"
          description="Sync deine Hevy Workouts direkt oder nutze den CSV-Export als Fallback."
        />
      </PageHero>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <HevyCsvUpload />
        </div>

        <div className="space-y-5">
          <Card className="space-y-4 p-5 md:p-6">
            <div>
              <CardTitle>So funktioniert es</CardTitle>
              <CardDescription className="mt-2">
                Der Import bleibt bewusst einfach und folgt denselben Layout- und Card-Mustern wie
                der Rest der App.
              </CardDescription>
            </div>
            <div className="space-y-3">
              {[
                "Verbinde deinen Hevy API Key einmal serverseitig und starte den Sync manuell.",
                "Die App nutzt den offiziellen Hevy Workouts-Endpoint und speichert jeden Lauf als Data Import.",
                "CSV bleibt als Fallback verfügbar, falls du lieber über den Export importierst."
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-muted px-4 py-4"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-5 md:p-6">
            <div>
              <CardTitle>Unterstütztes Format</CardTitle>
              <CardDescription className="mt-2">
                API-Sync nutzt den offiziellen Hevy Endpoint. CSV bleibt als Fallback aktiv.
              </CardDescription>
            </div>
            <div className="rounded-2xl border border-border bg-muted px-4 py-4">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                CSV Fallback
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground">title</span>,{" "}
                <span className="font-medium text-foreground">start_time</span> und{" "}
                <span className="font-medium text-foreground">end_time</span> müssen vorhanden
                sein. Doppelte Uploads und Re-Syncs werden sicher erkannt.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
