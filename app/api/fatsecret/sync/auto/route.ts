import { NextRequest, NextResponse } from "next/server";

import { FatSecretApiError } from "@/lib/fatsecret/api";
import { FatSecretAuthError } from "@/lib/fatsecret/oauth";
import {
  listStoredFatSecretConnectionUserIds,
  syncStoredFatSecretEntriesForUser,
  FatSecretSyncError
} from "@/lib/fatsecret/sync";
import {
  FATSECRET_AUTO_SYNC_LIMIT,
  FATSECRET_MAX_AUTO_SYNC_LIMIT
} from "@/lib/fatsecret/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCronSecret, hasCronSecretEnv, hasSupabaseServiceEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown) {
  if (
    error instanceof FatSecretSyncError ||
    error instanceof FatSecretApiError ||
    error instanceof FatSecretAuthError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected FatSecret auto-sync error", error);
  return NextResponse.json({ error: "Unable to run the scheduled FatSecret sync." }, { status: 500 });
}

function authorizeCronRequest(request: NextRequest) {
  if (!hasSupabaseServiceEnv()) {
    throw new FatSecretSyncError(
      "FatSecret auto-sync is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY first.",
      500
    );
  }

  if (!hasCronSecretEnv()) {
    throw new FatSecretSyncError(
      "FatSecret auto-sync is not configured on the server. Add CRON_SECRET first.",
      500
    );
  }

  const authorizationHeader = request.headers.get("authorization");
  const expectedHeader = `Bearer ${getCronSecret()}`;

  if (authorizationHeader !== expectedHeader) {
    throw new FatSecretSyncError("Unauthorized scheduled FatSecret sync request.", 401);
  }
}

function parseLimit(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");

  if (!rawLimit) {
    return FATSECRET_AUTO_SYNC_LIMIT;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    throw new FatSecretSyncError("The auto-sync limit must be a positive integer.", 400);
  }

  return Math.min(parsedLimit, FATSECRET_MAX_AUTO_SYNC_LIMIT);
}

export async function GET(request: NextRequest) {
  try {
    authorizeCronRequest(request);

    const privilegedSupabase = createAdminSupabaseClient();
    const persistenceSupabase = privilegedSupabase;
    const startedAt = new Date().toISOString();
    const limit = parseLimit(request);
    const userIds = await listStoredFatSecretConnectionUserIds(privilegedSupabase);
    const selectedUserIds = userIds.slice(0, limit);
    const results: Awaited<ReturnType<typeof syncStoredFatSecretEntriesForUser>>[] = [];
    let synced = 0;
    let failed = 0;
    let fetchedEntries = 0;
    let deletedEntries = 0;
    let upsertedEntries = 0;
    let updatedDailyEntries = 0;

    for (const userId of selectedUserIds) {
      try {
        const result = await syncStoredFatSecretEntriesForUser({
          persistenceSupabase,
          privilegedSupabase,
          userId
        });

        results.push(result);

        if (result.status !== "synced") {
          continue;
        }

        synced += 1;
        fetchedEntries += result.fetchedEntries;
        deletedEntries += result.deletedEntries;
        upsertedEntries += result.upsertedEntries;
        updatedDailyEntries += result.updatedDailyEntries;
      } catch (error) {
        failed += 1;
        results.push({
          reason:
            error instanceof FatSecretSyncError ||
            error instanceof FatSecretApiError ||
            error instanceof FatSecretAuthError
              ? error.message
              : "Unable to sync this FatSecret connection.",
          status: "failed",
          userId
        });
      }
    }

    return NextResponse.json({
      deletedEntries,
      failed,
      fetchedEntries,
      processedUsers: selectedUserIds.length,
      remainingUsers: Math.max(0, userIds.length - selectedUserIds.length),
      results,
      startedAt,
      synced,
      updatedDailyEntries,
      upsertedEntries
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
