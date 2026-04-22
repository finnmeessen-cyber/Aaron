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
  buildWallClockUtcIsoFromDateParts,
  buildHevyWorkoutGroupKey,
  HevyImportError
} from "@/lib/hevy/import";
import type {
  HevyAutoSyncUserResult,
  DataImportRow,
  GroupedHevyWorkout,
  HevyApiImportMetadata,
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
type AcquireHevySyncLeaseResult = boolean;

type SyncCursor = {
  since: string | null;
  syncMode: "full" | "incremental";
};
type HevySyncLease = {
  leaseToken: string;
  userId: string;
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

function buildWallClockUtcIsoForTimezone(date: Date, timeZone: string | null) {
  const parts = getWallClockPartsForTimezone(date, timeZone);

  return buildWallClockUtcIsoFromDateParts(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
}

function getWallClockPartsForTimezone(date: Date, timeZone: string | null) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timeZone ?? "UTC",
    year: "numeric"
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<"day" | "hour" | "minute" | "month" | "second" | "year", string>;

  return parts;
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

function transformHevyApiWorkout(
  workout: HevyApiWorkout,
  userTimezone: string | null
): GroupedHevyWorkout {
  const title = workout.title?.trim() || "Hevy Workout";
  const startTimestamp = parseApiTimestamp(workout.start_time, workout.id, "start_time");
  const endTimestamp = parseApiTimestamp(workout.end_time, workout.id, "end_time");

  if (endTimestamp.date.getTime() < startTimestamp.date.getTime()) {
    throw new HevyImportError(`Hevy workout ${workout.id} has an end_time earlier than start_time.`);
  }

  const startWallClockParts = getWallClockPartsForTimezone(startTimestamp.date, userTimezone);
  const bridgeStartIso = buildWallClockUtcIsoForTimezone(startTimestamp.date, userTimezone);
  const bridgeEndIso = buildWallClockUtcIsoForTimezone(endTimestamp.date, userTimezone);
  const groupKey = buildHevyWorkoutGroupKey(title, bridgeStartIso, bridgeEndIso);
  const workoutDate = `${startWallClockParts.year}-${startWallClockParts.month}-${startWallClockParts.day}`;

  return {
    durationMinutes: differenceInMinutes(endTimestamp.date, startTimestamp.date),
    endTime: endTimestamp.original,
    endedAtIso: endTimestamp.iso,
    groupKey,
    providerWorkoutId: workout.id,
    rawSource: workout,
    rows: buildSyntheticRows(workout, startTimestamp.original, endTimestamp.original),
    sourceKind: "api",
    startedAtIso: startTimestamp.iso,
    startTime: startTimestamp.original,
    title,
    workoutDate
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

function isSuccessfulHevyApiImportMetadata(
  metadata: DataImportRow["metadata"]
): metadata is HevyApiImportMetadata {
  if (typeof metadata !== "object" || !metadata) {
    return false;
  }

  return (
    "source" in metadata &&
    metadata.source === "api" &&
    "sync_status" in metadata &&
    metadata.sync_status === "success" &&
    "sync_started_at" in metadata &&
    typeof metadata.sync_started_at === "string" &&
    metadata.sync_started_at.length > 0
  );
}

async function getLatestSuccessfulHevyApiImport(supabase: DatabaseSupabase, userId: string) {
  const { data, error } = await supabase
    .from("data_imports")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "hevy")
    .eq("metadata->>source", "api")
    .eq("metadata->>sync_status", "success")
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
  const metadata = latestImport?.metadata ?? null;
  const since = isSuccessfulHevyApiImportMetadata(metadata) ? metadata.sync_started_at : null;

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

async function acquireHevySyncLease(adminSupabase: AdminSupabase, userId: string): Promise<HevySyncLease> {
  const leaseToken = crypto.randomUUID();
  const acquired = await callAdminRpc<AcquireHevySyncLeaseResult>(
    adminSupabase,
    "hevy_acquire_sync_lease",
    {
      lease_seconds: 1800,
      requested_lease_token: leaseToken,
      target_user_id: userId
    }
  );

  if (!acquired) {
    throw new HevyImportError("A Hevy sync is already running for this account.", 409);
  }

  return {
    leaseToken,
    userId
  };
}

async function releaseHevySyncLease(adminSupabase: AdminSupabase, lease: HevySyncLease) {
  await callAdminRpc<null>(adminSupabase, "hevy_release_sync_lease", {
    requested_lease_token: lease.leaseToken,
    target_user_id: lease.userId
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
    getLatestSuccessfulHevyApiImport(supabase, userId)
  ]);
  const metadata =
    latestImport && typeof latestImport.metadata === "object" && latestImport.metadata
      ? latestImport.metadata
      : null;
  const lastSyncedAt =
    metadata &&
    "sync_completed_at" in metadata &&
    typeof metadata.sync_completed_at === "string" &&
    metadata.sync_completed_at
      ? metadata.sync_completed_at
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
  const latestImport = await getLatestSuccessfulHevyApiImport(supabase, userId);
  const { since, syncMode } = resolveSyncCursor(latestImport);
  const syncStartedAt = new Date().toISOString();
  const pendingImport = await persistHevyApiSync.createPendingImport({
    since,
    supabase,
    syncMode,
    syncStartedAt,
    triggerSource,
    userId
  });

  try {
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

    const groupedWorkouts = fetchedWorkouts.map((workout) =>
      transformHevyApiWorkout(workout, userTimezone)
    );
    const parsedRows = groupedWorkouts.reduce((sum, workout) => sum + workout.rows.length, 0);
    const result = await persistHevyApiSync.completeSuccess({
      dataImportId: pendingImport.dataImportId,
      deletedEventsIgnored,
      fetchedWorkouts: fetchedWorkouts.length,
      groupedWorkouts,
      parsedRows,
      previousMetadata: pendingImport.metadata,
      supabase,
      userId,
      userInfo,
      userTimezone
    });

    return result;
  } catch (error) {
    try {
      await persistHevyApiSync.completeFailure({
        dataImportId: pendingImport.dataImportId,
        error,
        previousMetadata: pendingImport.metadata,
        supabase,
        userId
      });
    } catch (finalizeError) {
      console.error("Unable to finalize failed Hevy sync import", finalizeError);
    }

    throw error;
  }
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

  const lease = await acquireHevySyncLease(adminSupabase, userId);

  try {
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
  } finally {
    await releaseHevySyncLease(adminSupabase, lease);
  }
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

  let lease: HevySyncLease;

  try {
    lease = await acquireHevySyncLease(adminSupabase, userId);
  } catch (error) {
    if (error instanceof HevyImportError && error.status === 409) {
      return {
        reason: error.message,
        status: "skipped",
        userId
      };
    }

    throw error;
  }

  try {
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
  } finally {
    await releaseHevySyncLease(adminSupabase, lease);
  }
}
