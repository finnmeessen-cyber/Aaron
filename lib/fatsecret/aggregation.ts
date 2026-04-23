import "server-only";

import { FATSECRET_PROVIDER, type DailyEntryInsert } from "@/lib/fatsecret/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PersistenceSupabase =
  | Pick<ReturnType<typeof createServerSupabaseClient>, "from">
  | Pick<ReturnType<typeof createAdminSupabaseClient>, "from">;
type MutationError = { message: string } | null;
type MutationUpsertOptions = {
  count?: "exact" | "planned" | "estimated";
  defaultToNull?: boolean;
  ignoreDuplicates?: boolean;
  onConflict?: string;
};
type UpsertableTable<Payload> = {
  upsert: (values: Payload, options?: MutationUpsertOptions) => Promise<{ error: MutationError }>;
};

export async function aggregateFatSecretDailyEntries({
  dates,
  persistenceSupabase,
  triggerSource,
  userId
}: {
  dates: string[];
  persistenceSupabase: PersistenceSupabase;
  triggerSource: "manual" | "cron";
  userId: string;
}) {
  const uniqueDates = Array.from(new Set(dates)).sort();

  if (!uniqueDates.length) {
    return 0;
  }

  const [
    { data: nutritionData, error: nutritionError },
    { data: existingEntriesData, error: existingEntriesError }
  ] = await Promise.all([
    persistenceSupabase
      .from("source_nutrition_entries")
      .select("entry_date, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .eq("provider", FATSECRET_PROVIDER)
      .in("entry_date", uniqueDates),
    persistenceSupabase
      .from("daily_entries")
      .select("entry_date, nutrition_source")
      .eq("user_id", userId)
      .in("entry_date", uniqueDates)
  ]);

  if (nutritionError) {
    throw new Error(`Unable to load FatSecret nutrition entries for aggregation: ${nutritionError.message}.`);
  }

  if (existingEntriesError) {
    throw new Error(`Unable to load existing daily nutrition entries: ${existingEntriesError.message}.`);
  }

  const nutritionRows = (nutritionData ?? []) as Array<{
    calories: number | null;
    carbs_g: number | null;
    entry_date: string;
    fat_g: number | null;
    protein_g: number | null;
  }>;
  const existingEntries = new Map(
    ((existingEntriesData ?? []) as Array<{
      entry_date: string;
      nutrition_source: string | null;
    }>).map((row) => [row.entry_date, row.nutrition_source])
  );

  const totals = new Map<
    string,
    {
      calories: number;
      carbsG: number;
      fatG: number;
      proteinG: number;
    }
  >();

  for (const row of nutritionRows) {
    const entryDate = row.entry_date;
    const current = totals.get(entryDate) ?? {
      calories: 0,
      carbsG: 0,
      fatG: 0,
      proteinG: 0
    };

    current.calories += row.calories ?? 0;
    current.proteinG += row.protein_g ?? 0;
    current.carbsG += row.carbs_g ?? 0;
    current.fatG += row.fat_g ?? 0;
    totals.set(entryDate, current);
  }

  const payload: DailyEntryInsert[] = uniqueDates.flatMap((entryDate) => {
    const existingNutritionSource = existingEntries.get(entryDate);

    if (existingNutritionSource === "manual") {
      return [];
    }

    const total = totals.get(entryDate);

    if (!total) {
      return [];
    }

    return [{
      calories: total ? Number(total.calories.toFixed(2)) : null,
      carbs_g: total ? Number(total.carbsG.toFixed(2)) : null,
      entry_date: entryDate,
      fat_g: total ? Number(total.fatG.toFixed(2)) : null,
      nutrition_source: FATSECRET_PROVIDER,
      protein_g: total ? Number(total.proteinG.toFixed(2)) : null,
      user_id: userId
    }];
  });

  if (!payload.length) {
    return 0;
  }

  console.log("FatSecret DEBUG AGGREGATION", {
    dateCount: uniqueDates.length,
    payloadCount: payload.length,
    step: "aggregate_daily_entries",
    triggerSource,
    userId
  });
  const dailyEntriesTable =
    persistenceSupabase.from("daily_entries") as unknown as UpsertableTable<DailyEntryInsert[]>;
  const { error: upsertError } = await dailyEntriesTable.upsert(payload, {
    onConflict: "user_id,entry_date"
  });

  if (upsertError) {
    throw new Error(`Unable to update daily nutrition totals: ${upsertError.message}.`);
  }

  return payload.length;
}
