import { HevyImportError } from "@/lib/hevy/import";
import {
  HEVY_PROVIDER,
  type DailyEntryInsert,
  type DataImportInsert,
  type DataImportRow,
  type GroupedHevyWorkout,
  type HevyApiImportMetadata,
  type HevyCsvImportMetadata,
  type HevyImportResult,
  type HevySyncTriggerSource,
  type HevySyncResult,
  type SourceWorkoutInsert
} from "@/lib/hevy/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, TableRow } from "@/types/supabase";

type DatabaseSupabase = Pick<ReturnType<typeof createServerSupabaseClient>, "from">;
type MutationError = { message: string } | null;
type ExistingSourceWorkoutRow = Pick<
  TableRow<"source_workouts">,
  "provider_workout_id" | "raw_payload" | "workout_date"
>;
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
type UpdateableDailyEntriesTable<Payload> = {
  update: (values: Payload) => {
    eq: (column: string, value: string) => {
      in: (column: string, values: string[]) => Promise<{ error: MutationError }>;
    };
  };
};

function isJsonRecord(value: Json): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getGroupKeyFromRawPayload(rawPayload: Json) {
  if (!isJsonRecord(rawPayload)) {
    return null;
  }

  const groupKey = rawPayload.group_key;
  return typeof groupKey === "string" && groupKey ? groupKey : null;
}

function buildGroupedWorkoutPayload(
  userId: string,
  dataImportId: string,
  workout: GroupedHevyWorkout,
  userTimezone: string | null
): SourceWorkoutInsert {
  return {
    data_import_id: dataImportId,
    duration_minutes: workout.durationMinutes,
    provider: HEVY_PROVIDER,
    provider_workout_id: workout.providerWorkoutId,
    raw_payload: {
      end_time: workout.endTime,
      group_key: workout.groupKey,
      original_end_time: workout.endTime,
      original_start_time: workout.startTime,
      original_title: workout.title,
      rows: workout.rows.map((row) => ({
        row_number: row.rowNumber,
        ...row.source
      })),
      source_kind: workout.sourceKind ?? "csv",
      source_workout: workout.rawSource ?? null,
      start_time: workout.startTime,
      timestamp_assumption:
        workout.sourceKind === "api" ? "api_iso_8601" : "naive_local_treated_as_utc",
      title: workout.title,
      user_timezone: userTimezone
    },
    started_at: workout.startedAtIso,
    title: workout.title,
    user_id: userId,
    workout_date: workout.workoutDate
  };
}

async function findExistingImportByHash(
  supabase: DatabaseSupabase,
  userId: string,
  fileHash: string
) {
  const { data, error } = await supabase
    .from("data_imports")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", HEVY_PROVIDER)
    .eq("metadata->>file_hash", fileHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HevyImportError(`Unable to check existing Hevy imports: ${error.message}.`, 500);
  }

  return (data ?? null) as DataImportRow | null;
}

async function createDataImport(
  supabase: DatabaseSupabase,
  userId: string,
  metadata: HevyCsvImportMetadata | HevyApiImportMetadata
) {
  const dataImportsTable =
    supabase.from("data_imports") as unknown as InsertReturningTable<DataImportInsert, DataImportRow>;
  const payload: DataImportInsert = {
    metadata,
    provider: HEVY_PROVIDER,
    user_id: userId
  };

  const { data, error } = await dataImportsTable.insert(payload).select("*").single();

  if (error || !data) {
    throw new HevyImportError(`Unable to create the Hevy import record: ${error?.message}.`, 500);
  }

  return data as DataImportRow;
}

async function findExistingWorkoutsByGroupKey(
  supabase: DatabaseSupabase,
  userId: string,
  groupKeys: string[]
) {
  if (!groupKeys.length) {
    return new Map<string, ExistingSourceWorkoutRow>();
  }

  const { data, error } = await supabase
    .from("source_workouts")
    .select("provider_workout_id, raw_payload, workout_date")
    .eq("user_id", userId)
    .eq("provider", HEVY_PROVIDER)
    .in("raw_payload->>group_key", groupKeys);

  if (error) {
    throw new HevyImportError(`Unable to match existing Hevy workouts: ${error.message}.`, 500);
  }

  const rows = (data ?? []) as ExistingSourceWorkoutRow[];
  const workoutMap = new Map<string, ExistingSourceWorkoutRow>();

  for (const row of rows) {
    const groupKey = getGroupKeyFromRawPayload(row.raw_payload);

    if (groupKey) {
      workoutMap.set(groupKey, row);
    }
  }

  return workoutMap;
}

async function getExistingProviderWorkoutIdSet(
  supabase: DatabaseSupabase,
  userId: string,
  providerWorkoutIds: string[]
) {
  if (!providerWorkoutIds.length) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("source_workouts")
    .select("provider_workout_id")
    .eq("user_id", userId)
    .eq("provider", HEVY_PROVIDER)
    .in("provider_workout_id", providerWorkoutIds);

  if (error) {
    throw new HevyImportError(`Unable to load existing Hevy workouts: ${error.message}.`, 500);
  }

  const rows = (data ?? []) as Array<{ provider_workout_id: string }>;
  return new Set(rows.map((row) => row.provider_workout_id));
}

async function resolveWorkoutsForPersistence(
  supabase: DatabaseSupabase,
  userId: string,
  workouts: GroupedHevyWorkout[]
) {
  if (!workouts.length) {
    return {
      existingIdSet: new Set<string>(),
      normalizedWorkouts: [] as GroupedHevyWorkout[]
    };
  }

  const existingByGroupKey = await findExistingWorkoutsByGroupKey(
    supabase,
    userId,
    Array.from(new Set(workouts.map((workout) => workout.groupKey)))
  );

  const normalizedWorkouts = workouts.map((workout) => {
    const existingWorkout = existingByGroupKey.get(workout.groupKey);

    if (!existingWorkout) {
      return workout;
    }

    return {
      ...workout,
      providerWorkoutId: existingWorkout.provider_workout_id
    };
  });
  const existingIdSet = await getExistingProviderWorkoutIdSet(
    supabase,
    userId,
    Array.from(new Set(normalizedWorkouts.map((workout) => workout.providerWorkoutId)))
  );

  return {
    existingIdSet,
    normalizedWorkouts
  };
}

async function upsertCsvWorkouts(
  supabase: DatabaseSupabase,
  userId: string,
  dataImportId: string,
  workouts: GroupedHevyWorkout[],
  userTimezone: string | null
) {
  const { existingIdSet, normalizedWorkouts } = await resolveWorkoutsForPersistence(
    supabase,
    userId,
    workouts
  );

  if (!normalizedWorkouts.length) {
    return [];
  }

  const payload = normalizedWorkouts.map((workout) =>
    buildGroupedWorkoutPayload(userId, dataImportId, workout, userTimezone)
  );
  const sourceWorkoutsTable =
    supabase.from("source_workouts") as unknown as UpsertableTable<SourceWorkoutInsert[]>;
  const { error } = await sourceWorkoutsTable.upsert(payload, {
    ignoreDuplicates: true,
    onConflict: "user_id,provider,provider_workout_id"
  });

  if (error) {
    throw new HevyImportError(`Unable to save Hevy workouts: ${error.message}.`, 500);
  }

  return normalizedWorkouts.filter(
    (workout) => !existingIdSet.has(workout.providerWorkoutId)
  );
}

async function upsertApiWorkouts(
  supabase: DatabaseSupabase,
  userId: string,
  dataImportId: string,
  workouts: GroupedHevyWorkout[],
  userTimezone: string | null
) {
  const { existingIdSet, normalizedWorkouts } = await resolveWorkoutsForPersistence(
    supabase,
    userId,
    workouts
  );

  if (!normalizedWorkouts.length) {
    return [];
  }

  const payload = normalizedWorkouts.map((workout) =>
    buildGroupedWorkoutPayload(userId, dataImportId, workout, userTimezone)
  );
  const sourceWorkoutsTable =
    supabase.from("source_workouts") as unknown as UpsertableTable<SourceWorkoutInsert[]>;
  const { error } = await sourceWorkoutsTable.upsert(payload, {
    onConflict: "user_id,provider,provider_workout_id"
  });

  if (error) {
    throw new HevyImportError(`Unable to save Hevy workouts: ${error.message}.`, 500);
  }

  return normalizedWorkouts.filter(
    (workout) => !existingIdSet.has(workout.providerWorkoutId)
  );
}

async function upsertDailyEntries(
  supabase: DatabaseSupabase,
  userId: string,
  workoutDates: string[]
) {
  const uniqueWorkoutDates = Array.from(new Set(workoutDates)).sort();

  if (!uniqueWorkoutDates.length) {
    return 0;
  }

  const { data: existingEntriesData, error: existingEntriesError } = await supabase
    .from("daily_entries")
    .select("entry_date")
    .eq("user_id", userId)
    .in("entry_date", uniqueWorkoutDates);

  if (existingEntriesError) {
    throw new HevyImportError(
      `Unable to load matching daily entries: ${existingEntriesError.message}.`,
      500
    );
  }

  const existingEntries = (existingEntriesData ?? []) as Array<{ entry_date: string }>;
  const existingDateSet = new Set((existingEntries ?? []).map((entry) => entry.entry_date));
  const missingDates = uniqueWorkoutDates.filter((workoutDate) => !existingDateSet.has(workoutDate));
  const existingDates = uniqueWorkoutDates.filter((workoutDate) => existingDateSet.has(workoutDate));

  if (missingDates.length) {
    const payload: DailyEntryInsert[] = missingDates.map((workoutDate) => ({
      entry_date: workoutDate,
      training_completed: true,
      training_source: HEVY_PROVIDER,
      user_id: userId
    }));
    const dailyEntriesInsertTable =
      supabase.from("daily_entries") as unknown as UpsertableTable<DailyEntryInsert[]>;
    const { error } = await dailyEntriesInsertTable.upsert(payload, {
      onConflict: "user_id,entry_date"
    });

    if (error) {
      throw new HevyImportError(`Unable to insert daily entries: ${error.message}.`, 500);
    }
  }

  if (existingDates.length) {
    const dailyEntriesUpdateTable =
      supabase.from("daily_entries") as unknown as UpdateableDailyEntriesTable<{
        training_completed: boolean;
        training_source: string;
      }>;
    const { error } = await dailyEntriesUpdateTable
      .update({
        training_completed: true,
        training_source: HEVY_PROVIDER
      })
      .eq("user_id", userId)
      .in("entry_date", existingDates);

    if (error) {
      throw new HevyImportError(`Unable to update daily entries: ${error.message}.`, 500);
    }
  }

  return uniqueWorkoutDates.length;
}

export async function persistHevyImport({
  fileHash,
  fileName,
  fileSize,
  groupedWorkouts,
  parsedRows,
  supabase,
  userTimezone,
  userId
}: {
  fileHash: string;
  fileName: string | null;
  fileSize: number;
  groupedWorkouts: GroupedHevyWorkout[];
  parsedRows: number;
  supabase: DatabaseSupabase;
  userTimezone: string | null;
  userId: string;
}): Promise<HevyImportResult> {
  const existingImport = await findExistingImportByHash(supabase, userId, fileHash);
  const metadata: HevyCsvImportMetadata = {
    duplicate_of_import_id: existingImport?.id ?? null,
    file_hash: fileHash,
    file_name: fileName,
    file_size: fileSize,
    grouped_workouts: groupedWorkouts.length,
    parsed_rows: parsedRows,
    skipped_duplicate: Boolean(existingImport),
    source: "csv"
  };
  const dataImport = await createDataImport(supabase, userId, metadata);

  if (existingImport) {
    return {
      dataImportId: dataImport.id,
      duplicateImport: true,
      groupedWorkouts: groupedWorkouts.length,
      insertedWorkouts: 0,
      operation: "csv_import",
      parsedRows,
      updatedDailyEntries: 0
    };
  }

  const insertedWorkouts = await upsertCsvWorkouts(
    supabase,
    userId,
    dataImport.id,
    groupedWorkouts,
    userTimezone
  );
  const updatedDailyEntries = await upsertDailyEntries(
    supabase,
    userId,
    insertedWorkouts.map((workout) => workout.workoutDate)
  );

  return {
    dataImportId: dataImport.id,
    duplicateImport: false,
    groupedWorkouts: groupedWorkouts.length,
    insertedWorkouts: insertedWorkouts.length,
    operation: "csv_import",
    parsedRows,
    updatedDailyEntries
  };
}

export async function persistHevyApiSync({
  deletedEventsIgnored,
  fetchedWorkouts,
  groupedWorkouts,
  parsedRows,
  since,
  supabase,
  syncMode,
  syncStartedAt,
  triggerSource,
  userId,
  userInfo,
  userTimezone
}: {
  deletedEventsIgnored: number;
  fetchedWorkouts: number;
  groupedWorkouts: GroupedHevyWorkout[];
  parsedRows: number;
  since: string | null;
  supabase: DatabaseSupabase;
  syncMode: "full" | "incremental";
  syncStartedAt: string;
  triggerSource: HevySyncTriggerSource;
  userId: string;
  userInfo: {
    id: string;
    name: string;
    url: string;
  } | null;
  userTimezone: string | null;
}): Promise<HevySyncResult> {
  const metadata: HevyApiImportMetadata = {
    api_user_id: userInfo?.id ?? null,
    api_user_name: userInfo?.name ?? null,
    api_user_url: userInfo?.url ?? null,
    deleted_events_ignored: deletedEventsIgnored,
    fetched_workouts: fetchedWorkouts,
    grouped_workouts: groupedWorkouts.length,
    parsed_rows: parsedRows,
    since,
    source: "api",
    sync_mode: syncMode,
    sync_started_at: syncStartedAt,
    trigger_source: triggerSource
  };
  const dataImport = await createDataImport(supabase, userId, metadata);
  const insertedWorkouts = await upsertApiWorkouts(
    supabase,
    userId,
    dataImport.id,
    groupedWorkouts,
    userTimezone
  );
  const updatedDailyEntries = await upsertDailyEntries(
    supabase,
    userId,
    insertedWorkouts.map((workout) => workout.workoutDate)
  );

  return {
    dataImportId: dataImport.id,
    deletedEventsIgnored,
    fetchedWorkouts,
    insertedWorkouts: insertedWorkouts.length,
    operation: "api_sync",
    since,
    syncMode,
    triggerSource,
    updatedDailyEntries
  };
}
