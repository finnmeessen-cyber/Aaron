import "server-only";

import crypto from "node:crypto";

import {
  getFatSecretProfile,
  getMealsForDate,
} from "@/lib/fatsecret/api";
import {
  getLatestSuccessfulFatSecretApiImport,
  isSuccessfulFatSecretApiImportMetadata,
  persistFatSecretApiSync
} from "@/lib/fatsecret/database";
import {
  FATSECRET_INITIAL_SYNC_DAYS,
  type DataImportRow,
  type FatSecretAutoSyncUserResult,
  type FatSecretConnectionStatus,
  type FatSecretStoredConnection,
  type FatSecretSyncMode,
  type FatSecretSyncResult,
  type FatSecretSyncTriggerSource
} from "@/lib/fatsecret/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { shiftDateKey, toDateInputValue } from "@/lib/utils";

type DatabaseSupabase = Pick<ReturnType<typeof createServerSupabaseClient>, "from">;
type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;
type MutationError = { message: string } | null;
type RpcCallable = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: MutationError }>;
};
type HasFatSecretConnectionResult = boolean;
type LoadFatSecretConnectionResult = {
  auth_secret?: string | null;
  auth_token?: string | null;
  last_synced_date?: string | null;
} | null;
type ListStoredFatSecretUsersResult = Array<{ user_id: string }>;
type AcquireFatSecretSyncLeaseResult = boolean;

type FatSecretSyncLease = {
  leaseToken: string;
  userId: string;
};

type FatSecretSyncCursor = {
  endDate: string;
  since: string | null;
  startDate: string;
  syncMode: FatSecretSyncMode;
};

export class FatSecretSyncError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "FatSecretSyncError";
    this.status = status;
  }
}

function isDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function buildDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let currentDate = startDate;

  while (currentDate <= endDate) {
    dates.push(currentDate);
    currentDate = shiftDateKey(currentDate, 1);
  }

  return dates;
}

async function callAdminRpc<T>(
  adminSupabase: AdminSupabase,
  fn: string,
  args: Record<string, unknown>
) {
  const rpcClient = adminSupabase as unknown as RpcCallable;
  const { data, error } = await rpcClient.rpc<T>(fn, args);

  if (error) {
    throw new FatSecretSyncError("Unable to access the stored FatSecret connection.", 500);
  }

  return data ?? null;
}

async function getUserTimezone(supabase: DatabaseSupabase, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new FatSecretSyncError(`Unable to load the FatSecret sync profile: ${error.message}.`, 500);
  }

  const profile = (data ?? null) as { timezone: string | null } | null;
  return profile?.timezone ?? null;
}

function mapStoredConnection(value: LoadFatSecretConnectionResult): FatSecretStoredConnection | null {
  if (!value?.auth_token || !value.auth_secret) {
    return null;
  }

  return {
    authSecret: value.auth_secret,
    authToken: value.auth_token,
    lastSyncedDate: isDateKey(value.last_synced_date) ? value.last_synced_date : null
  };
}

function resolveSyncCursor({
  latestImport,
  storedConnection,
  userTimezone
}: {
  latestImport: DataImportRow | null;
  storedConnection: FatSecretStoredConnection;
  userTimezone: string | null;
}): FatSecretSyncCursor {
  const today = toDateInputValue(new Date(), userTimezone);
  const metadata =
    latestImport && isSuccessfulFatSecretApiImportMetadata(latestImport.metadata)
      ? latestImport.metadata
      : null;
  const cursorDate = storedConnection.lastSyncedDate ?? metadata?.last_synced_date ?? null;

  if (isDateKey(cursorDate) && cursorDate <= today) {
    return {
      endDate: today,
      since: cursorDate,
      startDate: cursorDate,
      syncMode: "incremental"
    };
  }

  return {
    endDate: today,
    since: null,
    startDate: shiftDateKey(today, -(FATSECRET_INITIAL_SYNC_DAYS - 1)),
    syncMode: "initial"
  };
}

async function acquireFatSecretSyncLease(
  adminSupabase: AdminSupabase,
  userId: string
): Promise<FatSecretSyncLease> {
  const leaseToken = crypto.randomUUID();
  const acquired = await callAdminRpc<AcquireFatSecretSyncLeaseResult>(
    adminSupabase,
    "fatsecret_acquire_sync_lease",
    {
      lease_seconds: 1800,
      requested_lease_token: leaseToken,
      target_user_id: userId
    }
  );

  if (!acquired) {
    throw new FatSecretSyncError("A FatSecret sync is already running for this account.", 409);
  }

  return {
    leaseToken,
    userId
  };
}

async function releaseFatSecretSyncLease(adminSupabase: AdminSupabase, lease: FatSecretSyncLease) {
  await callAdminRpc<null>(adminSupabase, "fatsecret_release_sync_lease", {
    requested_lease_token: lease.leaseToken,
    target_user_id: lease.userId
  });
}

export async function hasStoredFatSecretConnection(adminSupabase: AdminSupabase, userId: string) {
  const result = await callAdminRpc<HasFatSecretConnectionResult>(
    adminSupabase,
    "fatsecret_has_connection",
    {
      target_user_id: userId
    }
  );

  return Boolean(result);
}

export async function loadStoredFatSecretConnection(
  adminSupabase: AdminSupabase,
  userId: string
) {
  const result = await callAdminRpc<LoadFatSecretConnectionResult>(
    adminSupabase,
    "fatsecret_load_connection",
    {
      target_user_id: userId
    }
  );

  return mapStoredConnection(result);
}

export async function storeFatSecretConnection(
  adminSupabase: AdminSupabase,
  userId: string,
  credentials: {
    authSecret: string;
    authToken: string;
  }
) {
  await callAdminRpc<null>(adminSupabase, "fatsecret_store_connection", {
    new_credentials: {
      auth_secret: credentials.authSecret,
      auth_token: credentials.authToken
    },
    target_user_id: userId
  });
}

export async function updateFatSecretLastSyncedDate(
  adminSupabase: AdminSupabase,
  userId: string,
  lastSyncedDate: string
) {
  await callAdminRpc<null>(adminSupabase, "fatsecret_update_last_synced_date", {
    new_last_synced_date: lastSyncedDate,
    target_user_id: userId
  });
}

export async function deleteStoredFatSecretConnection(
  adminSupabase: AdminSupabase,
  userId: string
) {
  await callAdminRpc<null>(adminSupabase, "fatsecret_delete_connection", {
    target_user_id: userId
  });
}

export async function listStoredFatSecretConnectionUserIds(adminSupabase: AdminSupabase) {
  const result = await callAdminRpc<ListStoredFatSecretUsersResult>(
    adminSupabase,
    "fatsecret_list_connected_users",
    {}
  );

  return (result ?? [])
    .map((row) => row.user_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function getFatSecretSyncStatus({
  adminSupabase,
  supabase,
  userId
}: {
  adminSupabase: AdminSupabase;
  supabase: DatabaseSupabase;
  userId: string;
}): Promise<FatSecretConnectionStatus> {
  const [storedConnection, latestImport] = await Promise.all([
    loadStoredFatSecretConnection(adminSupabase, userId),
    getLatestSuccessfulFatSecretApiImport(supabase, userId)
  ]);
  const metadata =
    latestImport && isSuccessfulFatSecretApiImportMetadata(latestImport.metadata)
      ? latestImport.metadata
      : null;

  return {
    connected: Boolean(storedConnection),
    lastSyncedAt: metadata?.sync_completed_at ?? latestImport?.created_at ?? null,
    lastSyncedDate: storedConnection?.lastSyncedDate ?? metadata?.last_synced_date ?? null,
    lastSyncMode: metadata?.sync_mode ?? null
  };
}

export async function syncFatSecretEntries({
  adminSupabase,
  storedConnection,
  supabase,
  triggerSource = "manual",
  userId,
  userTimezone
}: {
  adminSupabase: AdminSupabase;
  storedConnection: FatSecretStoredConnection;
  supabase: DatabaseSupabase;
  triggerSource?: FatSecretSyncTriggerSource;
  userId: string;
  userTimezone: string | null;
}): Promise<FatSecretSyncResult> {
  const latestImport = await getLatestSuccessfulFatSecretApiImport(supabase, userId);
  const { endDate, since, startDate, syncMode } = resolveSyncCursor({
    latestImport,
    storedConnection,
    userTimezone
  });
  const syncStartedAt = new Date().toISOString();
  const pendingImport = await persistFatSecretApiSync.createPendingImport({
    endDate,
    startDate,
    supabase,
    syncMode,
    syncStartedAt,
    triggerSource,
    userId
  });

  try {
    await getFatSecretProfile(storedConnection);

    const syncedDates = buildDateRange(startDate, endDate);
    const entriesByDate = new Map<string, Awaited<ReturnType<typeof getMealsForDate>>>();
    let fetchedEntries = 0;

    for (const date of syncedDates) {
      const entries = await getMealsForDate(storedConnection, date);
      entriesByDate.set(date, entries);
      fetchedEntries += entries.length;
    }

    const result = await persistFatSecretApiSync.completeSuccess({
      dataImportId: pendingImport.dataImportId,
      entriesByDate,
      fetchedEntries,
      previousMetadata: pendingImport.metadata,
      supabase,
      syncedDates,
      userId
    });

    try {
      await updateFatSecretLastSyncedDate(adminSupabase, userId, endDate);
    } catch (cursorError) {
      console.error("Unable to persist the FatSecret sync cursor", cursorError);
    }

    return {
      ...result,
      since
    };
  } catch (error) {
    try {
      await persistFatSecretApiSync.completeFailure({
        dataImportId: pendingImport.dataImportId,
        error,
        previousMetadata: pendingImport.metadata,
        supabase,
        userId
      });
    } catch (finalizeError) {
      console.error("Unable to finalize failed FatSecret sync import", finalizeError);
    }

    throw error;
  }
}

export async function runManualFatSecretSync({
  adminSupabase,
  supabase,
  userId
}: {
  adminSupabase: AdminSupabase;
  supabase: DatabaseSupabase;
  userId: string;
}) {
  const storedConnection = await loadStoredFatSecretConnection(adminSupabase, userId);

  if (!storedConnection) {
    throw new FatSecretSyncError("Connect FatSecret first before starting a nutrition sync.", 400);
  }

  const lease = await acquireFatSecretSyncLease(adminSupabase, userId);

  try {
    const userTimezone = await getUserTimezone(supabase, userId);
    return await syncFatSecretEntries({
      adminSupabase,
      storedConnection,
      supabase,
      triggerSource: "manual",
      userId,
      userTimezone
    });
  } finally {
    await releaseFatSecretSyncLease(adminSupabase, lease);
  }
}

export async function syncStoredFatSecretEntriesForUser({
  adminSupabase,
  supabase,
  userId
}: {
  adminSupabase: AdminSupabase;
  supabase: DatabaseSupabase;
  userId: string;
}): Promise<FatSecretAutoSyncUserResult> {
  const storedConnection = await loadStoredFatSecretConnection(adminSupabase, userId);

  if (!storedConnection) {
    return {
      reason: "No stored FatSecret connection was available for this user.",
      status: "skipped",
      userId
    };
  }

  let lease: FatSecretSyncLease;

  try {
    lease = await acquireFatSecretSyncLease(adminSupabase, userId);
  } catch (error) {
    return {
      reason:
        error instanceof Error ? error.message : "A FatSecret sync is already running for this account.",
      status: "skipped",
      userId
    };
  }

  try {
    const userTimezone = await getUserTimezone(supabase, userId);
    const result = await syncFatSecretEntries({
      adminSupabase,
      storedConnection,
      supabase,
      triggerSource: "cron",
      userId,
      userTimezone
    });

    return {
      deletedEntries: result.deletedEntries,
      endDate: result.endDate,
      fetchedEntries: result.fetchedEntries,
      startDate: result.startDate,
      status: "synced",
      syncMode: result.syncMode,
      updatedDailyEntries: result.updatedDailyEntries,
      upsertedEntries: result.upsertedEntries,
      userId
    };
  } finally {
    await releaseFatSecretSyncLease(adminSupabase, lease);
  }
}
