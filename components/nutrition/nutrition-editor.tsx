"use client";

import { FatSecretSyncCard } from "@/components/nutrition/fatsecret-sync-card";
import type { NutritionPageData } from "@/lib/data";

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
    </div>
  );
}
