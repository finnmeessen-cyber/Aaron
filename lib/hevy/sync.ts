import "server-only";

import { differenceInMinutes, isValid, parseISO } from "date-fns";

import {
  getHevyUserInfo,
  listAllHevyWorkouts,
  listHevyWorkoutEventsSince,
  resolveHevySyncMode,
  type HevyApiWorkout,
  type HevyApiWorkoutEvent
} from "@/lib/hevy/api";
import { persistHevyApiSync } from "@/lib/hevy/database";
import {
  buildHevyProviderWorkoutId,
  buildHevyWorkoutGroupKey,
  HevyImportError
} from "@/lib/hevy/import";
import type {
  HevyAutoSyncUserResult,
  DataImportRow,
  GroupedHevyWorkout,
  HevySyncResult,
  HevySyncStatus,
  HevySyncTriggerSource,
  ParsedHevyCsvRow
} from "@/lib/hevy/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type DatabaseSupabase = Pick<ReturnType<typeof createServerSupabaseClient>, "from">;
type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;
type MutationError = { message: string } | null;
type RpcCallable = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: MutationError }>;
};
type HasHevyApiKeyResult = boolean;
type ListStoredHevyApiKeyUsersResult = Array<{ user_id: string }>;
type LoadHevyApiKeyResult = string | null;

type SyncCursor = {
  since: string | null;
  syncMode: "full" | "incremental";
};

function parseApiTimestamp(
  value: string | undefined,
  workoutId: string,
  field: "start_time" | "end_time"
) {
  if (!value) {
    throw new HevyImportError(`Hevy workout ${workoutId} is missing ${field}.`);
  }

  const parsedDate = parseISO(value);

  if (!isValid(parsedDate)) {
    throw new HevyImportError(`Hevy workout ${workoutId} has an invalid ${field} value.`);
  }

  return {
    date: parsedDate,
    dateKey: parsedDate.toISOString().slice(0, 10),
    iso: parsedDate.toISOString(),
    original: value
  };
}

function buildSyntheticRows(workout: HevyApiWorkout, startTime: string, endTime: string) {
  const title = workout.title?.trim() || "Hevy Workout";
  const exercises = workout.exercises ?? [];
  const rows: ParsedHevyCsvRow[] = [];
  let rowNumber = 2;

  for (const exercise of exercises) {
    const sets = exercise.sets ?? [];

    if (!sets.length) {
      rows.push({
        endTime,
        rowNumber,
        source: {
          api_workout_id: workout.id,
          description: workout.description ?? "",
          end_time: endTime,
          exercise_notes: exercise.notes ?? "",
          exercise_template_id: exercise.exercise_template_id ?? "",
          exercise_title: exercise.title ?? "",
          start_time: startTime,
          superset_id:
            exercise.supersets_id === null || exercise.supersets_id === undefined
              ? ""
              : String(exercise.supersets_id),
          title
        },
        startTime,
        title
      });
      rowNumber += 1;
      continue;
    }

    for (const set of sets) {
      rows.push({
        endTime,
        rowNumber,
        source: {
          api_workout_id: workout.id,
          created_at: workout.created_at ?? "",
          custom_metric:
            set.custom_metric === null || set.custom_metric === undefined
              ? ""
              : String(set.custom_metric),
          description: workout.description ?? "",
          distance_meters:
            set.distance_meters === null || set.distance_meters === undefined
              ? ""
              : String(set.distance_meters),
          duration_seconds:
            set.duration_seconds === null || set.duration_seconds === undefined
              ? ""
              : String(set.duration_seconds),
          end_time: endTime,
          exercise_notes: exercise.notes ?? "",
          exercise_template_id: exercise.exercise_template_id ?? "",
          exercise_title: exercise.title ?? "",
          reps: set.reps === null || set.reps === undefined ? "" : String(set.reps),
          rpe: set.rpe === null || set.rpe === undefined ? "" : String(set.rpe),
          set_index:
            set.index === null || set.index === undefined ? "" : String(set.index),
          set_type: set.type ?? "",
          start_time: startTime,
          superset_id:
            exercise.supersets_id === null || exercise.supersets_id === undefined
              ? ""
              : String(exercise.supersets_id),
          title,
          updated_at: workout.updated_at ?? "",
          weight_kg:
            set.weight_kg === null || set.weight_kg === undefined
              ? ""
              : String(set.weight_kg)
        },
        startTime,
        title
      });
      rowNumber += 1;
    }
  }

  if (rows.length) {
    return rows;
  }

  return [
    {
      endTime,
      rowNumber,
      source: {
        api_workout_id: workout.id,
        description: workout.description ?? "",
        end_time: endTime,
        start_time: startTime,
        title
      },
      startTime,
      title
    }
  ];
}

function transformHevyApiWorkout(workout: HevyApiWorkout): GroupedHevyWorkout {
  const title = workout.title?.trim() || "Hevy Workout";
  const startTimestamp = parseApiTimestamp(workout.start_time, workout.id, "start_time");
  const endTimestamp = parseApiTimestamp(workout.end_time, workout.id, "end_time");

  if (endTimestamp.date.getTime() < startTimestamp.date.getTime()) {
    throw new HevyImportError(`Hevy workout ${workout.id} has an end_time earlier than start_time.`);
  }

  const groupKey = buildHevyWorkoutGroupKey(title, startTimestamp.iso, endTimestamp.iso);

  return {
    durationMinutes: differenceInMinutes(endTimestamp.date, startTimestamp.date),
    endTime: endTimestamp.original,
    endedAtIso: endTimestamp.iso,
    groupKey,
    providerWorkoutId: buildHevyProviderWorkoutId(groupKey),
    rawSource: workout,
    rows: buildSyntheticRows(workout, startTimestamp.original, endTimestamp.original),
    sourceKind: "api",
    startedAtIso: startTimestamp.iso,
    startTime: startTimestamp.original,
    title,
    workoutDate: startTimestamp.dateKey
  };
}

function reduceIncrementalEvents(events: HevyApiWorkoutEvent[]) {
  const deletedIds = new Set<string>();
  const seenUpdatedIds = new Set<string>();
  const workouts: HevyApiWorkout[] = [];

  for (const event of events) {
    if (event.type === "deleted") {
      deletedIds.add(event.id);
      continue;
    }

    const workoutId = event.workout.id;

    if (!workoutId || deletedIds.has(workoutId) || seenUpdatedIds.has(workoutId)) {
      continue;
    }

    seenUpdatedIds.add(workoutId);
    workouts.push(event.workout);
  }

  return {
    deletedEventsIgnored: deletedIds.size,
    workouts
  };
}

async function getLatestHevyApiImport(supabase: DatabaseSupabase, userId: string) {
  const { data, error } = await supabase
    .from("data_imports")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "hevy")
    .eq("metadata->>source", "api")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HevyImportError(`Unable to load the latest Hevy sync state: ${error.message}.`, 500);
  }

  return (data ?? null) as DataImportRow | null;
}

async function getUserTimezone(supabase: DatabaseSupabase, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new HevyImportError(`Unable to load the Hevy sync profile: ${error.message}.`, 500);
  }

  const profile = (data ?? null) as { timezone: string | null } | null;
  return profile?.timezone ?? null;
}

function resolveSyncCursor(latestImport: DataImportRow | null): SyncCursor {
  const metadata =
    latestImport && typeof latestImport.metadata === "object" && latestImport.metadata
      ? latestImport.metadata
      : null;
  const since =
    metadata &&
    "sync_started_at" in metadata &&
    typeof metadata.sync_started_at === "string" &&
    metadata.sync_started_at
      ? metadata.sync_started_at
      : null;

  return {
    since,
    syncMode: resolveHevySyncMode(since)
  };
}

async function callAdminRpc<T>(
  adminSupabase: AdminSupabase,
  fn: string,
  args: Record<string, unknown>
) {
  const rpcClient = adminSupabase as unknown as RpcCallable;
  const { data, error } = await rpcClient.rpc<T>(fn, args);

  if (error) {
    throw new HevyImportError("Unable to access the stored Hevy connection.", 500);
  }

  return data ?? null;
}

export async function hasStoredHevyApiKey(adminSupabase: AdminSupabase, userId: string) {
  const result = await callAdminRpc<HasHevyApiKeyResult>(adminSupabase, "hevy_has_api_key", {
    target_user_id: userId
  });

  return Boolean(result);
}

export async function loadStoredHevyApiKey(adminSupabase: AdminSupabase, userId: string) {
  return callAdminRpc<LoadHevyApiKeyResult>(adminSupabase, "hevy_load_api_key", {
    target_user_id: userId
  });
}

export async function listStoredHevyApiKeyUserIds(adminSupabase: AdminSupabase) {
  const result = await callAdminRpc<ListStoredHevyApiKeyUsersResult>(
    adminSupabase,
    "hevy_list_connected_users",
    {}
  );

  return (result ?? [])
    .map((row) => row.user_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function storeHevyApiKey(
  adminSupabase: AdminSupabase,
  userId: string,
  apiKey: string
) {
  await callAdminRpc<null>(adminSupabase, "hevy_store_api_key", {
    new_api_key: apiKey,
    target_user_id: userId
  });
}

export async function deleteStoredHevyApiKey(adminSupabase: AdminSupabase, userId: string) {
  await callAdminRpc<null>(adminSupabase, "hevy_delete_api_key", {
    target_user_id: userId
  });
}

export async function getHevySyncStatus({
  adminSupabase,
  supabase,
  userId
}: {
  adminSupabase: AdminSupabase;
  supabase: DatabaseSupabase;
  userId: string;
}): Promise<HevySyncStatus> {
  const [hasStoredKey, latestImport] = await Promise.all([
    hasStoredHevyApiKey(adminSupabase, userId),
    getLatestHevyApiImport(supabase, userId)
  ]);
  const metadata =
    latestImport && typeof latestImport.metadata === "object" && latestImport.metadata
      ? latestImport.metadata
      : null;
  const lastSyncedAt =
    metadata &&
    "sync_started_at" in metadata &&
    typeof metadata.sync_started_at === "string" &&
    metadata.sync_started_at
      ? metadata.sync_started_at
      : latestImport?.created_at ?? null;
  const lastSyncMode =
    metadata &&
    "sync_mode" in metadata &&
    (metadata.sync_mode === "full" || metadata.sync_mode === "incremental")
      ? metadata.sync_mode
      : null;

  return {
    connected: hasStoredKey,
    lastSyncedAt,
    lastSyncMode
  };
}

export async function syncHevyWorkouts({
  apiKey,
  supabase,
  triggerSource = "manual",
  userId,
  userTimezone
}: {
  apiKey: string;
  supabase: DatabaseSupabase;
  triggerSource?: HevySyncTriggerSource;
  userId: string;
  userTimezone: string | null;
}): Promise<HevySyncResult> {
  const latestImport = await getLatestHevyApiImport(supabase, userId);
  const { since, syncMode } = resolveSyncCursor(latestImport);
  const syncStartedAt = new Date().toISOString();
  const userInfo = await getHevyUserInfo(apiKey);

  let deletedEventsIgnored = 0;
  let fetchedWorkouts: HevyApiWorkout[] = [];

  if (syncMode === "incremental" && since) {
    const events = await listHevyWorkoutEventsSince(apiKey, since);
    const reduced = reduceIncrementalEvents(events);
    deletedEventsIgnored = reduced.deletedEventsIgnored;
    fetchedWorkouts = reduced.workouts;
  } else {
    fetchedWorkouts = await listAllHevyWorkouts(apiKey);
  }

  const groupedWorkouts = fetchedWorkouts.map(transformHevyApiWorkout);
  const parsedRows = groupedWorkouts.reduce((sum, workout) => sum + workout.rows.length, 0);

  const result = await persistHevyApiSync({
    deletedEventsIgnored,
    fetchedWorkouts: fetchedWorkouts.length,
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
  });

  return result;
}

export async function runManualHevySync({
  adminSupabase,
  providedApiKey,
  supabase,
  userId
}: {
  adminSupabase: AdminSupabase;
  providedApiKey: string | null;
  supabase: DatabaseSupabase;
  userId: string;
}) {
  const storedApiKey = providedApiKey ?? (await loadStoredHevyApiKey(adminSupabase, userId));

  if (!storedApiKey) {
    throw new HevyImportError("Add your Hevy API key first to start the sync.", 400);
  }

  const userTimezone = await getUserTimezone(supabase, userId);
  const result = await syncHevyWorkouts({
    apiKey: storedApiKey,
    supabase,
    triggerSource: "manual",
    userId,
    userTimezone
  });

  if (providedApiKey) {
    await storeHevyApiKey(adminSupabase, userId, providedApiKey);
  }

  return result;
}

export async function syncStoredHevyWorkoutsForUser({
  adminSupabase,
  supabase,
  userId
}: {
  adminSupabase: AdminSupabase;
  supabase: DatabaseSupabase;
  userId: string;
}): Promise<HevyAutoSyncUserResult> {
  const storedApiKey = await loadStoredHevyApiKey(adminSupabase, userId);

  if (!storedApiKey) {
    return {
      reason: "No stored Hevy API key was available for this user.",
      status: "skipped",
      userId
    };
  }

  const userTimezone = await getUserTimezone(supabase, userId);
  const result = await syncHevyWorkouts({
    apiKey: storedApiKey,
    supabase,
    triggerSource: "cron",
    userId,
    userTimezone
  });

  return {
    fetchedWorkouts: result.fetchedWorkouts,
    insertedWorkouts: result.insertedWorkouts,
    since: result.since,
    status: "synced",
    syncMode: result.syncMode,
    updatedDailyEntries: result.updatedDailyEntries,
    userId
  };
}
