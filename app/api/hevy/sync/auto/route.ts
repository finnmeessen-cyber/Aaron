import { NextRequest, NextResponse } from "next/server";

import { HevyApiError } from "@/lib/hevy/api";
import { HevyImportError } from "@/lib/hevy/import";
import {
  listStoredHevyApiKeyUserIds,
  syncStoredHevyWorkoutsForUser
} from "@/lib/hevy/sync";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCronSecret, hasCronSecretEnv, hasSupabaseServiceEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEFAULT_AUTO_SYNC_LIMIT = 20;
const MAX_AUTO_SYNC_LIMIT = 50;

function toErrorResponse(error: unknown) {
  if (error instanceof HevyImportError || error instanceof HevyApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected Hevy auto-sync error", error);
  return NextResponse.json({ error: "Unable to run the scheduled Hevy sync." }, { status: 500 });
}

function authorizeCronRequest(request: NextRequest) {
  if (!hasSupabaseServiceEnv()) {
    throw new HevyImportError(
      "Hevy auto-sync is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY first.",
      500
    );
  }

  if (!hasCronSecretEnv()) {
    throw new HevyImportError(
      "Hevy auto-sync is not configured on the server. Add CRON_SECRET first.",
      500
    );
  }

  const authorizationHeader = request.headers.get("authorization");
  const expectedHeader = `Bearer ${getCronSecret()}`;

  if (authorizationHeader !== expectedHeader) {
    throw new HevyImportError("Unauthorized scheduled Hevy sync request.", 401);
  }
}

function parseLimit(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");

  if (!rawLimit) {
    return DEFAULT_AUTO_SYNC_LIMIT;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    throw new HevyImportError("The auto-sync limit must be a positive integer.", 400);
  }

  return Math.min(parsedLimit, MAX_AUTO_SYNC_LIMIT);
}

export async function GET(request: NextRequest) {
  try {
    authorizeCronRequest(request);

    const adminSupabase = createAdminSupabaseClient();
    const startedAt = new Date().toISOString();
    const limit = parseLimit(request);
    const userIds = await listStoredHevyApiKeyUserIds(adminSupabase);
    const selectedUserIds = userIds.slice(0, limit);
    const results: Awaited<ReturnType<typeof syncStoredHevyWorkoutsForUser>>[] = [];
    let synced = 0;
    let failed = 0;
    let fetchedWorkouts = 0;
    let insertedWorkouts = 0;
    let updatedDailyEntries = 0;

    for (const userId of selectedUserIds) {
      try {
        const result = await syncStoredHevyWorkoutsForUser({
          adminSupabase,
          supabase: adminSupabase as Parameters<typeof syncStoredHevyWorkoutsForUser>[0]["supabase"],
          userId
        });

        results.push(result);

        if (result.status !== "synced") {
          continue;
        }

        synced += 1;
        fetchedWorkouts += result.fetchedWorkouts;
        insertedWorkouts += result.insertedWorkouts;
        updatedDailyEntries += result.updatedDailyEntries;
      } catch (error) {
        failed += 1;
        results.push({
          reason:
            error instanceof HevyImportError || error instanceof HevyApiError
              ? error.message
              : "Unable to sync this Hevy connection.",
          status: "failed",
          userId
        });
      }
    }

    return NextResponse.json({
      failed,
      fetchedWorkouts,
      insertedWorkouts,
      remainingUsers: Math.max(0, userIds.length - selectedUserIds.length),
      processedUsers: selectedUserIds.length,
      results,
      startedAt,
      synced,
      updatedDailyEntries
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
