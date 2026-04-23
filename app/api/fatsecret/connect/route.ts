import { NextRequest, NextResponse } from "next/server";

import { hasFatSecretEnv } from "@/lib/fatsecret/env";
import {
  buildFatSecretAuthorizeUrl,
  createFatSecretRequestToken,
  encodeFatSecretConnectCookie,
  getFatSecretConnectCookieName,
  getFatSecretConnectCookieOptions,
  resolveFatSecretCallbackUrl,
  FatSecretAuthError
} from "@/lib/fatsecret/oauth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticateUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw new FatSecretAuthError(`Unable to verify the current user: ${error.message}.`, 401);
  }

  if (!user) {
    throw new FatSecretAuthError("You must be signed in to connect FatSecret.", 401);
  }

  return user;
}

function toErrorResponse(error: unknown) {
  if (error instanceof FatSecretAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected FatSecret connect error", error);
  return NextResponse.json({ error: "Unable to start the FatSecret connection." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    if (!hasFatSecretEnv(request.url)) {
      throw new FatSecretAuthError(
        "FatSecret is not configured on the server. Add FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET, and the matching FATSECRET_REDIRECT_URI_LOCAL or FATSECRET_REDIRECT_URI_PRODUCTION first.",
        500
      );
    }

    const user = await authenticateUser();
    const callbackUrl = resolveFatSecretCallbackUrl(request.url);
    const requestToken = await createFatSecretRequestToken(callbackUrl);
    const response = NextResponse.redirect(buildFatSecretAuthorizeUrl(requestToken.oauthToken));

    response.cookies.set({
      name: getFatSecretConnectCookieName(),
      value: encodeFatSecretConnectCookie({
        createdAt: new Date().toISOString(),
        oauthToken: requestToken.oauthToken,
        oauthTokenSecret: requestToken.oauthTokenSecret,
        userId: user.id
      }),
      ...getFatSecretConnectCookieOptions()
    });

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
