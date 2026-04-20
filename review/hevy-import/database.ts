import { HevyImportError } from "@/lib/hevy/import";
import {
  HEVY_PROVIDER,
  type DailyEntryInsert,
  type DataImportInsert,
  type DataImportRow,
  type ExistingSourceWorkoutSignature,
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

function normalizeTitle(title: string | null | undefined) {
  return title?.trim().toLowerCase() ?? "";
}

function buildWorkoutSignature({
  durationMinutes,
  startedAt,
  title
}: {
  durationMinutes: number | null | undefined;
  startedAt: string | null | undefined;
  title: string | null | undefined;
}) {
  return [normalizeTitle(title), startedAt ?? "", durationMinutes ?? ""].join("::");
}

function buildGroupedWorkoutPayload(
  userId: string,
  dataImportId: string,
  workout: GroupedHevyWorkout
): SourceWorkoutInsert {
  return {
    data_import_id: dataImportId,
    duration_minutes: workout.durationMinutes,
    provider: HEVY_PROVIDER,
    provider_workout_id: null,
    raw_payload: {
      end_time: workout.endTime,
      group_key: workout.groupKey,
      rows: workout.rows.map((row) => ({
        row_number: row.rowNumber,
        ...row.source
      })),
      start_time: workout.startTime,
      title: workout.title
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

async function getExistingWorkoutSignatures(
  supabase: TypedSupabase,
  userId: string,
  workouts: GroupedHevyWorkout[]
) {
  const startedAtValues = Array.from(new Set(workouts.map((workout) => workout.startedAtIso)));

  if (!startedAtValues.length) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("source_workouts")
    .select("duration_minutes, started_at, title")
    .eq("user_id", userId)
    .eq("provider", HEVY_PROVIDER)
    .in("started_at", startedAtValues);

  if (error) {
    throw new HevyImportError(`Unable to load existing Hevy workouts: ${error.message}.`, 500);
  }

  const signatures = (data ?? []) as ExistingSourceWorkoutSignature[];
  return new Set(
    signatures.map((workout) =>
      buildWorkoutSignature({
        durationMinutes: workout.duration_minutes,
        startedAt: workout.started_at,
        title: workout.title
      })
    )
  );
}

async function upsertWorkouts(
  supabase: TypedSupabase,
  userId: string,
  dataImportId: string,
  workouts: GroupedHevyWorkout[]
) {
  if (!workouts.length) {
    return 0;
  }

  const payload = workouts.map((workout) => buildGroupedWorkoutPayload(userId, dataImportId, workout));
  const sourceWorkoutsTable =
    supabase.from("source_workouts") as unknown as UpsertableTable<SourceWorkoutInsert[]>;
  const { error } = await sourceWorkoutsTable.upsert(payload, {
    ignoreDuplicates: true,
    onConflict: "user_id,provider,title,started_at,duration_minutes"
  });

  if (error) {
    throw new HevyImportError(`Unable to save Hevy workouts: ${error.message}.`, 500);
  }

  return payload.length;
}

async function upsertDailyEntries(
  supabase: TypedSupabase,
  userId: string,
  workouts: GroupedHevyWorkout[]
) {
  const uniqueWorkoutDates = Array.from(
    new Set(workouts.map((workout) => workout.workoutDate))
  ).sort();

  if (!uniqueWorkoutDates.length) {
    return 0;
  }

  const payload: DailyEntryInsert[] = uniqueWorkoutDates.map((workoutDate) => ({
    entry_date: workoutDate,
    training_completed: true,
    training_source: HEVY_PROVIDER,
    user_id: userId
  }));

  const dailyEntriesTable =
    supabase.from("daily_entries") as unknown as UpsertableTable<DailyEntryInsert[]>;
  const { error } = await dailyEntriesTable.upsert(payload, {
    onConflict: "user_id,entry_date"
  });

  if (error) {
    throw new HevyImportError(`Unable to update daily entries: ${error.message}.`, 500);
  }

  return payload.length;
}

export async function persistHevyImport({
  fileHash,
  fileName,
  fileSize,
  groupedWorkouts,
  parsedRows,
  supabase,
  userId
}: {
  fileHash: string;
  fileName: string | null;
  fileSize: number;
  groupedWorkouts: GroupedHevyWorkout[];
  parsedRows: number;
  supabase: TypedSupabase;
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

  const existingSignatures = await getExistingWorkoutSignatures(supabase, userId, groupedWorkouts);
  const workoutsToInsert = groupedWorkouts.filter((workout) => {
    return !existingSignatures.has(
      buildWorkoutSignature({
        durationMinutes: workout.durationMinutes,
        startedAt: workout.startedAtIso,
        title: workout.title
      })
    );
  });

  const insertedWorkouts = await upsertWorkouts(supabase, userId, dataImport.id, workoutsToInsert);
  const updatedDailyEntries = await upsertDailyEntries(supabase, userId, groupedWorkouts);

  return {
    dataImportId: dataImport.id,
    duplicateImport: false,
    groupedWorkouts: groupedWorkouts.length,
    insertedWorkouts,
    parsedRows,
    updatedDailyEntries
  };
}
