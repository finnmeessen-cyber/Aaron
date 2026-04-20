import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/settings-form";
import { SetupRequired } from "@/components/ui/setup-required";
import { getSettingsPageData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const HEVY_IMPORT_ROUTE = "/settings/hevy-import" as Route;

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
    <PageShell className="gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Einstellungen"
        description="Steuere Makros, Trainingstage, Theme, aktive Supplements und aktuelle Phase zentral an einem Ort."
      />
      <Card className="space-y-4 p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Upload className="h-4 w-4" />
              <p className="text-xs uppercase tracking-[0.32em]">Data Import</p>
            </div>
            <div>
              <CardTitle className="text-xl">Hevy CSV importieren</CardTitle>
              <CardDescription className="mt-2">
                Öffne die Import-Seite, um einen exportierten Hevy Workout-CSV hochzuladen und
                Trainingstage automatisch zu markieren.
              </CardDescription>
            </div>
          </div>
          <Link
            href={HEVY_IMPORT_ROUTE}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-border bg-card px-5 text-sm font-medium transition hover:border-primary/40 hover:bg-muted"
          >
            Import öffnen
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </Card>
      <SettingsForm {...data} />
    </PageShell>
  );
}
