import { HevyImportError } from "@/lib/hevy/import";
import {
  HEVY_PROVIDER,
  type DailyEntryInsert,
  type DataImportInsert,
  type DataImportRow,
  type GroupedHevyWorkout,
  type HevyApiImportMetadata,
  type HevyApiSyncStatus,
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
  "id" | "provider_workout_id" | "raw_payload" | "workout_date"
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
type ChainedUpdateTable<Payload> = {
  update: (values: Payload) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => Promise<{ error: MutationError }>;
    };
  };
};

type PendingHevyApiImportContext = {
  dataImportId: string;
  metadata: HevyApiImportMetadata;
};

function isJsonRecord(value: unknown): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getGroupKeyFromRawPayload(rawPayload: Json) {
  if (!isJsonRecord(rawPayload)) {
    return null;
  }

  const groupKey = rawPayload.group_key;
  return typeof groupKey === "string" && groupKey ? groupKey : null;
}

function getSourceKindFromRawPayload(rawPayload: Json) {
  if (!isJsonRecord(rawPayload)) {
    return null;
  }

  const sourceKind = rawPayload.source_kind;
  return sourceKind === "api" || sourceKind === "csv" ? sourceKind : null;
}

function getSourceWorkoutIdFromRawPayload(rawPayload: Json) {
  if (!isJsonRecord(rawPayload)) {
    return null;
  }

  const sourceWorkout = rawPayload.source_workout;

  if (!isJsonRecord(sourceWorkout)) {
    return null;
  }

  const sourceWorkoutId = sourceWorkout.id;
  return typeof sourceWorkoutId === "string" && sourceWorkoutId ? sourceWorkoutId : null;
}

function buildPendingHevyApiImportMetadata({
  since,
  syncMode,
  syncStartedAt,
  triggerSource
}: {
  since: string | null;
  syncMode: "full" | "incremental";
  syncStartedAt: string;
  triggerSource: HevySyncTriggerSource;
}): HevyApiImportMetadata {
  return {
    api_user_id: null,
    api_user_name: null,
    api_user_url: null,
    deleted_events_ignored: 0,
    fetched_workouts: 0,
    grouped_workouts: 0,
    parsed_rows: 0,
    since,
    source: "api",
    sync_completed_at: null,
    sync_error: null,
    sync_failed_at: null,
    sync_mode: syncMode,
    sync_started_at: syncStartedAt,
    sync_status: "pending",
    trigger_source: triggerSource
  };
}

function buildFinalizedHevyApiImportMetadata({
  deletedEventsIgnored,
  fetchedWorkouts,
  groupedWorkouts,
  parsedRows,
  previousMetadata,
  status,
  syncCompletedAt,
  syncError,
  syncFailedAt,
  userInfo
}: {
  deletedEventsIgnored: number;
  fetchedWorkouts: number;
  groupedWorkouts: number;
  parsedRows: number;
  previousMetadata: HevyApiImportMetadata;
  status: HevyApiSyncStatus;
  syncCompletedAt: string | null;
  syncError: string | null;
  syncFailedAt: string | null;
  userInfo: {
    id: string;
    name: string;
    url: string;
  } | null;
}): HevyApiImportMetadata {
  return {
    ...previousMetadata,
    api_user_id: userInfo?.id ?? null,
    api_user_name: userInfo?.name ?? null,
    api_user_url: userInfo?.url ?? null,
    deleted_events_ignored: deletedEventsIgnored,
    fetched_workouts: fetchedWorkouts,
    grouped_workouts: groupedWorkouts,
    parsed_rows: parsedRows,
    sync_completed_at: syncCompletedAt,
    sync_error: syncError,
    sync_failed_at: syncFailedAt,
    sync_status: status
  };
}

function sanitizeHevySyncError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 240);
  }

  return "Hevy sync failed.";
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
    .select("id, provider_workout_id, raw_payload, workout_date")
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

async function findExistingWorkoutsByProviderWorkoutId(
  supabase: DatabaseSupabase,
  userId: string,
  providerWorkoutIds: string[]
) {
  if (!providerWorkoutIds.length) {
    return new Map<string, ExistingSourceWorkoutRow>();
  }

  const { data, error } = await supabase
    .from("source_workouts")
    .select("id, provider_workout_id, raw_payload, workout_date")
    .eq("user_id", userId)
    .eq("provider", HEVY_PROVIDER)
    .in("provider_workout_id", providerWorkoutIds);

  if (error) {
    throw new HevyImportError(`Unable to load existing Hevy workouts: ${error.message}.`, 500);
  }

  const rows = (data ?? []) as ExistingSourceWorkoutRow[];
  return new Map(rows.map((row) => [row.provider_workout_id, row]));
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
  const existingByProviderWorkoutId = await findExistingWorkoutsByProviderWorkoutId(
    supabase,
    userId,
    Array.from(new Set(normalizedWorkouts.map((workout) => workout.providerWorkoutId)))
  );
  const existingIdSet = new Set(existingByProviderWorkoutId.keys());

  return {
    existingIdSet,
    normalizedWorkouts
  };
}

function canUpgradeBridgeMatchToApiIdentity(
  existingWorkout: ExistingSourceWorkoutRow,
  providerWorkoutId: string
) {
  const sourceKind = getSourceKindFromRawPayload(existingWorkout.raw_payload);

  if (sourceKind === "csv") {
    return true;
  }

  if (sourceKind !== "api") {
    return false;
  }

  return getSourceWorkoutIdFromRawPayload(existingWorkout.raw_payload) === providerWorkoutId;
}

async function upgradeBridgeMatchedWorkoutToApiIdentity(
  supabase: DatabaseSupabase,
  userId: string,
  existingWorkout: ExistingSourceWorkoutRow,
  providerWorkoutId: string
) {
  const sourceWorkoutsUpdateTable = supabase.from(
    "source_workouts"
  ) as unknown as ChainedUpdateTable<{ provider_workout_id: string }>;
  const { error } = await sourceWorkoutsUpdateTable
    .update({
      provider_workout_id: providerWorkoutId
    })
    .eq("id", existingWorkout.id)
    .eq("user_id", userId);

  if (error) {
    throw new HevyImportError(`Unable to reconcile an existing Hevy workout: ${error.message}.`, 500);
  }
}

async function resolveApiWorkoutsForPersistence(
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

  const [existingByProviderWorkoutId, existingByGroupKey] = await Promise.all([
    findExistingWorkoutsByProviderWorkoutId(
      supabase,
      userId,
      Array.from(new Set(workouts.map((workout) => workout.providerWorkoutId)))
    ),
    findExistingWorkoutsByGroupKey(
      supabase,
      userId,
      Array.from(new Set(workouts.map((workout) => workout.groupKey)))
    )
  ]);
  const existingIdSet = new Set(existingByProviderWorkoutId.keys());

  for (const workout of workouts) {
    if (existingIdSet.has(workout.providerWorkoutId)) {
      continue;
    }

    const bridgeMatch = existingByGroupKey.get(workout.groupKey);

    if (!bridgeMatch || !canUpgradeBridgeMatchToApiIdentity(bridgeMatch, workout.providerWorkoutId)) {
      continue;
    }

    await upgradeBridgeMatchedWorkoutToApiIdentity(
      supabase,
      userId,
      bridgeMatch,
      workout.providerWorkoutId
    );
    existingIdSet.add(workout.providerWorkoutId);
  }

  return {
    existingIdSet,
    normalizedWorkouts: workouts
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
  const { existingIdSet, normalizedWorkouts } = await resolveApiWorkoutsForPersistence(
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

async function updateDataImportMetadata(
  supabase: DatabaseSupabase,
  userId: string,
  dataImportId: string,
  metadata: HevyApiImportMetadata
) {
  const dataImportsUpdateTable = supabase.from(
    "data_imports"
  ) as unknown as ChainedUpdateTable<{ metadata: HevyApiImportMetadata }>;
  const { error } = await dataImportsUpdateTable
    .update({ metadata })
    .eq("id", dataImportId)
    .eq("user_id", userId);

  if (error) {
    throw new HevyImportError(`Unable to update the Hevy import record: ${error.message}.`, 500);
  }
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

export const persistHevyApiSync = {
  async completeFailure({
    dataImportId,
    error,
    previousMetadata,
    supabase,
    userId
  }: {
    dataImportId: string;
    error: unknown;
    previousMetadata: HevyApiImportMetadata;
    supabase: DatabaseSupabase;
    userId: string;
  }) {
    const syncFailedAt = new Date().toISOString();
    const metadata = buildFinalizedHevyApiImportMetadata({
      deletedEventsIgnored: 0,
      fetchedWorkouts: 0,
      groupedWorkouts: 0,
      parsedRows: 0,
      previousMetadata,
      status: "failed",
      syncCompletedAt: null,
      syncError: sanitizeHevySyncError(error),
      syncFailedAt,
      userInfo: null
    });

    await updateDataImportMetadata(supabase, userId, dataImportId, metadata);
  },

  async completeSuccess({
    dataImportId,
    deletedEventsIgnored,
    fetchedWorkouts,
    groupedWorkouts,
    parsedRows,
    previousMetadata,
    supabase,
    userId,
    userInfo,
    userTimezone
  }: {
    dataImportId: string;
    deletedEventsIgnored: number;
    fetchedWorkouts: number;
    groupedWorkouts: GroupedHevyWorkout[];
    parsedRows: number;
    previousMetadata: HevyApiImportMetadata;
    supabase: DatabaseSupabase;
    userId: string;
    userInfo: {
      id: string;
      name: string;
      url: string;
    } | null;
    userTimezone: string | null;
  }): Promise<HevySyncResult> {
    const insertedWorkouts = await upsertApiWorkouts(
      supabase,
      userId,
      dataImportId,
      groupedWorkouts,
      userTimezone
    );
    const updatedDailyEntries = await upsertDailyEntries(
      supabase,
      userId,
      insertedWorkouts.map((workout) => workout.workoutDate)
    );
    const syncCompletedAt = new Date().toISOString();
    const metadata = buildFinalizedHevyApiImportMetadata({
      deletedEventsIgnored,
      fetchedWorkouts,
      groupedWorkouts: groupedWorkouts.length,
      parsedRows,
      previousMetadata,
      status: "success",
      syncCompletedAt,
      syncError: null,
      syncFailedAt: null,
      userInfo
    });

    await updateDataImportMetadata(supabase, userId, dataImportId, metadata);

    return {
      dataImportId,
      deletedEventsIgnored,
      fetchedWorkouts,
      insertedWorkouts: insertedWorkouts.length,
      operation: "api_sync",
      since: previousMetadata.since,
      syncMode: previousMetadata.sync_mode,
      triggerSource: previousMetadata.trigger_source,
      updatedDailyEntries
    };
  },

  async createPendingImport({
    since,
    supabase,
    syncMode,
    syncStartedAt,
    triggerSource,
    userId
  }: {
    since: string | null;
    supabase: DatabaseSupabase;
    syncMode: "full" | "incremental";
    syncStartedAt: string;
    triggerSource: HevySyncTriggerSource;
    userId: string;
  }): Promise<PendingHevyApiImportContext> {
    const metadata = buildPendingHevyApiImportMetadata({
      since,
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
