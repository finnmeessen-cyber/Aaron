import "server-only";

import type { HevyApiSyncMode } from "@/lib/hevy/types";

const HEVY_API_BASE_URL = "https://api.hevyapp.com";
const HEVY_MAX_PAGE_SIZE = 10;
const HEVY_REQUEST_TIMEOUT_MS = 10_000;
const HEVY_MAX_REQUEST_ATTEMPTS = 3;
const HEVY_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

type HevyApiPaginatedResponse<TItem, TKey extends string> = {
  page: number;
  page_count: number;
} & Record<TKey, TItem[]>;

export type HevyApiWorkoutSet = {
  custom_metric?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  index?: number;
  reps?: number | null;
  rpe?: number | null;
  type?: string;
  weight_kg?: number | null;
};

export type HevyApiWorkoutExercise = {
  exercise_template_id?: string;
  index?: number;
  notes?: string;
  sets?: HevyApiWorkoutSet[];
  supersets_id?: number | null;
  title?: string;
};

export type HevyApiWorkout = {
  created_at?: string;
  description?: string;
  end_time?: string;
  exercises?: HevyApiWorkoutExercise[];
  id: string;
  routine_id?: string;
  start_time?: string;
  title?: string;
  updated_at?: string;
};

export type HevyApiWorkoutEvent =
  | {
      type: "updated";
      workout: HevyApiWorkout;
    }
  | {
      deleted_at?: string;
      id: string;
      type: "deleted";
    };

export type HevyApiUserInfo = {
  id: string;
  name: string;
  url: string;
};

export class HevyApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "HevyApiError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toObjectKeys(value: unknown) {
  return isRecord(value) ? Object.keys(value).sort() : [];
}

function sleep(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isRetryableHevyError(error: unknown) {
  return error instanceof HevyApiError && HEVY_RETRYABLE_STATUSES.has(error.status);
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isTransientFetchError(error: unknown) {
  if (isAbortLikeError(error)) {
    return true;
  }

  return error instanceof TypeError;
}

function logUnexpectedPaginatedResponseShape(path: string, key: string, payload: unknown) {
  const dataPayload = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
  const topLevelCollection = isRecord(payload) ? payload[key] : undefined;
  const nestedCollection = dataPayload ? dataPayload[key] : undefined;

  console.warn("Unexpected Hevy paginated response shape", {
    dataKeys: toObjectKeys(dataPayload),
    hasDataWrapper: Boolean(dataPayload),
    nestedCollectionType:
      nestedCollection === null ? "null" : Array.isArray(nestedCollection) ? "array" : typeof nestedCollection,
    path,
    requestedCollectionKey: key,
    topLevelCollectionType:
      topLevelCollection === null ? "null" : Array.isArray(topLevelCollection) ? "array" : typeof topLevelCollection,
    topLevelKeys: toObjectKeys(payload)
  });
}

function extractPaginatedCollection<TItem, TKey extends string>(
  payload: unknown,
  key: TKey,
  path: string
) {
  if (Array.isArray(payload)) {
    return {
      items: payload as TItem[],
      page: 1,
      pageCount: 1
    };
  }

  if (!isRecord(payload)) {
    logUnexpectedPaginatedResponseShape(path, key, payload);
    throw new HevyApiError(`Hevy API returned an unexpected ${key} response shape.`, 502);
  }

  const dataPayload = isRecord(payload.data) ? payload.data : null;
  const collectionValue = Array.isArray(payload[key])
    ? payload[key]
    : dataPayload && Array.isArray(dataPayload[key])
      ? dataPayload[key]
      : null;

  if (collectionValue) {
    const page = isFiniteNumber(payload.page)
      ? payload.page
      : dataPayload && isFiniteNumber(dataPayload.page)
        ? dataPayload.page
        : 1;
    const pageCount = isFiniteNumber(payload.page_count)
      ? payload.page_count
      : dataPayload && isFiniteNumber(dataPayload.page_count)
        ? dataPayload.page_count
        : page;

    return {
      items: collectionValue as TItem[],
      page,
      pageCount
    };
  }

  const emptyCollectionValue =
    (key in payload && payload[key] === null) || (dataPayload !== null && key in dataPayload && dataPayload[key] === null);

  if (emptyCollectionValue) {
    const page = isFiniteNumber(payload.page)
      ? payload.page
      : dataPayload && isFiniteNumber(dataPayload.page)
        ? dataPayload.page
        : 1;
    const pageCount = isFiniteNumber(payload.page_count)
      ? payload.page_count
      : dataPayload && isFiniteNumber(dataPayload.page_count)
        ? dataPayload.page_count
        : page;

    return {
      items: [] as TItem[],
      page,
      pageCount
    };
  }

  logUnexpectedPaginatedResponseShape(path, key, payload);
  throw new HevyApiError(`Hevy API returned an unexpected ${key} response shape.`, 502);
}

async function hevyRequest<T>(path: string, apiKey: string, params?: Record<string, string>) {
  const url = new URL(path, HEVY_API_BASE_URL);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 1; attempt <= HEVY_MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, HEVY_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "api-key": apiKey
        },
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; data?: unknown }
        | null;

      if (!response.ok) {
        const errorMessage =
          (payload && typeof payload.error === "string" && payload.error) ||
          "Unable to reach the Hevy API.";

        if (response.status === 401 || response.status === 403) {
          throw new HevyApiError(
            "The stored Hevy API key was rejected. Please reconnect your Hevy key and try again.",
            401
          );
        }

        throw new HevyApiError(errorMessage, response.status);
      }

      return payload as T;
    } catch (error) {
      const canRetry =
        attempt < HEVY_MAX_REQUEST_ATTEMPTS &&
        (isRetryableHevyError(error) || isTransientFetchError(error));

      if (!canRetry) {
        if (isAbortLikeError(error)) {
          throw new HevyApiError("The Hevy API timed out before it could respond.", 504);
        }

        if (error instanceof TypeError) {
          throw new HevyApiError("Unable to reach the Hevy API right now.", 502);
        }

        throw error;
      }

      await sleep(250 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new HevyApiError("Unable to reach the Hevy API right now.", 502);
}

function parseHevyWorkoutSet(payload: unknown): HevyApiWorkoutSet | null {
  if (!isRecord(payload)) {
    return null;
  }

  return {
    custom_metric: isFiniteNumber(payload.custom_metric) ? payload.custom_metric : null,
    distance_meters: isFiniteNumber(payload.distance_meters) ? payload.distance_meters : null,
    duration_seconds: isFiniteNumber(payload.duration_seconds) ? payload.duration_seconds : null,
    index: isFiniteNumber(payload.index) ? payload.index : undefined,
    reps: isFiniteNumber(payload.reps) ? payload.reps : null,
    rpe: isFiniteNumber(payload.rpe) ? payload.rpe : null,
    type: isString(payload.type) ? payload.type : undefined,
    weight_kg: isFiniteNumber(payload.weight_kg) ? payload.weight_kg : null
  };
}

function parseHevyWorkoutExercise(payload: unknown): HevyApiWorkoutExercise | null {
  if (!isRecord(payload)) {
    return null;
  }

  const sets = Array.isArray(payload.sets)
    ? payload.sets
        .map(parseHevyWorkoutSet)
        .filter((set): set is HevyApiWorkoutSet => Boolean(set))
    : undefined;

  return {
    exercise_template_id: isString(payload.exercise_template_id)
      ? payload.exercise_template_id
      : undefined,
    index: isFiniteNumber(payload.index) ? payload.index : undefined,
    notes: isString(payload.notes) ? payload.notes : undefined,
    sets,
    supersets_id: isFiniteNumber(payload.supersets_id) ? payload.supersets_id : null,
    title: isString(payload.title) ? payload.title : undefined
  };
}

function parseHevyWorkout(payload: unknown): HevyApiWorkout | null {
  if (!isRecord(payload) || !isString(payload.id)) {
    return null;
  }

  const exercises = Array.isArray(payload.exercises)
    ? payload.exercises
        .map(parseHevyWorkoutExercise)
        .filter((exercise): exercise is HevyApiWorkoutExercise => Boolean(exercise))
    : undefined;

  return {
    created_at: isString(payload.created_at) ? payload.created_at : undefined,
    description: isString(payload.description) ? payload.description : undefined,
    end_time: isString(payload.end_time) ? payload.end_time : undefined,
    exercises,
    id: payload.id,
    routine_id: isString(payload.routine_id) ? payload.routine_id : undefined,
    start_time: isString(payload.start_time) ? payload.start_time : undefined,
    title: isString(payload.title) ? payload.title : undefined,
    updated_at: isString(payload.updated_at) ? payload.updated_at : undefined
  };
}

function parseHevyWorkoutEvent(payload: unknown): HevyApiWorkoutEvent | null {
  if (!isRecord(payload) || !isString(payload.type)) {
    return null;
  }

  if (payload.type === "deleted" && isString(payload.id)) {
    return {
      deleted_at: isString(payload.deleted_at) ? payload.deleted_at : undefined,
      id: payload.id,
      type: "deleted"
    };
  }

  if (payload.type === "updated") {
    const workout = parseHevyWorkout(payload.workout);

    if (!workout) {
      return null;
    }

    return {
      type: "updated",
      workout
    };
  }

  return null;
}

async function fetchPaginatedCollection<TItem, TKey extends string>(
  path: string,
  key: TKey,
  apiKey: string,
  extraParams?: Record<string, string>
) {
  const items: TItem[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const response = await hevyRequest<HevyApiPaginatedResponse<TItem, TKey>>(path, apiKey, {
      page: String(page),
      pageSize: String(HEVY_MAX_PAGE_SIZE),
      ...extraParams
    });
    const normalizedResponse = extractPaginatedCollection<TItem, TKey>(response, key, path);

    items.push(...normalizedResponse.items);
    pageCount = normalizedResponse.pageCount;
    page += 1;
  } while (page <= pageCount);

  return items;
}

export async function getHevyUserInfo(apiKey: string) {
  const response = await hevyRequest<{ data?: HevyApiUserInfo }>("/v1/user/info", apiKey);
  const userPayload: unknown = isRecord(response.data) ? response.data : isRecord(response) ? response : null;

  if (
    !isRecord(userPayload) ||
    !isString(userPayload.id) ||
    !isString(userPayload.name) ||
    !isString(userPayload.url)
  ) {
    throw new HevyApiError("Hevy API did not return user info for the provided key.", 502);
  }

  return {
    id: userPayload.id,
    name: userPayload.name,
    url: userPayload.url
  };
}

export async function listAllHevyWorkouts(apiKey: string) {
  const workouts = await fetchPaginatedCollection<unknown, "workouts">(
    "/v1/workouts",
    "workouts",
    apiKey
  );

  return workouts
    .map(parseHevyWorkout)
    .filter((workout): workout is HevyApiWorkout => Boolean(workout));
}

export async function listHevyWorkoutEventsSince(apiKey: string, since: string) {
  const events = await fetchPaginatedCollection<unknown, "events">(
    "/v1/workouts/events",
    "events",
    apiKey,
    { since }
  );

  return events
    .map(parseHevyWorkoutEvent)
    .filter((event): event is HevyApiWorkoutEvent => Boolean(event));
}

export function resolveHevySyncMode(since: string | null): HevyApiSyncMode {
  return since ? "incremental" : "full";
}
