import "server-only";

import crypto from "node:crypto";

import { getFatSecretClientEnv, getFatSecretOAuth2Env } from "@/lib/fatsecret/env";
import type {
  FatSecretFoodEntry,
  FatSecretFoodSearchItem,
  FatSecretFoodSearchResult,
  FatSecretMealType,
  FatSecretProfile,
  FatSecretStoredConnection
} from "@/lib/fatsecret/types";
import type { Json } from "@/types/supabase";
import { isDateKey } from "@/lib/utils";

const FATSECRET_API_BASE_URL = "https://platform.fatsecret.com";
const FATSECRET_OAUTH2_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const FATSECRET_REQUEST_TIMEOUT_MS = 10_000;
const FATSECRET_MAX_REQUEST_ATTEMPTS = 3;
const FATSECRET_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const FATSECRET_RETRYABLE_ERROR_CODES = new Set(["1", "11", "20", "24"]);

let fatSecretOAuth2TokenCache:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

export class FatSecretApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "FatSecretApiError";
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

function createOAuth1SignedSearchParams({
  method,
  token,
  tokenSecret,
  url,
  urlSearchParams
}: {
  method: "GET" | "POST";
  token: string;
  tokenSecret: string;
  url: string;
  urlSearchParams: URLSearchParams;
}) {
  const { clientId, clientSecret } = getFatSecretClientEnv();
  const oauthParameters: Record<string, string> = {
    oauth_consumer_key: clientId,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: `${Math.floor(Date.now() / 1000)}`,
    oauth_token: token,
    oauth_version: "1.0"
  };
  const signatureBaseString = [
    method,
    percentEncode(url),
    percentEncode(
      buildNormalizedParameters([
        ...Array.from(urlSearchParams.entries()).map(([key, value]) => [key, value] as [string, string]),
        ...Object.entries(oauthParameters)
      ])
    )
  ].join("&");
  const signingKey = `${percentEncode(clientSecret)}&${percentEncode(tokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(signatureBaseString).digest("base64");

  oauthParameters.oauth_signature = signature;
  const signedSearchParams = new URLSearchParams(urlSearchParams);

  for (const [key, value] of Object.entries(oauthParameters)) {
    signedSearchParams.set(key, value);
  }

  return signedSearchParams;
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

function normalizeToArray<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function toJsonRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toFatSecretDateInt(dateKey: string) {
  if (!isDateKey(dateKey)) {
    throw new FatSecretApiError("FatSecret date requests require a YYYY-MM-DD date.", 400);
  }

  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
}

function fromFatSecretDateInt(dateInt: number) {
  const date = new Date(dateInt * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function normalizeMealType(value: unknown): FatSecretMealType {
  if (typeof value !== "string") {
    return "snack";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "breakfast" || normalized === "lunch" || normalized === "dinner") {
    return normalized;
  }

  return "snack";
}

function buildFatSecretApiErrorMessage(payload: unknown, fallbackMessage: string) {
  const record = toJsonRecord(payload);
  const errorPayload = toJsonRecord(record?.error);
  const message =
    typeof errorPayload?.message === "string" && errorPayload.message.trim()
      ? errorPayload.message.trim()
      : null;

  return message ?? fallbackMessage;
}

function getFatSecretApiErrorCode(payload: unknown) {
  const record = toJsonRecord(payload);
  const errorPayload = toJsonRecord(record?.error);
  const code = errorPayload?.code;

  if (typeof code === "number" && Number.isFinite(code)) {
    return `${code}`;
  }

  return typeof code === "string" && code.trim() ? code.trim() : null;
}

async function fatSecretOAuth1Request<T>({
  credentials,
  method = "GET",
  path,
  params
}: {
  credentials: Pick<FatSecretStoredConnection, "authSecret" | "authToken">;
  method?: "GET" | "POST";
  path: string;
  params?: Record<string, string>;
}) {
  const url = new URL(path, FATSECRET_API_BASE_URL);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("format", "json");
  const baseUrl = `${url.origin}${url.pathname}`;

  for (let attempt = 1; attempt <= FATSECRET_MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FATSECRET_REQUEST_TIMEOUT_MS);
    const signedSearchParams = createOAuth1SignedSearchParams({
      method,
      token: credentials.authToken,
      tokenSecret: credentials.authSecret,
      url: baseUrl,
      urlSearchParams: url.searchParams
    });
    const requestUrl = new URL(baseUrl);
    requestUrl.search = signedSearchParams.toString();

    try {
      const response = await fetch(requestUrl, {
        headers: {
          Accept: "application/json"
        },
        method,
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as T | null;

      if (!response.ok) {
        const errorMessage = buildFatSecretApiErrorMessage(payload, "FatSecret request failed.");

        if (FATSECRET_RETRYABLE_STATUSES.has(response.status) && attempt < FATSECRET_MAX_REQUEST_ATTEMPTS) {
          console.warn("Retrying FatSecret request after HTTP failure", {
            attempt,
            path,
            status: response.status
          });
          await sleep(attempt * 400);
          continue;
        }

        throw new FatSecretApiError(errorMessage, response.status);
      }

      const errorCode = getFatSecretApiErrorCode(payload);

      if (errorCode) {
        const errorMessage = buildFatSecretApiErrorMessage(payload, "FatSecret request failed.");

        if (FATSECRET_RETRYABLE_ERROR_CODES.has(errorCode) && attempt < FATSECRET_MAX_REQUEST_ATTEMPTS) {
          console.warn("Retrying FatSecret request after API error", {
            attempt,
            code: errorCode,
            path
          });
          await sleep(attempt * 400);
          continue;
        }

        throw new FatSecretApiError(errorMessage, 502);
      }

      if (!payload) {
        throw new FatSecretApiError("FatSecret returned an empty response.", 502);
      }

      return payload;
    } catch (error) {
      if (attempt < FATSECRET_MAX_REQUEST_ATTEMPTS && isTransientFetchError(error)) {
        console.warn("Retrying FatSecret request after transient failure", {
          attempt,
          path
        });
        await sleep(attempt * 400);
        continue;
      }

      if (error instanceof FatSecretApiError) {
        throw error;
      }

      throw new FatSecretApiError("Unable to reach the FatSecret API.", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new FatSecretApiError("FatSecret request retry limit reached.", 502);
}

async function getFatSecretOAuth2AccessToken() {
  if (fatSecretOAuth2TokenCache && fatSecretOAuth2TokenCache.expiresAt > Date.now() + 60_000) {
    return fatSecretOAuth2TokenCache.accessToken;
  }

  const { clientId, clientSecret } = getFatSecretOAuth2Env();
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "premier"
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FATSECRET_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(FATSECRET_OAUTH2_TOKEN_URL, {
      body,
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      method: "POST",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          access_token?: string;
          expires_in?: number;
          token_type?: string;
        }
      | null;

    if (!response.ok || !payload?.access_token) {
      throw new FatSecretApiError("Unable to obtain a FatSecret OAuth 2.0 access token.", response.status);
    }

    fatSecretOAuth2TokenCache = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000
    };

    return payload.access_token;
  } catch (error) {
    if (error instanceof FatSecretApiError) {
      throw error;
    }

    throw new FatSecretApiError("Unable to refresh the FatSecret OAuth 2.0 access token.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getFatSecretProfile(
  credentials: Pick<FatSecretStoredConnection, "authSecret" | "authToken">
): Promise<FatSecretProfile> {
  const payload = await fatSecretOAuth1Request<{ profile?: Record<string, unknown> }>({
    credentials,
    path: "/rest/profile/v1"
  });
  const profile = toJsonRecord(payload.profile);

  return {
    goalWeightKg: parseNumber(profile?.goal_weight_kg),
    heightCm: parseNumber(profile?.height_cm),
    heightMeasure:
      typeof profile?.height_measure === "string" ? profile.height_measure : null,
    lastWeightComment:
      typeof profile?.last_weight_comment === "string" ? profile.last_weight_comment : null,
    lastWeightDateInt: parseNumber(profile?.last_weight_date_int),
    lastWeightKg: parseNumber(profile?.last_weight_kg),
    weightMeasure:
      typeof profile?.weight_measure === "string" ? profile.weight_measure : null
  };
}

export async function getMealsForDate(
  credentials: Pick<FatSecretStoredConnection, "authSecret" | "authToken">,
  date: string
): Promise<FatSecretFoodEntry[]> {
  const payload = await fatSecretOAuth1Request<{
    food_entries?: {
      food_entry?: Record<string, unknown> | Array<Record<string, unknown>>;
    };
  }>({
    credentials,
    path: "/rest/food-entries/v2",
    params: {
      date: `${toFatSecretDateInt(date)}`
    }
  });
  const root = toJsonRecord(payload.food_entries);
  const entries = normalizeToArray(root?.food_entry as Record<string, unknown> | Array<Record<string, unknown>>);

  return entries.flatMap((entry) => {
    const providerEntryId = entry.food_entry_id;
    const dateInt = parseNumber(entry.date_int);

    if ((!providerEntryId && providerEntryId !== 0) || dateInt === null) {
      return [];
    }

    const entryDate = fromFatSecretDateInt(dateInt);
    const normalizedPayload: Json = {
      api_method: "food_entries.get.v2",
      entry_date: entryDate,
      imported_at: new Date().toISOString(),
      provider_entry_id: `${providerEntryId}`,
      provider_user_data_sanitized: true
    };

    return [
      {
        calories: parseNumber(entry.calories),
        carbsG: parseNumber(entry.carbohydrate),
        entryDate,
        fatG: parseNumber(entry.fat),
        foodName:
          typeof entry.food_entry_name === "string" && entry.food_entry_name.trim()
            ? entry.food_entry_name.trim()
            : typeof entry.food_entry_description === "string" && entry.food_entry_description.trim()
            ? entry.food_entry_description.trim()
              : "FatSecret entry",
        mealType: normalizeMealType(entry.meal),
        profileEntryId: `${providerEntryId}`,
        proteinG: parseNumber(entry.protein),
        rawPayload: normalizedPayload
      }
    ];
  });
}

export async function searchFood(
  query: string,
  options?: {
    maxResults?: number;
    pageNumber?: number;
    region?: string;
  }
): Promise<FatSecretFoodSearchResult> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new FatSecretApiError("FatSecret food search requires a non-empty query.", 400);
  }

  const accessToken = await getFatSecretOAuth2AccessToken();
  const url = new URL("/rest/foods/search/v4", FATSECRET_API_BASE_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("search_expression", trimmedQuery);
  url.searchParams.set("page_number", `${Math.max(0, options?.pageNumber ?? 0)}`);
  url.searchParams.set("max_results", `${Math.min(50, Math.max(1, options?.maxResults ?? 20))}`);
  url.searchParams.set("flag_default_serving", "true");

  if (options?.region) {
    url.searchParams.set("region", options.region);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FATSECRET_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      method: "GET",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          foods_search?: Record<string, unknown>;
          error?: { code?: string; message?: string };
        }
      | null;

    if (!response.ok || getFatSecretApiErrorCode(payload)) {
      throw new FatSecretApiError(
        buildFatSecretApiErrorMessage(payload, "FatSecret food search failed."),
        response.status || 502
      );
    }

    const root = toJsonRecord(payload?.foods_search);
    const results = toJsonRecord(root?.results);
    const foods = normalizeToArray(results?.food as Record<string, unknown> | Array<Record<string, unknown>>);

    const items: FatSecretFoodSearchItem[] = foods.map((food) => {
      const servings = toJsonRecord(food.servings);
      const servingItems = normalizeToArray(
        servings?.serving as Record<string, unknown> | Array<Record<string, unknown>>
      );
      const defaultServing =
        servingItems.find((serving) => `${serving.is_default ?? ""}` === "1") ?? servingItems[0] ?? null;

      return {
        brandName: typeof food.brand_name === "string" ? food.brand_name : null,
        calories: parseNumber(defaultServing?.calories),
        carbsG: parseNumber(defaultServing?.carbohydrate),
        fatG: parseNumber(defaultServing?.fat),
        foodId: `${food.food_id ?? ""}`,
        foodName: typeof food.food_name === "string" ? food.food_name : "FatSecret food",
        foodType: typeof food.food_type === "string" ? food.food_type : null,
        proteinG: parseNumber(defaultServing?.protein),
        servingDescription:
          typeof defaultServing?.serving_description === "string"
            ? defaultServing.serving_description
            : null,
        servingId:
          defaultServing?.serving_id === null || defaultServing?.serving_id === undefined
            ? null
            : `${defaultServing.serving_id}`
      };
    });

    return {
      foods: items.filter((food) => food.foodId),
      maxResults: parseNumber(root?.max_results) ?? items.length,
      pageNumber: parseNumber(root?.page_number) ?? 0,
      totalResults: parseNumber(root?.total_results) ?? items.length
    };
  } catch (error) {
    if (error instanceof FatSecretApiError) {
      throw error;
    }

    throw new FatSecretApiError("Unable to complete the FatSecret food search.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
