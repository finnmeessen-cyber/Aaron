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

type UserPersistenceSupabase = Pick<ReturnType<typeof createServerSupabaseClient>, "from">;
type ServiceRolePersistenceSupabase = Pick<ReturnType<typeof createAdminSupabaseClient>, "from">;
type PersistenceSupabase = UserPersistenceSupabase | ServiceRolePersistenceSupabase;
type PrivilegedSupabase = ReturnType<typeof createAdminSupabaseClient>;
type FatSecretSyncClientMode = "service_role" | "user_session";
type MutationError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
} | null;
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
  privilegedSupabase: PrivilegedSupabase,
  fn: string,
  args: Record<string, unknown>
) {
  try {
    const rpcClient = privilegedSupabase as unknown as RpcCallable;
    const { data, error } = await rpcClient.rpc<T>(fn, args);

    if (error) {
      console.error("FatSecret DEBUG ERROR", {
        error: {
          code: error.code ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          message: error.message
        },
        fn,
        step: fn === "fatsecret_load_connection" ? "connection_access" : fn
      });

      throw new FatSecretSyncError(`FatSecret RPC ${fn} failed: ${error.message}.`, 500);
    }

    return data ?? null;
  } catch (error) {
    if (error instanceof FatSecretSyncError) {
      throw error;
    }

    console.error("FatSecret DEBUG ERROR", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name
            }
          : {
              message: String(error)
            },
      fn,
      step: fn === "fatsecret_load_connection" ? "connection_access" : fn
    });

    throw error;
  }
}

function assertPersistenceSupabase(persistenceSupabase: PersistenceSupabase) {
  if (!persistenceSupabase || typeof persistenceSupabase.from !== "function") {
    throw new FatSecretSyncError("FatSecret persistence client is not configured correctly.", 500);
  }
}

function logFatSecretSyncClientModes({
  persistenceClientMode,
  triggerSource
}: {
  persistenceClientMode: FatSecretSyncClientMode;
  triggerSource: "manual" | "status" | "cron";
}) {
  console.log("FatSecret DEBUG CLIENT MODES", {
    persistenceClientMode,
    privilegedClientMode: "service_role",
    step: "sync_client_modes",
    triggerSource
  });
}

async function getUserTimezone(persistenceSupabase: PersistenceSupabase, userId: string) {
  const { data, error } = await persistenceSupabase
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
  privilegedSupabase: PrivilegedSupabase,
  userId: string
): Promise<FatSecretSyncLease> {
  console.log("FatSecret sync step:", "acquire_lease");

  const leaseToken = crypto.randomUUID();
  let acquired: AcquireFatSecretSyncLeaseResult | null = null;

  try {
    acquired = await callAdminRpc<AcquireFatSecretSyncLeaseResult>(
      privilegedSupabase,
      "fatsecret_acquire_sync_lease",
      {
        lease_seconds: 1800,
        requested_lease_token: leaseToken,
        target_user_id: userId
      }
    );
  } catch (error) {
    console.error("FatSecret DEBUG ERROR", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name
            }
          : {
              message: String(error)
            },
      step: "acquire_lease"
    });

    throw error;
  }

  if (!acquired) {
    throw new FatSecretSyncError("A FatSecret sync is already running for this account.", 409);
  }

  return {
    leaseToken,
    userId
  };
}

async function releaseFatSecretSyncLease(privilegedSupabase: PrivilegedSupabase, lease: FatSecretSyncLease) {
  await callAdminRpc<null>(privilegedSupabase, "fatsecret_release_sync_lease", {
    requested_lease_token: lease.leaseToken,
    target_user_id: lease.userId
  });
}

export async function hasStoredFatSecretConnection(privilegedSupabase: PrivilegedSupabase, userId: string) {
  const result = await callAdminRpc<HasFatSecretConnectionResult>(
    privilegedSupabase,
    "fatsecret_has_connection",
    {
      target_user_id: userId
    }
  );

  return Boolean(result);
}

export async function loadStoredFatSecretConnection(
  privilegedSupabase: PrivilegedSupabase,
  userId: string
) {
  console.log("FatSecret sync step:", "load_connection");

  try {
    const result = await callAdminRpc<LoadFatSecretConnectionResult>(
      privilegedSupabase,
      "fatsecret_load_connection",
      {
        target_user_id: userId
      }
    );

    return mapStoredConnection(result);
  } catch (error) {
    console.error("FatSecret DEBUG ERROR", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name
            }
          : {
              message: String(error)
            },
      step: "load_connection"
    });

    throw error;
  }
}

export async function storeFatSecretConnection(
  privilegedSupabase: PrivilegedSupabase,
  userId: string,
  credentials: {
    authSecret: string;
    authToken: string;
  }
) {
  await callAdminRpc<null>(privilegedSupabase, "fatsecret_store_connection", {
    new_credentials: {
      auth_secret: credentials.authSecret,
      auth_token: credentials.authToken
    },
    target_user_id: userId
  });
}

export async function updateFatSecretLastSyncedDate(
  privilegedSupabase: PrivilegedSupabase,
  userId: string,
  lastSyncedDate: string
) {
  await callAdminRpc<null>(privilegedSupabase, "fatsecret_update_last_synced_date", {
    new_last_synced_date: lastSyncedDate,
    target_user_id: userId
  });
}

export async function deleteStoredFatSecretConnection(
  privilegedSupabase: PrivilegedSupabase,
  userId: string
) {
  await callAdminRpc<null>(privilegedSupabase, "fatsecret_delete_connection", {
    target_user_id: userId
  });
}

export async function listStoredFatSecretConnectionUserIds(privilegedSupabase: PrivilegedSupabase) {
  const result = await callAdminRpc<ListStoredFatSecretUsersResult>(
    privilegedSupabase,
    "fatsecret_list_connected_users",
    {}
  );

  return (result ?? [])
    .map((row) => row.user_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function getFatSecretSyncStatus({
  privilegedSupabase,
  userSupabase,
  userId
}: {
  privilegedSupabase: PrivilegedSupabase;
  userSupabase: UserPersistenceSupabase;
  userId: string;
}): Promise<FatSecretConnectionStatus> {
  assertPersistenceSupabase(userSupabase);
  logFatSecretSyncClientModes({
    persistenceClientMode: "user_session",
    triggerSource: "status"
  });
  const [storedConnection, latestImport] = await Promise.all([
    loadStoredFatSecretConnection(privilegedSupabase, userId),
    getLatestSuccessfulFatSecretApiImport(userSupabase, userId)
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
  persistenceClientMode,
  persistenceSupabase,
  privilegedSupabase,
  storedConnection,
  triggerSource = "manual",
  userId,
  userTimezone
}: {
  persistenceClientMode: FatSecretSyncClientMode;
  persistenceSupabase: PersistenceSupabase;
  privilegedSupabase: PrivilegedSupabase;
  storedConnection: FatSecretStoredConnection;
  triggerSource?: FatSecretSyncTriggerSource;
  userId: string;
  userTimezone: string | null;
}): Promise<FatSecretSyncResult> {
  assertPersistenceSupabase(persistenceSupabase);

  const latestImport = await getLatestSuccessfulFatSecretApiImport(persistenceSupabase, userId);
  const { endDate, since, startDate, syncMode } = resolveSyncCursor({
    latestImport,
    storedConnection,
    userTimezone
  });
  console.log("FatSecret DEBUG RANGE", {
    endDate,
    since,
    startDate,
    step: "sync_range",
    syncMode,
    triggerSource,
    persistenceClientMode,
    privilegedClientMode: "service_role",
    userTimezone
  });
  const syncStartedAt = new Date().toISOString();
  const pendingImport = await persistFatSecretApiSync.createPendingImport({
    endDate,
    persistenceSupabase,
    startDate,
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
      console.log("FatSecret sync step:", "fetch_entries");
      console.log("FatSecret DEBUG DATE", {
        requestedDate: date,
        step: "fetch_entries",
        triggerSource
      });

      let entries: Awaited<ReturnType<typeof getMealsForDate>>;

      try {
        entries = await getMealsForDate(storedConnection, date);
      } catch (error) {
        console.error("FatSecret DEBUG ERROR", {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  name: error.name
                }
              : {
                  message: String(error)
                },
          providerMethod: "food_entries.get",
          step: "fetch_entries",
          triggerSource
        });

        throw error;
      }

      entriesByDate.set(date, entries);
      fetchedEntries += entries.length;
      console.log("FatSecret DEBUG FETCH COUNT", {
        requestedDate: date,
        returnedEntries: entries.length,
        runningFetchedEntries: fetchedEntries,
        step: "fetch_entries",
        triggerSource
      });
    }

    if (fetchedEntries === 0) {
      console.warn("FatSecret DEBUG ZERO FETCH", {
        endDate,
        persistenceClientMode,
        privilegedClientMode: "service_role",
        startDate,
        step: "fetch_entries",
        syncMode,
        triggerSource,
        userTimezone
      });
    }

    console.log("FatSecret sync step:", "upsert_entries");
    const result = await persistFatSecretApiSync.completeSuccess({
      dataImportId: pendingImport.dataImportId,
      entriesByDate,
      fetchedEntries,
      persistenceSupabase,
      previousMetadata: pendingImport.metadata,
      syncedDates,
      userId
    });
    console.log("FatSecret DEBUG SYNC RESULT", {
      fetchedEntries: result.fetchedEntries,
      persistenceClientMode,
      privilegedClientMode: "service_role",
      startDate: result.startDate,
      step: "sync_complete",
      triggerSource,
      upsertedEntries: result.upsertedEntries,
      updatedDailyEntries: result.updatedDailyEntries
    });

    try {
      await updateFatSecretLastSyncedDate(privilegedSupabase, userId, endDate);
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
        persistenceSupabase,
        previousMetadata: pendingImport.metadata,
        userId
      });
    } catch (finalizeError) {
      console.error("Unable to finalize failed FatSecret sync import", finalizeError);
    }

    throw error;
  }
}

export async function runManualFatSecretSync({
  privilegedSupabase,
  userSupabase,
  userId
}: {
  privilegedSupabase: PrivilegedSupabase;
  userSupabase: UserPersistenceSupabase;
  userId: string;
}) {
  assertPersistenceSupabase(userSupabase);
  logFatSecretSyncClientModes({
    persistenceClientMode: "user_session",
    triggerSource: "manual"
  });
  const storedConnection = await loadStoredFatSecretConnection(privilegedSupabase, userId);

  if (!storedConnection) {
    throw new FatSecretSyncError("Connect FatSecret first before starting a nutrition sync.", 400);
  }

  const lease = await acquireFatSecretSyncLease(privilegedSupabase, userId);

  try {
    const userTimezone = await getUserTimezone(userSupabase, userId);
    return await syncFatSecretEntries({
      persistenceClientMode: "user_session",
      persistenceSupabase: userSupabase,
      privilegedSupabase,
      storedConnection,
      triggerSource: "manual",
      userId,
      userTimezone
    });
  } finally {
    await releaseFatSecretSyncLease(privilegedSupabase, lease);
  }
}

export async function syncStoredFatSecretEntriesForUser({
  persistenceSupabase,
  privilegedSupabase,
  userId
}: {
  persistenceSupabase: ServiceRolePersistenceSupabase;
  privilegedSupabase: PrivilegedSupabase;
  userId: string;
}): Promise<FatSecretAutoSyncUserResult> {
  assertPersistenceSupabase(persistenceSupabase);
  logFatSecretSyncClientModes({
    persistenceClientMode: "service_role",
    triggerSource: "cron"
  });

  const storedConnection = await loadStoredFatSecretConnection(privilegedSupabase, userId);

  if (!storedConnection) {
    return {
      reason: "No stored FatSecret connection was available for this user.",
      status: "skipped",
      userId
    };
  }

  let lease: FatSecretSyncLease;

  try {
    lease = await acquireFatSecretSyncLease(privilegedSupabase, userId);
  } catch (error) {
    return {
      reason:
        error instanceof Error ? error.message : "A FatSecret sync is already running for this account.",
      status: "skipped",
      userId
    };
  }

  try {
    const userTimezone = await getUserTimezone(persistenceSupabase, userId);
    const result = await syncFatSecretEntries({
      persistenceClientMode: "service_role",
      persistenceSupabase,
      privilegedSupabase,
      storedConnection,
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
    await releaseFatSecretSyncLease(privilegedSupabase, lease);
  }
}
