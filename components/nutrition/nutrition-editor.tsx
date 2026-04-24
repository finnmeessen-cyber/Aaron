"use client";

import { Moon, Salad, Dumbbell } from "lucide-react";

import { FatSecretSyncCard } from "@/components/nutrition/fatsecret-sync-card";
import type { NutritionPageData } from "@/lib/data";
import { HevyCsvUpload } from "@/components/hevy/hevy-csv-upload";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function NutritionEditor({
  fatsecretDaily,
  fatsecretFlashStatus = null,
  mealTemplates: _mealTemplates,
  settings: _settings
}: NutritionPageData & {
  fatsecretFlashStatus?: "connected" | "error" | null;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <Salad className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.32em]">Meals</p>
          </div>
          <div>
            <CardTitle>FatSecret</CardTitle>
            <CardDescription className="mt-2">
              FatSecret ist die sichtbare Quelle für Meals und Tagesmakros.
            </CardDescription>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <Dumbbell className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.32em]">Training</p>
          </div>
          <div>
            <CardTitle>Hevy</CardTitle>
            <CardDescription className="mt-2">
              Hevy bleibt der Sync-Pfad für importierte Workouts und Trainingsstatus.
            </CardDescription>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <Moon className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.32em]">Sleep</p>
          </div>
          <div>
            <CardTitle>Fitbit</CardTitle>
            <CardDescription className="mt-2">
              Fitbit sleep sync will be added later.
            </CardDescription>
          </div>
        </Card>
      </div>

      <section id="fatsecret" className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-primary">Meals</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">FatSecret</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Synced meals and macros are read-only here. Manual macro framing is no longer part of
            the meals flow.
          </p>
        </div>
        <FatSecretSyncCard daily={fatsecretDaily} flashStatus={fatsecretFlashStatus} />
      </section>

      <section id="hevy" className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-primary">Training</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Hevy</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Synced workouts stay in their own provider area and continue to feed Daily and Weekly.
          </p>
        </div>
        <HevyCsvUpload
          variant="compact"
          title="Hevy Sync"
          description="Hevy API oder CSV-Import für synced workouts."
          hint={null}
        />
      </section>

      <section id="fitbit" className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-primary">Sleep</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Fitbit</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Fitbit sleep sync will be added later.
          </p>
        </div>
        <Card className="space-y-3">
          <CardTitle>Fitbit Placeholder</CardTitle>
          <CardDescription>
            No Fitbit API integration yet. This section prepares a dedicated provider area without
            showing fake sleep data.
          </CardDescription>
        </Card>
      </section>
    </div>
  );
}
