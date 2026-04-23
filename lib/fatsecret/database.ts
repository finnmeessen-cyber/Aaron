import "server-only";

import { aggregateFatSecretDailyEntries } from "@/lib/fatsecret/aggregation";
import {
  FATSECRET_PROVIDER,
  type DataImportInsert,
  type DataImportRow,
  type FatSecretApiImportMetadata,
  type FatSecretFoodEntry,
  type FatSecretStoredConnection,
  type FatSecretSyncImportStatus,
  type FatSecretSyncMode,
  type FatSecretSyncResult,
  type FatSecretSyncTriggerSource,
  type SourceNutritionEntryInsert
} from "@/lib/fatsecret/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type DatabaseSupabase = Pick<ReturnType<typeof createServerSupabaseClient>, "from">;
type MutationError = { message: string } | null;
type MutationInsertOptions = {
  count?: "exact" | "planned" | "estimated";
  defaultToNull?: boolean;
};
type MutationUpsertOptions = {
  count?: "exact" | "planned" | "estimated";
  defaultToNull?: boolean;
  ignoreDuplicates?: boolean;
  onConflict?: string;
};
type InsertReturningTable<Payload, Row> = {
  insert: (
    values: Payload,
    options?: MutationInsertOptions
  ) => {
    select: (columns?: string) => {
      single: () => Promise<{ data: Row | null; error: MutationError }>;
    };
  };
};
type UpsertableTable<Payload> = {
  upsert: (values: Payload, options?: MutationUpsertOptions) => Promise<{ error: MutationError }>;
};
type ChainedUpdateTable<Payload> = {
  update: (values: Payload) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => Promise<{ error: MutationError }>;
    };
  };
};

type PendingFatSecretApiImportContext = {
  dataImportId: string;
  metadata: FatSecretApiImportMetadata;
};

function buildPendingFatSecretApiImportMetadata({
  endDate,
  startDate,
  syncMode,
  syncStartedAt,
  triggerSource
}: {
  endDate: string;
  startDate: string;
  syncMode: FatSecretSyncMode;
  syncStartedAt: string;
  triggerSource: FatSecretSyncTriggerSource;
}): FatSecretApiImportMetadata {
  return {
    deleted_entries: 0,
    end_date: endDate,
    fetched_dates: 0,
    fetched_entries: 0,
    last_synced_date: null,
    source: "api",
    start_date: startDate,
    sync_completed_at: null,
    sync_error: null,
    sync_failed_at: null,
    sync_mode: syncMode,
    sync_started_at: syncStartedAt,
    sync_status: "pending",
    trigger_source: triggerSource,
    updated_daily_entries: 0,
    upserted_entries: 0
  };
}

function buildFinalizedFatSecretApiImportMetadata({
  deletedEntries,
  fetchedDates,
  fetchedEntries,
  previousMetadata,
  status,
  syncCompletedAt,
  syncError,
  syncFailedAt,
  updatedDailyEntries,
  upsertedEntries
}: {
  deletedEntries: number;
  fetchedDates: number;
  fetchedEntries: number;
  previousMetadata: FatSecretApiImportMetadata;
  status: FatSecretSyncImportStatus;
  syncCompletedAt: string | null;
  syncError: string | null;
  syncFailedAt: string | null;
  updatedDailyEntries: number;
  upsertedEntries: number;
}) {
  return {
    ...previousMetadata,
    deleted_entries: deletedEntries,
    fetched_dates: fetchedDates,
    fetched_entries: fetchedEntries,
    last_synced_date: status === "success" ? previousMetadata.end_date : previousMetadata.last_synced_date,
    sync_completed_at: syncCompletedAt,
    sync_error: syncError,
    sync_failed_at: syncFailedAt,
    sync_status: status,
    updated_daily_entries: updatedDailyEntries,
    upserted_entries: upsertedEntries
  } satisfies FatSecretApiImportMetadata;
}

function sanitizeFatSecretSyncError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 240);
  }

  return "FatSecret sync failed.";
}

function buildNutritionEntryPayload(
  userId: string,
  dataImportId: string,
  entry: FatSecretFoodEntry
): SourceNutritionEntryInsert {
  return {
    calories: entry.calories,
    carbs_g: entry.carbsG,
    data_import_id: dataImportId,
    entry_date: entry.entryDate,
    fat_g: entry.fatG,
    food_name: entry.foodName,
    meal_type: entry.mealType,
    protein_g: entry.proteinG,
    provider: FATSECRET_PROVIDER,
    provider_entry_id: entry.profileEntryId,
    raw_payload: entry.rawPayload,
    user_id: userId
  };
}

export function isSuccessfulFatSecretApiImportMetadata(
  metadata: DataImportRow["metadata"]
): metadata is FatSecretApiImportMetadata {
  if (typeof metadata !== "object" || !metadata) {
    return false;
  }

  return (
    "source" in metadata &&
    metadata.source === "api" &&
    "sync_status" in metadata &&
    metadata.sync_status === "success" &&
    "sync_started_at" in metadata &&
    typeof metadata.sync_started_at === "string"
  );
}

export async function getLatestSuccessfulFatSecretApiImport(
  supabase: DatabaseSupabase,
  userId: string
) {
  const { data, error } = await supabase
    .from("data_imports")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", FATSECRET_PROVIDER)
    .eq("metadata->>source", "api")
    .eq("metadata->>sync_status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the latest FatSecret sync state: ${error.message}.`);
  }

  return (data ?? null) as DataImportRow | null;
}

async function createDataImport(
  supabase: DatabaseSupabase,
  userId: string,
  metadata: FatSecretApiImportMetadata
) {
  const dataImportsTable =
    supabase.from("data_imports") as unknown as InsertReturningTable<DataImportInsert, DataImportRow>;
  const payload: DataImportInsert = {
    metadata,
    provider: FATSECRET_PROVIDER,
    user_id: userId
  };
  const { data, error } = await dataImportsTable.insert(payload).select("*").single();

  if (error || !data) {
    throw new Error(`Unable to create the FatSecret import record: ${error?.message}.`);
  }

  return data as DataImportRow;
}

async function updateDataImportMetadata(
  supabase: DatabaseSupabase,
  userId: string,
  dataImportId: string,
  metadata: FatSecretApiImportMetadata
) {
  const dataImportsUpdateTable = supabase.from(
    "data_imports"
  ) as unknown as ChainedUpdateTable<{ metadata: FatSecretApiImportMetadata }>;
  const { error } = await dataImportsUpdateTable
    .update({ metadata })
    .eq("id", dataImportId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Unable to update the FatSecret import record: ${error.message}.`);
  }
}

async function replaceSourceNutritionEntries({
  dataImportId,
  entriesByDate,
  supabase,
  syncedDates,
  userId
}: {
  dataImportId: string;
  entriesByDate: Map<string, FatSecretFoodEntry[]>;
  supabase: DatabaseSupabase;
  syncedDates: string[];
  userId: string;
}) {
  let upsertedEntries = 0;

  for (const entryDate of syncedDates) {
    const entries = entriesByDate.get(entryDate) ?? [];

    if (!entries.length) {
      continue;
    }

    const payload = entries.map((entry) => buildNutritionEntryPayload(userId, dataImportId, entry));
    const nutritionEntriesTable =
      supabase.from("source_nutrition_entries") as unknown as UpsertableTable<
        SourceNutritionEntryInsert[]
      >;
    const { error } = await nutritionEntriesTable.upsert(payload, {
      onConflict: "user_id,provider,provider_entry_id"
    });

    if (error) {
      throw new Error(`Unable to save FatSecret nutrition entries: ${error.message}.`);
    }

    upsertedEntries += payload.length;
  }

  return {
    upsertedEntries
  };
}

export const persistFatSecretApiSync = {
  async completeFailure({
    dataImportId,
    error,
    previousMetadata,
    supabase,
    userId
  }: {
    dataImportId: string;
    error: unknown;
    previousMetadata: FatSecretApiImportMetadata;
    supabase: DatabaseSupabase;
    userId: string;
  }) {
    const syncFailedAt = new Date().toISOString();
    const metadata = buildFinalizedFatSecretApiImportMetadata({
      deletedEntries: 0,
      fetchedDates: 0,
      fetchedEntries: 0,
      previousMetadata,
      status: "failed",
      syncCompletedAt: null,
      syncError: sanitizeFatSecretSyncError(error),
      syncFailedAt,
      updatedDailyEntries: 0,
      upsertedEntries: 0
    });

    await updateDataImportMetadata(supabase, userId, dataImportId, metadata);
  },

  async completeSuccess({
    dataImportId,
    entriesByDate,
    fetchedEntries,
    previousMetadata,
    supabase,
    syncedDates,
    userId
  }: {
    dataImportId: string;
    entriesByDate: Map<string, FatSecretFoodEntry[]>;
    fetchedEntries: number;
    previousMetadata: FatSecretApiImportMetadata;
    supabase: DatabaseSupabase;
    syncedDates: string[];
    userId: string;
  }): Promise<FatSecretSyncResult> {
    const { upsertedEntries } = await replaceSourceNutritionEntries({
      dataImportId,
      entriesByDate,
      supabase,
      syncedDates,
      userId
    });
    const updatedDailyEntries = await aggregateFatSecretDailyEntries({
      dates: syncedDates,
      supabase,
      userId
    });
    const syncCompletedAt = new Date().toISOString();
    const metadata = buildFinalizedFatSecretApiImportMetadata({
      deletedEntries: 0,
      fetchedDates: syncedDates.length,
      fetchedEntries,
      previousMetadata,
      status: "success",
      syncCompletedAt,
      syncError: null,
      syncFailedAt: null,
      updatedDailyEntries,
      upsertedEntries
    });

    await updateDataImportMetadata(supabase, userId, dataImportId, metadata);

    return {
      dataImportId,
      deletedEntries: 0,
      endDate: previousMetadata.end_date,
      fetchedDates: syncedDates.length,
      fetchedEntries,
      operation: "api_sync",
      since: previousMetadata.last_synced_date,
      startDate: previousMetadata.start_date,
      syncMode: previousMetadata.sync_mode,
      triggerSource: previousMetadata.trigger_source,
      updatedDailyEntries,
      upsertedEntries
    };
  },

  async createPendingImport({
    endDate,
    startDate,
    supabase,
    syncMode,
    syncStartedAt,
    triggerSource,
    userId
  }: {
    endDate: string;
    startDate: string;
    supabase: DatabaseSupabase;
    syncMode: FatSecretSyncMode;
    syncStartedAt: string;
    triggerSource: FatSecretSyncTriggerSource;
    userId: string;
  }): Promise<PendingFatSecretApiImportContext> {
    const metadata = buildPendingFatSecretApiImportMetadata({
      endDate,
      startDate,
      syncMode,
      syncStartedAt,
      triggerSource
    });
    const dataImport = await createDataImport(supabase, userId, metadata);

    return {
      dataImportId: dataImport.id,
      metadata
    };
  }
};
