import { NextResponse } from "next/server";

import { FatSecretApiError } from "@/lib/fatsecret/api";
import { FatSecretAuthError } from "@/lib/fatsecret/oauth";
import {
  deleteStoredFatSecretConnection,
  getFatSecretSyncStatus,
  runManualFatSecretSync,
  FatSecretSyncError
} from "@/lib/fatsecret/sync";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function authenticateUser() {
  if (!hasSupabaseServiceEnv()) {
    throw new FatSecretSyncError(
      "FatSecret sync is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY first.",
      500
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw new FatSecretSyncError(`Unable to verify the current user: ${error.message}.`, 401);
  }

  if (!user) {
    throw new FatSecretSyncError("You must be signed in to sync FatSecret.", 401);
  }

  return { supabase, user };
}

function toErrorResponse(error: unknown) {
  if (
    error instanceof FatSecretSyncError ||
    error instanceof FatSecretApiError ||
    error instanceof FatSecretAuthError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected FatSecret sync error", error);
  return NextResponse.json({ error: "Unable to sync the FatSecret account." }, { status: 500 });
}

export async function GET() {
  try {
    const { supabase, user } = await authenticateUser();
    const adminSupabase = createAdminSupabaseClient();
    const status = await getFatSecretSyncStatus({
      adminSupabase,
      supabase,
      userId: user.id
    });

    return NextResponse.json(status);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST() {
  try {
    const { supabase, user } = await authenticateUser();
    const adminSupabase = createAdminSupabaseClient();
    const result = await runManualFatSecretSync({
      adminSupabase,
      supabase,
      userId: user.id
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const { user } = await authenticateUser();
    const adminSupabase = createAdminSupabaseClient();

    await deleteStoredFatSecretConnection(adminSupabase, user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
