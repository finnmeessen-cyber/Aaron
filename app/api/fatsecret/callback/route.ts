import { NextRequest, NextResponse } from "next/server";

import { getFatSecretProfile } from "@/lib/fatsecret/api";
import { hasFatSecretEnv } from "@/lib/fatsecret/env";
import {
  clearFatSecretConnectCookie,
  decodeFatSecretConnectCookie,
  exchangeFatSecretAccessToken,
  FatSecretAuthError,
  getFatSecretConnectCookieName
} from "@/lib/fatsecret/oauth";
import { storeFatSecretConnection } from "@/lib/fatsecret/sync";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_REDIRECT_PATH = "/nutrition";

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
    throw new FatSecretAuthError("You must be signed in to finish the FatSecret connection.", 401);
  }

  return user;
}

function buildRedirectResponse(request: NextRequest, status: "connected" | "error") {
  const url = new URL(DEFAULT_REDIRECT_PATH, request.nextUrl.origin);
  url.searchParams.set("fatsecret", status);
  const response = NextResponse.redirect(url);

  response.cookies.set({
    name: getFatSecretConnectCookieName(),
    value: "",
    ...clearFatSecretConnectCookie()
  });

  return response;
}

export async function GET(request: NextRequest) {
  if (!hasFatSecretEnv(request.url)) {
    return buildRedirectResponse(request, "error");
  }

  try {
    const user = await authenticateUser();
    const oauthToken = request.nextUrl.searchParams.get("oauth_token")?.trim();
    const oauthVerifier = request.nextUrl.searchParams.get("oauth_verifier")?.trim();
    const cookiePayload = decodeFatSecretConnectCookie(
      request.cookies.get(getFatSecretConnectCookieName())?.value
    );

    if (!oauthToken || !oauthVerifier || !cookiePayload) {
      throw new FatSecretAuthError("The FatSecret authorization callback is incomplete.", 400);
    }

    if (cookiePayload.userId !== user.id || cookiePayload.oauthToken !== oauthToken) {
      throw new FatSecretAuthError("The FatSecret authorization callback does not match the active user.", 400);
    }

    const accessToken = await exchangeFatSecretAccessToken({
      oauthToken,
      oauthTokenSecret: cookiePayload.oauthTokenSecret,
      oauthVerifier
    });

    await getFatSecretProfile({
      authSecret: accessToken.accessTokenSecret,
      authToken: accessToken.accessToken
    });

    const adminSupabase = createAdminSupabaseClient();
    await storeFatSecretConnection(adminSupabase, user.id, {
      authSecret: accessToken.accessTokenSecret,
      authToken: accessToken.accessToken
    });

    return buildRedirectResponse(request, "connected");
  } catch (error) {
    console.error("FatSecret callback failed", error);
    return buildRedirectResponse(request, "error");
  }
}
