import "server-only";

import crypto from "node:crypto";

import { getFatSecretClientEnv, getFatSecretEnv } from "@/lib/fatsecret/env";
import {
  FATSECRET_CONNECT_COOKIE,
  type FatSecretConnectCookiePayload
} from "@/lib/fatsecret/types";

const FATSECRET_REQUEST_TOKEN_URL = "https://authentication.fatsecret.com/oauth/request_token";
const FATSECRET_AUTHORIZE_URL = "https://authentication.fatsecret.com/oauth/authorize";
const FATSECRET_ACCESS_TOKEN_URL = "https://authentication.fatsecret.com/oauth/access_token";
const FATSECRET_REQUEST_TIMEOUT_MS = 10_000;
const FATSECRET_MAX_REQUEST_ATTEMPTS = 3;
const FATSECRET_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const FATSECRET_CONNECT_COOKIE_TTL_SECONDS = 15 * 60;

export class FatSecretAuthError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "FatSecretAuthError";
    this.status = status;
  }
}

function percentEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildNormalizedParameters(entries: Array<[string, string]>) {
  return entries
    .map(([key, value]) => [percentEncode(key), percentEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }

      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function buildOAuthSignature({
  baseUrl,
  clientSecret,
  method,
  parameters,
  tokenSecret
}: {
  baseUrl: string;
  clientSecret: string;
  method: "GET" | "POST";
  parameters: Array<[string, string]>;
  tokenSecret?: string | null;
}) {
  const signatureBaseString = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(buildNormalizedParameters(parameters))
  ].join("&");
  const signingKey = `${percentEncode(clientSecret)}&${percentEncode(tokenSecret ?? "")}`;

  return crypto.createHmac("sha1", signingKey).update(signatureBaseString).digest("base64");
}

function createNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isTransientFetchError(error: unknown) {
  return isAbortLikeError(error) || error instanceof TypeError;
}

function extractOAuthErrorMessage(rawText: string) {
  const trimmedText = rawText.trim();

  if (!trimmedText) {
    return null;
  }

  try {
    const json = JSON.parse(trimmedText) as { error?: { message?: string } | string };

    if (typeof json.error === "string" && json.error.trim()) {
      return json.error.trim();
    }

    if (
      typeof json.error === "object" &&
      json.error !== null &&
      typeof json.error.message === "string" &&
      json.error.message.trim()
    ) {
      return json.error.message.trim();
    }
  } catch {
    // Fall through to URLSearchParams / raw text parsing.
  }

  const params = new URLSearchParams(trimmedText);
  const oauthProblem = params.get("oauth_problem")?.trim();

  if (oauthProblem) {
    return oauthProblem;
  }

  return trimmedText.slice(0, 240);
}

function buildOAuthRequestUrl(url: string, parameters: Record<string, string>) {
  const requestUrl = new URL(url);

  for (const [key, value] of Object.entries(parameters)) {
    requestUrl.searchParams.set(key, value);
  }

  return requestUrl;
}

async function fatSecretOAuthRequest({
  callback,
  method,
  requestToken,
  requestTokenSecret,
  tokenSecret,
  url,
  verifier
}: {
  callback?: string;
  method: "GET" | "POST";
  requestToken?: string;
  requestTokenSecret?: string;
  tokenSecret?: string | null;
  url: string;
  verifier?: string;
}) {
  const { clientId, clientSecret } = getFatSecretClientEnv();

  for (let attempt = 1; attempt <= FATSECRET_MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const oauthParameters: Record<string, string> = {
      oauth_consumer_key: clientId,
      oauth_nonce: createNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: `${Math.floor(Date.now() / 1000)}`,
      oauth_version: "1.0"
    };

    if (callback) {
      oauthParameters.oauth_callback = callback;
    }

    if (requestToken) {
      oauthParameters.oauth_token = requestToken;
    }

    if (verifier) {
      oauthParameters.oauth_verifier = verifier;
    }

    const signature = buildOAuthSignature({
      baseUrl: url,
      clientSecret,
      method,
      parameters: Object.entries(oauthParameters),
      tokenSecret: tokenSecret ?? requestTokenSecret ?? null
    });

    oauthParameters.oauth_signature = signature;
    const requestUrl =
      method === "GET" ? buildOAuthRequestUrl(url, oauthParameters) : new URL(url);
    const requestBody =
      method === "POST" ? new URLSearchParams(oauthParameters).toString() : undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FATSECRET_REQUEST_TIMEOUT_MS);

    try {
      console.log("FatSecret OAuth 1.0 request prepared:", {
        endpoint: requestUrl.pathname,
        hasCallback: Boolean(callback),
        hasConsumerKey: Boolean(oauthParameters.oauth_consumer_key),
        hasSignature: Boolean(oauthParameters.oauth_signature),
        hasToken: Boolean(requestToken),
        hasVerifier: Boolean(verifier),
        method,
        transport: method === "POST" ? "body" : "query"
      });

      const response = await fetch(requestUrl, {
        body: requestBody,
        headers:
          method === "POST"
            ? {
                "Content-Type": "application/x-www-form-urlencoded"
              }
            : undefined,
        method,
        signal: controller.signal
      });
      const responseText = await response.text();

      if (!response.ok) {
        const errorMessage =
          extractOAuthErrorMessage(responseText) ?? "FatSecret authentication request failed.";

        if (FATSECRET_RETRYABLE_STATUSES.has(response.status) && attempt < FATSECRET_MAX_REQUEST_ATTEMPTS) {
          await sleep(attempt * 400);
          continue;
        }

        throw new FatSecretAuthError(errorMessage, response.status);
      }

      return new URLSearchParams(responseText);
    } catch (error) {
      if (attempt < FATSECRET_MAX_REQUEST_ATTEMPTS && isTransientFetchError(error)) {
        await sleep(attempt * 400);
        continue;
      }

      if (error instanceof FatSecretAuthError) {
        throw error;
      }

      throw new FatSecretAuthError("Unable to complete the FatSecret authentication request.", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new FatSecretAuthError("FatSecret authentication retry limit reached.", 502);
}

function serializeCookiePayload(payload: FatSecretConnectCookiePayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const { clientSecret } = getFatSecretClientEnv();
  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function deserializeCookiePayload(value: string) {
  const [encodedPayload, providedSignature] = value.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const { clientSecret } = getFatSecretClientEnv();
  const expectedSignature = crypto
    .createHmac("sha256", clientSecret)
    .update(encodedPayload)
    .digest("base64url");
  const providedSignatureBuffer = Buffer.from(providedSignature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as FatSecretConnectCookiePayload;
  } catch {
    return null;
  }
}

export function getFatSecretConnectCookieOptions() {
  return {
    httpOnly: true,
    maxAge: FATSECRET_CONNECT_COOKIE_TTL_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function clearFatSecretConnectCookie() {
  return {
    ...getFatSecretConnectCookieOptions(),
    maxAge: 0
  };
}

export function getFatSecretConnectCookieName() {
  return FATSECRET_CONNECT_COOKIE;
}

export function encodeFatSecretConnectCookie(payload: FatSecretConnectCookiePayload) {
  return serializeCookiePayload(payload);
}

export function decodeFatSecretConnectCookie(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const payload = deserializeCookiePayload(value);

  if (!payload) {
    return null;
  }

  const issuedAt = new Date(payload.createdAt);

  if (Number.isNaN(issuedAt.valueOf())) {
    return null;
  }

  const ageMs = Date.now() - issuedAt.getTime();

  if (ageMs < 0 || ageMs > FATSECRET_CONNECT_COOKIE_TTL_SECONDS * 1000) {
    return null;
  }

  return payload;
}

export function resolveFatSecretCallbackUrl(requestUrl: string) {
  return getFatSecretEnv(requestUrl).redirectUri;
}

export async function createFatSecretRequestToken(callbackUrl: string) {
  const response = await fatSecretOAuthRequest({
    callback: callbackUrl,
    method: "POST",
    url: FATSECRET_REQUEST_TOKEN_URL
  });
  const oauthToken = response.get("oauth_token")?.trim();
  const oauthTokenSecret = response.get("oauth_token_secret")?.trim();
  const callbackConfirmed = response.get("oauth_callback_confirmed")?.trim();

  if (!oauthToken || !oauthTokenSecret || callbackConfirmed !== "true") {
    throw new FatSecretAuthError("FatSecret did not return a usable request token.", 502);
  }

  return {
    oauthToken,
    oauthTokenSecret
  };
}

export function buildFatSecretAuthorizeUrl(requestToken: string) {
  const url = new URL(FATSECRET_AUTHORIZE_URL);
  url.searchParams.set("oauth_token", requestToken);
  return url.toString();
}

export async function exchangeFatSecretAccessToken({
  oauthToken,
  oauthTokenSecret,
  oauthVerifier
}: {
  oauthToken: string;
  oauthTokenSecret: string;
  oauthVerifier: string;
}) {
  const response = await fatSecretOAuthRequest({
    method: "GET",
    requestToken: oauthToken,
    requestTokenSecret: oauthTokenSecret,
    tokenSecret: oauthTokenSecret,
    url: FATSECRET_ACCESS_TOKEN_URL,
    verifier: oauthVerifier
  });
  const accessToken = response.get("oauth_token")?.trim();
  const accessTokenSecret = response.get("oauth_token_secret")?.trim();

  if (!accessToken || !accessTokenSecret) {
    throw new FatSecretAuthError("FatSecret did not return a usable access token.", 502);
  }

  return {
    accessToken,
    accessTokenSecret
  };
}
