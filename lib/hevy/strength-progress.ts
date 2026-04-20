import { HEVY_PROVIDER } from "@/lib/hevy/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, TableRow } from "@/types/supabase";

type TypedSupabase = ReturnType<typeof createServerSupabaseClient>;
type SourceWorkoutRow = Pick<TableRow<"source_workouts">, "raw_payload" | "workout_date">;
type JsonRecord = Record<string, Json | undefined>;

const EXERCISE_NAME_ALIASES = [
  "exercise",
  "exercise_name",
  "exercise_title",
  "movement",
  "name",
  "lift"
] as const;
const REPS_ALIASES = ["reps", "rep", "repetitions", "repetition"] as const;
const WEIGHT_KG_ALIASES = [
  "weight_kg",
  "kg",
  "weight_in_kg",
  "weight_kg_value"
] as const;
const WEIGHT_LB_ALIASES = [
  "weight_lb",
  "weight_lbs",
  "lb",
  "lbs",
  "weight_in_lb",
  "weight_in_lbs"
] as const;
const WEIGHT_ALIASES = ["weight", "weight_value", "load"] as const;
const WEIGHT_UNIT_ALIASES = ["weight_unit", "unit", "units", "weight_units"] as const;
const SET_TYPE_ALIASES = ["set_type", "set_type_name", "set_kind", "type"] as const;

export type StrengthProgressPoint = {
  date: string;
  value: number;
};

export type StrengthProgressExercise = {
  key: string;
  label: string;
  points: StrengthProgressPoint[];
};

export type StrengthProgressData = {
  defaultExerciseKey: string | null;
  exercises: StrengthProgressExercise[];
  validSetCount: number;
  workoutCount: number;
};

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isJsonRecord(value: Json | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNormalizedRecord(record: JsonRecord) {
  return new Map(
    Object.entries(record).map(([key, value]) => [normalizeKey(key), value] as const)
  );
}

function getStringValue(record: Map<string, Json | undefined>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = record.get(normalizeKey(alias));

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function parseLooseNumber(value: Json | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const compactValue = value.trim();

  if (!compactValue) {
    return null;
  }

  let normalizedValue = compactValue.replace(/[^\d,.-]/g, "");

  if (normalizedValue.includes(",") && !normalizedValue.includes(".")) {
    normalizedValue = normalizedValue.replace(",", ".");
  } else {
    normalizedValue = normalizedValue.replace(/,/g, "");
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getNumberValue(record: Map<string, Json | undefined>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const parsedValue = parseLooseNumber(record.get(normalizeKey(alias)));

    if (parsedValue !== null) {
      return parsedValue;
    }
  }

  return null;
}

function formatExerciseLabel(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => {
      if (segment.length <= 4) {
        return segment.toUpperCase();
      }

      return `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function normalizeExerciseName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isWarmupSet(record: Map<string, Json | undefined>) {
  const setType = getStringValue(record, SET_TYPE_ALIASES)?.toLowerCase() ?? "";
  return setType.includes("warm");
}

function resolveWeight(record: Map<string, Json | undefined>) {
  const weightKg = getNumberValue(record, WEIGHT_KG_ALIASES);

  if (weightKg !== null && weightKg > 0) {
    return weightKg;
  }

  const weightLbs = getNumberValue(record, WEIGHT_LB_ALIASES);

  if (weightLbs !== null && weightLbs > 0) {
    return weightLbs * 0.45359237;
  }

  const genericWeight = getNumberValue(record, WEIGHT_ALIASES);

  if (genericWeight === null || genericWeight <= 0) {
    return null;
  }

  const unit = getStringValue(record, WEIGHT_UNIT_ALIASES)?.toLowerCase() ?? "";

  if (unit.includes("lb")) {
    return genericWeight * 0.45359237;
  }

  return genericWeight;
}

function getRawPayloadRows(rawPayload: Json) {
  if (!isJsonRecord(rawPayload)) {
    return [];
  }

  const rows = rawPayload.rows;

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter(isJsonRecord);
}

function buildEstimatedOneRepMax(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

export async function getHevyStrengthProgressData(
  supabase: TypedSupabase,
  userId: string
): Promise<StrengthProgressData> {
  const { data, error } = await supabase
    .from("source_workouts")
    .select("workout_date, raw_payload")
    .eq("user_id", userId)
    .eq("provider", HEVY_PROVIDER)
    .order("workout_date", { ascending: true });

  if (error) {
    throw new Error(`Unable to load Hevy strength history: ${error.message}.`);
  }

  const workoutRows = (data ?? []) as SourceWorkoutRow[];
  const exercisePointMap = new Map<string, { label: string; pointsByDate: Map<string, number> }>();
  const contributingWorkoutDates = new Set<string>();
  let validSetCount = 0;

  for (const workout of workoutRows) {
    const rawRows = getRawPayloadRows(workout.raw_payload);

    for (const rawRow of rawRows) {
      const normalizedRecord = toNormalizedRecord(rawRow);

      if (isWarmupSet(normalizedRecord)) {
        continue;
      }

      const exerciseName = getStringValue(normalizedRecord, EXERCISE_NAME_ALIASES);
      const reps = getNumberValue(normalizedRecord, REPS_ALIASES);
      const weight = resolveWeight(normalizedRecord);

      if (!exerciseName || reps === null || reps <= 0 || weight === null || weight <= 0) {
        continue;
      }

      const normalizedExerciseName = normalizeExerciseName(exerciseName);
      const exerciseKey = normalizeKey(normalizedExerciseName);

      if (!exerciseKey) {
        continue;
      }

      const estimatedOneRepMax = buildEstimatedOneRepMax(weight, reps);
      const exerciseEntry = exercisePointMap.get(exerciseKey) ?? {
        label: formatExerciseLabel(normalizedExerciseName),
        pointsByDate: new Map<string, number>()
      };
      const currentBest = exerciseEntry.pointsByDate.get(workout.workout_date) ?? 0;

      exerciseEntry.pointsByDate.set(
        workout.workout_date,
        Math.max(currentBest, estimatedOneRepMax)
      );
      exercisePointMap.set(exerciseKey, exerciseEntry);
      contributingWorkoutDates.add(workout.workout_date);
      validSetCount += 1;
    }
  }

  const exercises = Array.from(exercisePointMap.entries())
    .map(([key, exerciseEntry]) => ({
      key,
      label: exerciseEntry.label,
      points: Array.from(exerciseEntry.pointsByDate.entries())
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([date, value]) => ({
          date,
          value: Number(value.toFixed(1))
        }))
    }))
    .filter((exercise) => exercise.points.length >= 2)
    .sort((left, right) => {
      return (
        right.points.length - left.points.length ||
        right.points[right.points.length - 1].date.localeCompare(
          left.points[left.points.length - 1].date
        ) ||
        left.label.localeCompare(right.label)
      );
    });

  return {
    defaultExerciseKey: exercises[0]?.key ?? null,
    exercises,
    validSetCount,
    workoutCount: contributingWorkoutDates.size
  };
}
