import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HevyApiError } from "@/lib/hevy/api";
import { HevyImportError } from "@/lib/hevy/import";
import {
  deleteStoredHevyApiKey,
  getHevySyncStatus,
  runManualHevySync
} from "@/lib/hevy/sync";
import { hasSupabaseServiceEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

const HEVY_API_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SyncRequestBody = {
  apiKey?: string;
};

function toErrorResponse(error: unknown) {
  if (error instanceof HevyImportError || error instanceof HevyApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected Hevy sync error", error);
  return NextResponse.json(
    { error: "Unable to sync the Hevy account." },
    { status: 500 }
  );
}

function normalizeApiKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function validateProvidedApiKey(apiKey: string | null) {
  if (!apiKey) {
    return null;
  }

  if (!HEVY_API_KEY_PATTERN.test(apiKey)) {
    throw new HevyImportError(
      "The Hevy API key must be a valid UUID.",
      400
    );
  }

  return apiKey;
}

async function authenticateUser() {
  if (!hasSupabaseServiceEnv()) {
    throw new HevyImportError(
      "Hevy sync is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY first.",
      500
    );
  }

  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw new HevyImportError(
      `Unable to verify the current user: ${error.message}.`,
      401
    );
  }

  if (!user) {
    throw new HevyImportError(
      "You must be signed in to sync Hevy.",
      401
    );
  }

  return { supabase, user };
}

/**
 * GET → Sync Status
 */
export async function GET() {
  try {
    const { supabase, user } = await authenticateUser();
    const adminSupabase = createAdminSupabaseClient();

    const status = await getHevySyncStatus({
      adminSupabase,
      supabase,
      userId: user.id
    });

    return NextResponse.json(status);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST → Manual Sync
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await authenticateUser();
    const adminSupabase = createAdminSupabaseClient();

    const requestBody = (await request.json().catch(() => ({}))) as SyncRequestBody;

    const providedApiKey = validateProvidedApiKey(
      normalizeApiKey(requestBody.apiKey)
    );

    const result = await runManualHevySync({
      adminSupabase,
      providedApiKey,
      supabase,
      userId: user.id
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE → Remove API Key
 */
export async function DELETE() {
  try {
    const { user } = await authenticateUser();
    const adminSupabase = createAdminSupabaseClient();

    await deleteStoredHevyApiKey(adminSupabase, user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}