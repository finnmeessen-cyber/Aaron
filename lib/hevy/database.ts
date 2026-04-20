import { HevyImportError } from "@/lib/hevy/import";
import {
  HEVY_PROVIDER,
  type DailyEntryInsert,
  type DataImportInsert,
  type DataImportRow,
  type GroupedHevyWorkout,
  type HevyImportMetadata,
  type HevyImportResult,
  type SourceWorkoutInsert
} from "@/lib/hevy/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type TypedSupabase = ReturnType<typeof createServerSupabaseClient>;
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
type UpdateableDailyEntriesTable<Payload> = {
  update: (values: Payload) => {
    eq: (column: string, value: string) => {
      in: (column: string, values: string[]) => Promise<{ error: MutationError }>;
    };
  };
};

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
      start_time: workout.startTime,
      timestamp_assumption: "naive_local_treated_as_utc",
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
  supabase: TypedSupabase,
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
  supabase: TypedSupabase,
  userId: string,
  metadata: HevyImportMetadata
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

async function getInsertedImportWorkouts(
  supabase: TypedSupabase,
  userId: string,
  dataImportId: string
) {
  const { data, error } = await supabase
    .from("source_workouts")
    .select("provider_workout_id, workout_date")
    .eq("user_id", userId)
    .eq("provider", HEVY_PROVIDER)
    .eq("data_import_id", dataImportId);

  if (error) {
    throw new HevyImportError(`Unable to load imported Hevy workouts: ${error.message}.`, 500);
  }

  return (data ?? []) as Array<{
    provider_workout_id: string;
    workout_date: string;
  }>;
}

async function upsertWorkouts(
  supabase: TypedSupabase,
  userId: string,
  dataImportId: string,
  workouts: GroupedHevyWorkout[],
  userTimezone: string | null
) {
  if (!workouts.length) {
    return [];
  }

  const payload = workouts.map((workout) =>
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

  return getInsertedImportWorkouts(supabase, userId, dataImportId);
}

async function upsertDailyEntries(
  supabase: TypedSupabase,
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
  supabase: TypedSupabase;
  userTimezone: string | null;
  userId: string;
}): Promise<HevyImportResult> {
  const existingImport = await findExistingImportByHash(supabase, userId, fileHash);
  const metadata: HevyImportMetadata = {
    duplicate_of_import_id: existingImport?.id ?? null,
    file_hash: fileHash,
    file_name: fileName,
    file_size: fileSize,
    grouped_workouts: groupedWorkouts.length,
    parsed_rows: parsedRows,
    skipped_duplicate: Boolean(existingImport)
  };
  const dataImport = await createDataImport(supabase, userId, metadata);

  if (existingImport) {
    return {
      dataImportId: dataImport.id,
      duplicateImport: true,
      groupedWorkouts: groupedWorkouts.length,
      insertedWorkouts: 0,
      parsedRows,
      updatedDailyEntries: 0
    };
  }

  const insertedWorkouts = await upsertWorkouts(
    supabase,
    userId,
    dataImport.id,
    groupedWorkouts,
    userTimezone
  );
  const updatedDailyEntries = await upsertDailyEntries(
    supabase,
    userId,
    insertedWorkouts.map((workout) => workout.workout_date)
  );

  return {
    dataImportId: dataImport.id,
    duplicateImport: false,
    groupedWorkouts: groupedWorkouts.length,
    insertedWorkouts: insertedWorkouts.length,
    parsedRows,
    updatedDailyEntries
  };
}
