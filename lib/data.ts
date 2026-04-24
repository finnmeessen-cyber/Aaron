import type { Route } from "next";

import {
  buildWeeklySuggestions,
  computeChecklistCompletionFromCount,
  computeStreak,
  computeTrendDelta,
  computeWeeklyWeightAverage,
  resolveEntryStatus,
  toChartSeries
} from "@/lib/analytics";
import {
  filterChecklistTemplatesByActiveSupplements,
  getTrackedSupplementIds
} from "@/lib/supplement-tracking";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, TableRow } from "@/types/supabase";
import {
  average,
  daysSince,
  differenceInDateKeys,
  endOfWeekDateKey,
  getDateKeyDayIndex,
  isDateKey,
  shiftDateKey,
  startOfWeekDateKey,
  toDateInputValue
} from "@/lib/utils";

type TypedSupabase = ReturnType<typeof createServerSupabaseClient>;

type DailyEntry = TableRow<"daily_entries">;
type DailyChecklist = TableRow<"daily_checklists">;
type ChecklistTemplate = TableRow<"checklist_templates">;
type Phase = TableRow<"phases">;
type PhaseSupplement = TableRow<"phase_supplements">;
type SupplementLog = TableRow<"supplement_logs">;
type SupplementCatalog = TableRow<"supplement_catalog">;
type UserSupplement = TableRow<"user_supplements">;
type MealTemplate = TableRow<"meal_templates">;
type DayTemplate = TableRow<"day_templates">;
type UserSettings = TableRow<"user_settings">;
type Profile = TableRow<"profiles">;
type SourceNutritionEntry = TableRow<"source_nutrition_entries">;
type SourceWorkout = TableRow<"source_workouts">;
type SupplementCatalogSummary = Pick<SupplementCatalog, "id" | "slug" | "is_default_active">;
type UserSupplementStatus = Pick<UserSupplement, "supplement_id" | "active">;
type DailySourceStatus = "manual" | "missing" | "synced";
export type WeeklySourceKind = "manual" | "synced" | "derived" | "mixed" | "none";

export type AppShellData = {
  profile: Profile | null;
  settings: UserSettings | null;
  currentPhase: Phase | null;
  phaseDurationLabel: string | null;
};

export type DashboardData = {
  dateLabel: string;
  todayEntry: DailyEntry | null;
  todayChecklistCompletion: number;
  openLoopCount: number;
  statusLabel: string;
  currentPhase: Phase | null;
  phaseDurationLabel: string | null;
  streak: number;
  nextActions: Array<{
    ctaLabel: string;
    description: string;
    href: Route;
    title: string;
  }>;
  cards: Array<{
    label: string;
    value: string;
    hint: string;
  }>;
  quickStats: Array<{
    label: string;
    value: string;
  }>;
  chartSeries: Array<{
    date: string;
    weight: number | null;
    energy: number | null;
    cravings: number | null;
  }>;
};

export type DailyPageData = {
  dailyNutrition: {
    entries: Array<{
      calories: number | null;
      carbsG: number | null;
      fatG: number | null;
      foodName: string;
      id: string;
      mealType: string;
      proteinG: number | null;
    }>;
    sourceStatus: DailySourceStatus;
    totals: {
      calories: number | null;
      carbsG: number | null;
      fatG: number | null;
      proteinG: number | null;
    };
  };
  dailyTraining: {
    completed: boolean;
    sourceStatus: DailySourceStatus;
    summary: {
      isBestEffort: boolean;
      totalDurationMinutes: number;
      totalExerciseCount: number;
      totalVolumeKg: number | null;
      workoutCount: number;
    };
    workouts: Array<{
      durationMinutes: number | null;
      exerciseCount: number;
      hasStructuredSummary: boolean;
      id: string;
      providerWorkoutId: string;
      startedAt: string | null;
      title: string;
      totalVolumeKg: number | null;
    }>;
  };
  selectedDate: string;
  timezone: string | null;
  entry: DailyEntry | null;
  checklistTemplates: ChecklistTemplate[];
  checklistStates: DailyChecklist[];
  dayTemplates: DayTemplate[];
  settings: UserSettings | null;
  supplementLogMeta: Array<{
    active: boolean;
    id: string;
    slug: string;
  }>;
  syncedTodoTaskIds: string[];
};

export type SupplementsPageData = {
  items: Array<
    SupplementCatalog & {
      userState: UserSupplement | null;
      active: boolean;
      effectiveDosage: string | null;
      effectiveTiming: string | null;
      effectiveNotes: string | null;
    }
  >;
};

export type NutritionPageData = {
  fatsecretDaily: {
    entries: Array<{
      calories: number | null;
      carbsG: number | null;
      fatG: number | null;
      foodName: string;
      id: string;
      mealType: string;
      proteinG: number | null;
    }>;
    selectedDate: string;
    totals: {
      calories: number | null;
      carbsG: number | null;
      fatG: number | null;
      proteinG: number | null;
    };
  };
  mealTemplates: MealTemplate[];
  settings: UserSettings | null;
};

export type PhasesPageData = {
  phases: Array<
    Phase & {
      supplements: Array<
        PhaseSupplement & {
          supplement: SupplementCatalog | null;
        }
      >;
    }
  >;
  currentPhaseSlug: string | null;
};

export type WeeklyReviewData = {
  currentWeekStart: string;
  averageWeight: number | null;
  weightChange: number | null;
  cravingsTrend: number | null;
  energyTrend: number | null;
  trainingSessions: number;
  supplementCompliance: number;
  suggestions: string[];
  chartSeries: Array<{
    date: string;
    weight: number | null;
    energy: number | null;
    cravings: number | null;
  }>;
};

export type ReviewPageData = {
  currentWeekEnd: string;
  currentWeekStart: string;
  days: Array<{
    calories: number | null;
    cravings: number | null;
    date: string;
    energy: number | null;
    sleep: number | null;
    trainingCompleted: boolean;
  }>;
  summary: {
    caloriesAverage: number | null;
    caloriesLoggedDays: number;
    cravingsAverage: number | null;
    energyAverage: number | null;
    sleepAverage: number | null;
    trackedDays: number;
    trainingDays: number;
  };
};

export type WeeklyDayNutrition = {
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: WeeklySourceKind;
};

export type WeeklyTrainingDay = {
  date: string;
  workoutsCompleted: number;
  workoutsWithKnownVolume: number;
  durationMinutes: number | null;
  volumeKg: number | null;
  active: boolean;
  source: WeeklySourceKind;
  bestEffort?: boolean;
};

export type WeeklySleepDay = {
  date: string;
  sleepMinutes: number | null;
  source: WeeklySourceKind;
};

export type WeeklyOverview = {
  range: {
    start: string;
    end: string;
  };
  nutrition: {
    days: WeeklyDayNutrition[];
    totals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
    averages: {
      calories: number | null;
      protein: number | null;
      carbs: number | null;
      fat: number | null;
    };
    source: WeeklySourceKind;
  };
  training: {
    days: WeeklyTrainingDay[];
    summary: {
      workoutsCompleted: number;
      durationMinutes: number;
      volumeKg: number;
      activeDays: number;
    };
    source: WeeklySourceKind;
    bestEffort?: boolean;
  };
  sleep: {
    days: WeeklySleepDay[];
    summary: {
      averageSleepMinutes: number | null;
      totalSleepMinutes: number;
      trackedDays: number;
    };
    source: WeeklySourceKind;
  };
};

export type SettingsPageData = {
  settings: UserSettings | null;
  phases: Phase[];
  supplements: Array<
    SupplementCatalog & {
      active: boolean;
      userState: UserSupplement | null;
    }
  >;
};

export async function getAppShellData(supabase: TypedSupabase, userId: string): Promise<AppShellData> {
  const [{ data: profileData }, { data: settingsData }, { data: phasesData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("phases").select("*").order("sort_order", { ascending: true })
  ]);

  const profileRow = (profileData ?? null) as Profile | null;
  const settingsRow = (settingsData ?? null) as UserSettings | null;
  const phaseRows = (phasesData ?? []) as Phase[];
  const currentPhase =
    phaseRows.find((phase) => phase.slug === settingsRow?.current_phase_slug) ?? null;

  return {
    profile: profileRow,
    settings: settingsRow,
    currentPhase,
    phaseDurationLabel: getPhaseDurationLabel(settingsRow, currentPhase, profileRow?.timezone)
  };
}

export async function getDashboardData(
  supabase: TypedSupabase,
  userId: string
): Promise<DashboardData> {
  const appShell = await getAppShellData(supabase, userId);
  const timezone = appShell.profile?.timezone ?? "Europe/Berlin";
  const today = toDateInputValue(new Date(), timezone);
  const sixtyDaysAgo = shiftDateKey(today, -59);
  const fourteenDaysAgo = shiftDateKey(today, -13);
  const sevenDaysAgo = shiftDateKey(today, -6);

  const [
    { data: entries },
    { data: recentChecklists },
    { data: checklistTemplates },
    { data: supplementLogs },
    { data: supplementCatalog },
    { data: userSupplements }
  ] = await Promise.all([
    supabase
      .from("daily_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("entry_date", sixtyDaysAgo)
      .order("entry_date", { ascending: true }),
    supabase
      .from("daily_checklists")
      .select("*")
      .eq("user_id", userId)
      .gte("entry_date", sixtyDaysAgo),
    supabase.from("checklist_templates").select("*"),
    supabase
      .from("supplement_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("log_date", sevenDaysAgo),
    supabase.from("supplement_catalog").select("id, slug, is_default_active"),
    supabase.from("user_supplements").select("supplement_id, active").eq("user_id", userId)
  ]);

  const entryRows: DailyEntry[] = entries ?? [];
  const checklistRows: DailyChecklist[] = recentChecklists ?? [];
  const checklistTemplateRows: ChecklistTemplate[] = checklistTemplates ?? [];
  const supplementLogRows: SupplementLog[] = supplementLogs ?? [];
  const supplementCatalogRows: SupplementCatalogSummary[] = supplementCatalog ?? [];
  const userSupplementRows: UserSupplementStatus[] = userSupplements ?? [];

  const allEntries = entryRows;
  const allChecklistRows = checklistRows;
  const chartEntries = allEntries.filter((entry) => entry.entry_date >= fourteenDaysAgo);
  const recentChecklistRows = allChecklistRows.filter((item) => item.entry_date >= sevenDaysAgo);
  const allChecklistTemplates = checklistTemplateRows;
  const supplementLogMeta = buildSupplementLogMeta(supplementCatalogRows, userSupplementRows);
  const trackedSupplementIds = getTrackedSupplementIds(
    allChecklistTemplates,
    supplementLogMeta
  );
  const trackedSupplementIdSet = new Set(trackedSupplementIds);
  const todayChecklists = recentChecklistRows.filter((item) => item.entry_date === today);
  const todaySupplementLogs = supplementLogRows.filter(
    (item) => item.log_date === today && trackedSupplementIdSet.has(item.supplement_id)
  );
  const todayEntry = allEntries.find((entry) => entry.entry_date === today) ?? null;
  const currentWeekEntries = allEntries.filter((entry) => entry.entry_date >= sevenDaysAgo);
  const previousWeekEntries = allEntries.filter(
    (entry) => entry.entry_date >= fourteenDaysAgo && entry.entry_date < sevenDaysAgo
  );
  const completedTodayChecklistCount = todayChecklists.filter((item) => item.completed).length;
  const completedTodaySupplementCount = todaySupplementLogs.filter((item) => item.completed).length;
  const completedWeeklySupplementCount = supplementLogRows.filter(
    (item) => item.completed && trackedSupplementIdSet.has(item.supplement_id)
  ).length;
  const plannedTrainingToday = (appShell.settings?.training_days ?? [1, 3, 5]).includes(
    getDateKeyDayIndex(today)
  );
  const trainingCompliance = computeTrainingComplianceAgainstPlan(
    currentWeekEntries,
    appShell.settings?.training_days ?? [1, 3, 5],
    today
  );

  const weightAverage = computeWeeklyWeightAverage(currentWeekEntries);
  const cravingsTrend = computeTrendDelta(
    currentWeekEntries.map((entry) => entry.cravings_score),
    previousWeekEntries.map((entry) => entry.cravings_score)
  );
  const supplementCompliance = computeChecklistCompletionFromCount(
    completedWeeklySupplementCount,
    trackedSupplementIds.length * 7
  );
  const todayChecklistCompletion = computeChecklistCompletionFromCount(
    completedTodayChecklistCount,
    allChecklistTemplates.length
  );
  const todaySupplementCompletion = computeChecklistCompletionFromCount(
    completedTodaySupplementCount,
    trackedSupplementIds.length || 1
  );
  const nextActionState = buildDashboardNextActions({
    currentPhase: appShell.currentPhase,
    plannedTrainingToday,
    todayChecklistCompletion,
    todayEntry,
    todaySupplementCompletion,
    trackedSupplementCount: trackedSupplementIds.length
  });

  return {
    dateLabel: today,
    todayEntry,
    todayChecklistCompletion,
    openLoopCount: nextActionState.openLoopCount,
    statusLabel:
      todayEntry || todayChecklists.length === 0
        ? resolveEntryStatus(todayEntry)
        : "Checkliste läuft",
    currentPhase: appShell.currentPhase,
    phaseDurationLabel: appShell.phaseDurationLabel,
    streak: computeStreak(
      allEntries.map((entry) => entry.entry_date),
      allChecklistRows,
      timezone,
      3
    ),
    nextActions: nextActionState.actions,
    cards: [
      {
        label: "Wochenschnitt Gewicht",
        value: weightAverage !== null ? `${weightAverage.toFixed(1)} kg` : "Keine Daten",
        hint: "7 Tage"
      },
      {
        label: "Cravings-Trend",
        value: cravingsTrend === null ? "Keine Daten" : `${cravingsTrend > 0 ? "+" : ""}${cravingsTrend.toFixed(1)}`,
        hint: "vs. Vorwoche"
      },
      {
        label: "Trainings-Compliance",
        value: `${trainingCompliance}%`,
        hint: "Letzte 7 Tage"
      },
      {
        label: "Supplement-Compliance",
        value: `${supplementCompliance}%`,
        hint: "Letzte 7 Tage"
      }
    ],
    quickStats: [
      {
        label: "Gewicht",
        value:
          todayEntry?.body_weight !== null && todayEntry?.body_weight !== undefined
            ? `${todayEntry.body_weight.toFixed(1)} kg`
            : "Offen"
      },
      {
        label: "Schlaf",
        value:
          todayEntry?.sleep_score !== null && todayEntry?.sleep_score !== undefined
            ? `${todayEntry.sleep_score}/10`
            : "Offen"
      },
      {
        label: "Energie",
        value:
          todayEntry?.energy_score !== null && todayEntry?.energy_score !== undefined
            ? `${todayEntry.energy_score}/10`
            : "Offen"
      },
      {
        label: "Cravings",
        value:
          todayEntry?.cravings_score !== null && todayEntry?.cravings_score !== undefined
            ? `${todayEntry.cravings_score}/10`
            : "Offen"
      },
      {
        label: "Training",
        value: todayEntry ? (todayEntry.training_completed ? "Ja" : "Nein") : "Offen"
      },
      {
        label: "Kalorien",
        value:
          todayEntry?.calories !== null && todayEntry?.calories !== undefined
            ? `${todayEntry.calories}`
            : "Offen"
      }
    ],
    chartSeries: toChartSeries(chartEntries)
  };
}

export async function getDailyPageData(
  supabase: TypedSupabase,
  userId: string,
  selectedDate?: string
): Promise<DailyPageData> {
  const { data: profileTimezoneData } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const profileTimezoneRow = (profileTimezoneData ?? null) as Pick<Profile, "timezone"> | null;
  const timezone = profileTimezoneRow?.timezone ?? "Europe/Berlin";

  const effectiveSelectedDate =
    selectedDate && isDateKey(selectedDate)
      ? selectedDate
      : toDateInputValue(new Date(), timezone);

  const [
    { data: entry },
    { data: checklistTemplates },
    { data: checklistStates },
    { data: dayTemplates },
    { data: settings },
    { data: sourceNutritionEntries },
    { data: sourceWorkouts },
    { data: supplementCatalog },
    { data: userSupplements }
  ] =
    await Promise.all([
      supabase
        .from("daily_entries")
        .select("*")
        .eq("user_id", userId)
        .eq("entry_date", effectiveSelectedDate)
        .maybeSingle(),
      supabase.from("checklist_templates").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("daily_checklists")
        .select("*")
        .eq("user_id", userId)
        .eq("entry_date", effectiveSelectedDate),
      supabase.from("day_templates").select("*").order("title", { ascending: true }),
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("source_nutrition_entries")
        .select("id, meal_type, food_name, calories, protein_g, carbs_g, fat_g")
        .eq("user_id", userId)
        .eq("provider", "fatsecret")
        .eq("entry_date", effectiveSelectedDate)
        .order("meal_type", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("source_workouts")
        .select("id, provider_workout_id, started_at, duration_minutes, title, raw_payload")
        .eq("user_id", userId)
        .eq("provider", "hevy")
        .eq("workout_date", effectiveSelectedDate)
        .order("started_at", { ascending: true }),
      supabase.from("supplement_catalog").select("id, slug, is_default_active"),
      supabase.from("user_supplements").select("supplement_id, active").eq("user_id", userId)
    ]);

  const entryRow = (entry ?? null) as DailyEntry | null;
  const checklistTemplateRows: ChecklistTemplate[] = checklistTemplates ?? [];
  const checklistStateRows: DailyChecklist[] = checklistStates ?? [];
  const dayTemplateRows: DayTemplate[] = dayTemplates ?? [];
  const settingsRow: UserSettings | null = settings ?? null;
  const sourceNutritionEntryRows: Pick<
    SourceNutritionEntry,
    "id" | "meal_type" | "food_name" | "calories" | "protein_g" | "carbs_g" | "fat_g"
  >[] = sourceNutritionEntries ?? [];
  const sourceWorkoutRows: Pick<
    SourceWorkout,
    "id" | "provider_workout_id" | "started_at" | "duration_minutes" | "title" | "raw_payload"
  >[] = sourceWorkouts ?? [];
  const supplementCatalogRows: SupplementCatalogSummary[] = supplementCatalog ?? [];
  const userSupplementRows: UserSupplementStatus[] = userSupplements ?? [];
  const supplementLogMeta = buildSupplementLogMeta(supplementCatalogRows, userSupplementRows);
  const visibleChecklistTemplateRows = filterChecklistTemplatesByActiveSupplements(
    checklistTemplateRows,
    supplementLogMeta
  );
  const visibleChecklistTemplateKeys = new Set(
    visibleChecklistTemplateRows.map((template) => template.template_key)
  );
  const dailyNutrition = {
    entries: sourceNutritionEntryRows.map((entry) => ({
      calories: entry.calories,
      carbsG: entry.carbs_g,
      fatG: entry.fat_g,
      foodName: entry.food_name,
      id: entry.id,
      mealType: entry.meal_type,
      proteinG: entry.protein_g
    })),
    sourceStatus: resolveNutritionSourceStatus(entryRow, sourceNutritionEntryRows.length > 0),
    totals: {
      calories: entryRow?.calories ?? null,
      carbsG: entryRow?.carbs_g ?? null,
      fatG: entryRow?.fat_g ?? null,
      proteinG: entryRow?.protein_g ?? null
    }
  };
  const dailyTrainingWorkouts = sourceWorkoutRows.map((workout) => {
    const summary = summarizeWorkoutRawPayload(workout.raw_payload);

    return {
      durationMinutes: workout.duration_minutes,
      exerciseCount: summary.exerciseCount,
      hasStructuredSummary: summary.hasStructuredSummary,
      id: workout.id,
      providerWorkoutId: workout.provider_workout_id,
      startedAt: workout.started_at,
      title: workout.title ?? "Hevy Workout",
      totalVolumeKg: summary.totalVolumeKg
    };
  });
  const dailyTraining = {
    completed: entryRow?.training_completed ?? dailyTrainingWorkouts.length > 0,
    sourceStatus: resolveTrainingSourceStatus(entryRow, dailyTrainingWorkouts.length > 0),
    summary: {
      isBestEffort: dailyTrainingWorkouts.some((workout) => !workout.hasStructuredSummary),
      totalDurationMinutes: dailyTrainingWorkouts.reduce(
        (sum, workout) => sum + (workout.durationMinutes ?? 0),
        0
      ),
      totalExerciseCount: dailyTrainingWorkouts.reduce(
        (sum, workout) => sum + workout.exerciseCount,
        0
      ),
      totalVolumeKg: roundToSingleNullableNumber(
        dailyTrainingWorkouts.reduce((sum, workout) => sum + (workout.totalVolumeKg ?? 0), 0),
        dailyTrainingWorkouts.some((workout) => workout.totalVolumeKg !== null)
      ),
      workoutCount: dailyTrainingWorkouts.length
    },
    workouts: dailyTrainingWorkouts
  };
  const syncedTodoTaskIds = Array.from(
    new Set([
      ...sourceNutritionEntryRows.flatMap((entry) =>
        mapFatSecretMealTypeToTodoTaskIds(entry.meal_type)
      ),
      ...(dailyTrainingWorkouts.length ? ["training"] : [])
    ])
  );

  return {
    dailyNutrition,
    dailyTraining,
    selectedDate: effectiveSelectedDate,
    timezone,
    entry: entryRow,
    checklistTemplates: visibleChecklistTemplateRows,
    checklistStates: checklistStateRows.filter((state) =>
      visibleChecklistTemplateKeys.has(state.template_key)
    ),
    dayTemplates: dayTemplateRows,
    settings: settingsRow,
    supplementLogMeta,
    syncedTodoTaskIds
  };
}

export async function getSupplementsPageData(
  supabase: TypedSupabase,
  userId: string
): Promise<SupplementsPageData> {
  const [{ data: catalog }, { data: userSupplements }] = await Promise.all([
    supabase.from("supplement_catalog").select("*").order("sort_order", { ascending: true }),
    supabase.from("user_supplements").select("*").eq("user_id", userId)
  ]);

  const catalogRows: SupplementCatalog[] = catalog ?? [];
  const userSupplementRows: UserSupplement[] = userSupplements ?? [];
  const userStateMap = new Map(userSupplementRows.map((item) => [item.supplement_id, item]));

  return {
    items: catalogRows.map((supplement) => {
      const userState = userStateMap.get(supplement.id) ?? null;
      return {
        ...supplement,
        userState,
        active: userState?.active ?? supplement.is_default_active,
        effectiveDosage: userState?.custom_dosage ?? supplement.dosage,
        effectiveTiming: userState?.custom_timing ?? supplement.timing,
        effectiveNotes: userState?.notes ?? null
      };
    })
  };
}

export async function getNutritionPageData(
  supabase: TypedSupabase,
  userId: string
): Promise<NutritionPageData> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const profileRow = (profile ?? null) as Pick<Profile, "timezone"> | null;
  const selectedDate = toDateInputValue(new Date(), profileRow?.timezone ?? "Europe/Berlin");
  const [{ data: templates }, { data: settings }, { data: todayEntry }, { data: todayNutritionEntries }] =
    await Promise.all([
    supabase
      .from("meal_templates")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("sort_order", { ascending: true }),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("daily_entries")
      .select("entry_date, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .eq("entry_date", selectedDate)
      .maybeSingle(),
    supabase
      .from("source_nutrition_entries")
      .select("id, meal_type, food_name, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .eq("provider", "fatsecret")
      .eq("entry_date", selectedDate)
      .order("meal_type", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  const templateRows: MealTemplate[] = templates ?? [];
  const settingsRow: UserSettings | null = settings ?? null;
  const merged = new Map<string, MealTemplate>();
  for (const template of templateRows) {
    const existing = merged.get(template.template_key);
    if (!existing || template.user_id === userId) {
      merged.set(template.template_key, template);
    }
  }

  return {
    fatsecretDaily: {
      entries: ((todayNutritionEntries ?? []) as Array<{
        calories: number | null;
        carbs_g: number | null;
        fat_g: number | null;
        food_name: string;
        id: string;
        meal_type: string;
        protein_g: number | null;
      }>).map((entry) => ({
        calories: entry.calories,
        carbsG: entry.carbs_g,
        fatG: entry.fat_g,
        foodName: entry.food_name,
        id: entry.id,
        mealType: entry.meal_type,
        proteinG: entry.protein_g
      })),
      selectedDate,
      totals: {
        calories: (todayEntry as { calories?: number | null } | null)?.calories ?? null,
        carbsG: (todayEntry as { carbs_g?: number | null } | null)?.carbs_g ?? null,
        fatG: (todayEntry as { fat_g?: number | null } | null)?.fat_g ?? null,
        proteinG: (todayEntry as { protein_g?: number | null } | null)?.protein_g ?? null
      }
    },
    mealTemplates: [...merged.values()].sort((left, right) => left.sort_order - right.sort_order),
    settings: settingsRow
  };
}

export async function getPhasesPageData(
  supabase: TypedSupabase,
  userId: string
): Promise<PhasesPageData> {
  const [
    { data: phases },
    { data: phaseSupplements },
    { data: supplements },
    { data: settingsData }
  ] = await Promise.all([
      supabase.from("phases").select("*").order("sort_order", { ascending: true }),
      supabase.from("phase_supplements").select("*").order("sort_order", { ascending: true }),
      supabase.from("supplement_catalog").select("*"),
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle()
    ]);

  const phaseRows: Phase[] = phases ?? [];
  const phaseSupplementRows: PhaseSupplement[] = phaseSupplements ?? [];
  const supplementRows: SupplementCatalog[] = supplements ?? [];
  const settingsRow = (settingsData ?? null) as UserSettings | null;
  const supplementMap = new Map(supplementRows.map((item) => [item.id, item]));

  return {
    phases: phaseRows.map((phase) => ({
      ...phase,
      supplements: phaseSupplementRows
        .filter((item) => item.phase_id === phase.id)
        .map((item) => ({
          ...item,
          supplement: supplementMap.get(item.supplement_id) ?? null
        }))
    })),
    currentPhaseSlug: settingsRow?.current_phase_slug ?? null
  };
}

export async function getWeeklyReviewData(
  supabase: TypedSupabase,
  userId: string
): Promise<WeeklyReviewData> {
  const { data: profileTimezoneData } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const profileTimezoneRow = (profileTimezoneData ?? null) as Pick<Profile, "timezone"> | null;
  const timezone = profileTimezoneRow?.timezone ?? "Europe/Berlin";

  const today = toDateInputValue(new Date(), timezone);
  const currentWeekStart = startOfWeekDateKey(today, 1);
  const previousWeekStart = shiftDateKey(currentWeekStart, -7);
  const currentWeekEnd = endOfWeekDateKey(today, 1);

  const [
    { data: entries },
    { data: supplementLogs },
    { data: checklistTemplates },
    { data: supplementCatalog },
    { data: userSupplements }
  ] = await Promise.all([
    supabase
      .from("daily_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("entry_date", previousWeekStart)
      .lte("entry_date", currentWeekEnd)
      .order("entry_date", { ascending: true }),
    supabase
      .from("supplement_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("log_date", currentWeekStart)
      .lte("log_date", currentWeekEnd),
    supabase.from("checklist_templates").select("*"),
    supabase.from("supplement_catalog").select("id, slug, is_default_active"),
    supabase.from("user_supplements").select("supplement_id, active").eq("user_id", userId)
  ]);

  const entryRows: DailyEntry[] = entries ?? [];
  const supplementLogRows: SupplementLog[] = supplementLogs ?? [];
  const checklistTemplateRows: ChecklistTemplate[] = checklistTemplates ?? [];
  const supplementCatalogRows: SupplementCatalogSummary[] = supplementCatalog ?? [];
  const userSupplementRows: UserSupplementStatus[] = userSupplements ?? [];

  const currentEntries = entryRows.filter(
    (entry) => entry.entry_date >= currentWeekStart
  );
  const previousEntries = entryRows.filter(
    (entry) =>
      entry.entry_date >= previousWeekStart &&
      entry.entry_date < currentWeekStart
  );

  const averageWeight = computeWeeklyWeightAverage(currentEntries);
  const previousWeight = computeWeeklyWeightAverage(previousEntries);
  const weightChange =
    averageWeight !== null && previousWeight !== null ? averageWeight - previousWeight : null;
  const cravingsAverage = average(currentEntries.map((entry) => entry.cravings_score));
  const sleepAverage = average(currentEntries.map((entry) => entry.sleep_score));
  const energyAverage = average(currentEntries.map((entry) => entry.energy_score));
  const elapsedDaysInWeek = differenceInDateKeys(today, currentWeekStart) + 1;
  const supplementLogMeta = buildSupplementLogMeta(supplementCatalogRows, userSupplementRows);
  const trackedSupplementIds = getTrackedSupplementIds(
    checklistTemplateRows,
    supplementLogMeta
  );
  const trackedSupplementIdSet = new Set(trackedSupplementIds);
  const supplementCompliance = computeChecklistCompletionFromCount(
    supplementLogRows.filter(
      (item) => item.completed && trackedSupplementIdSet.has(item.supplement_id)
    ).length,
    trackedSupplementIds.length * elapsedDaysInWeek
  );

  return {
    currentWeekStart,
    averageWeight,
    weightChange,
    cravingsTrend: computeTrendDelta(
      currentEntries.map((entry) => entry.cravings_score),
      previousEntries.map((entry) => entry.cravings_score)
    ),
    energyTrend: computeTrendDelta(
      currentEntries.map((entry) => entry.energy_score),
      previousEntries.map((entry) => entry.energy_score)
    ),
    trainingSessions: currentEntries.filter((entry) => entry.training_completed).length,
    supplementCompliance,
    suggestions: buildWeeklySuggestions({
      averageWeightChange: weightChange,
      cravingsAverage,
      sleepAverage,
      energyAverage
    }),
    chartSeries: toChartSeries(currentEntries)
  };
}

export async function getWeeklyOverview(
  supabase: TypedSupabase,
  userId: string,
  options?: {
    weekStart?: string;
    timezone?: string;
  }
): Promise<WeeklyOverview> {
  const timezone =
    options?.timezone ??
    (
      (
        (
          await supabase
            .from("profiles")
            .select("timezone")
            .eq("id", userId)
            .maybeSingle()
        ).data ?? null
      ) as Pick<Profile, "timezone"> | null
    )?.timezone ??
    "Europe/Berlin";
  const fallbackDate = toDateInputValue(new Date(), timezone);
  const baseDate =
    options?.weekStart && isDateKey(options.weekStart)
      ? options.weekStart
      : fallbackDate;
  const start = startOfWeekDateKey(baseDate, 1);
  const end = endOfWeekDateKey(baseDate, 1);
  const dates = Array.from({ length: 7 }, (_, index) => shiftDateKey(start, index));

  const [
    { data: entries },
    { data: nutritionEntries },
    { data: workouts }
  ] = await Promise.all([
    supabase
      .from("daily_entries")
      .select(
        "entry_date, calories, protein_g, carbs_g, fat_g, nutrition_source, training_completed, training_source"
      )
      .eq("user_id", userId)
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("entry_date", { ascending: true }),
    supabase
      .from("source_nutrition_entries")
      .select("entry_date, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .eq("provider", "fatsecret")
      .gte("entry_date", start)
      .lte("entry_date", end),
    supabase
      .from("source_workouts")
      .select("workout_date, duration_minutes, raw_payload")
      .eq("user_id", userId)
      .eq("provider", "hevy")
      .gte("workout_date", start)
      .lte("workout_date", end)
      .order("workout_date", { ascending: true })
  ]);

  const entryRows = (entries ?? []) as Array<
    Pick<
      DailyEntry,
      | "entry_date"
      | "calories"
      | "protein_g"
      | "carbs_g"
      | "fat_g"
      | "nutrition_source"
      | "training_completed"
      | "training_source"
    >
  >;
  const nutritionRows = (nutritionEntries ?? []) as Array<
    Pick<
      SourceNutritionEntry,
      "entry_date" | "calories" | "protein_g" | "carbs_g" | "fat_g"
    >
  >;
  const workoutRows = (workouts ?? []) as Array<
    Pick<SourceWorkout, "workout_date" | "duration_minutes" | "raw_payload">
  >;

  const entryMap = new Map(entryRows.map((entry) => [entry.entry_date, entry]));
  const nutritionRowsByDate = new Map<string, typeof nutritionRows>();
  for (const row of nutritionRows) {
    const rowsForDate = nutritionRowsByDate.get(row.entry_date) ?? [];
    rowsForDate.push(row);
    nutritionRowsByDate.set(row.entry_date, rowsForDate);
  }
  const workoutRowsByDate = new Map<string, typeof workoutRows>();
  for (const row of workoutRows) {
    const rowsForDate = workoutRowsByDate.get(row.workout_date) ?? [];
    rowsForDate.push(row);
    workoutRowsByDate.set(row.workout_date, rowsForDate);
  }

  const nutritionDays: WeeklyDayNutrition[] = dates.map((date) => {
    const entry = entryMap.get(date) ?? null;
    const sourceRowsForDate = nutritionRowsByDate.get(date) ?? [];
    const derivedTotals = sumNutritionRows(sourceRowsForDate);
    const hasSourceNutrition = sourceRowsForDate.length > 0;

    return {
      date,
      calories: entry?.calories ?? derivedTotals.calories,
      protein: entry?.protein_g ?? derivedTotals.protein,
      carbs: entry?.carbs_g ?? derivedTotals.carbs,
      fat: entry?.fat_g ?? derivedTotals.fat,
      source: resolveWeeklyNutritionSource(entry ?? null, hasSourceNutrition)
    };
  });

  const trainingDays: WeeklyTrainingDay[] = dates.map((date) => {
    const entry = entryMap.get(date) ?? null;
    const sourceRowsForDate = workoutRowsByDate.get(date) ?? [];
    const workoutSummaries = sourceRowsForDate.map((row) => summarizeWorkoutRawPayload(row.raw_payload));
    const workoutsCompleted = sourceRowsForDate.length;
    const workoutsWithKnownVolume = workoutSummaries.filter(
      (summary) => summary.totalVolumeKg !== null
    ).length;
    const hasSyncedWorkout = workoutsCompleted > 0;
    const durationMinutes = roundToSingleNullableNumber(
      sourceRowsForDate.reduce((sum, row) => sum + (row.duration_minutes ?? 0), 0),
      sourceRowsForDate.some((row) => row.duration_minutes !== null && row.duration_minutes !== undefined)
    );
    const volumeKg = roundToSingleNullableNumber(
      workoutSummaries.reduce((sum, summary) => sum + (summary.totalVolumeKg ?? 0), 0),
      workoutSummaries.some((summary) => summary.totalVolumeKg !== null)
    );

    return {
      active: (entry?.training_completed ?? false) || hasSyncedWorkout,
      bestEffort: hasSyncedWorkout
        ? workoutSummaries.some((summary) => !summary.hasStructuredSummary)
        : undefined,
      date,
      durationMinutes,
      source: resolveWeeklyTrainingSource(entry ?? null, hasSyncedWorkout),
      volumeKg,
      workoutsCompleted,
      workoutsWithKnownVolume
    };
  });

  const sleepDays: WeeklySleepDay[] = dates.map((date) => ({
    date,
    sleepMinutes: null,
    source: "none"
  }));

  return {
    range: {
      start,
      end
    },
    nutrition: {
      averages: {
        calories: averageNullable(nutritionDays.map((day) => day.calories)),
        protein: averageNullable(nutritionDays.map((day) => day.protein)),
        carbs: averageNullable(nutritionDays.map((day) => day.carbs)),
        fat: averageNullable(nutritionDays.map((day) => day.fat))
      },
      days: nutritionDays,
      source: collapseWeeklySources(nutritionDays.map((day) => day.source)),
      totals: {
        calories: sumNullableNumbers(nutritionDays.map((day) => day.calories)),
        protein: sumNullableNumbers(nutritionDays.map((day) => day.protein)),
        carbs: sumNullableNumbers(nutritionDays.map((day) => day.carbs)),
        fat: sumNullableNumbers(nutritionDays.map((day) => day.fat))
      }
    },
    training: {
      bestEffort: trainingDays.some((day) => day.bestEffort),
      days: trainingDays,
      source: collapseWeeklySources(trainingDays.map((day) => day.source)),
      summary: {
        activeDays: trainingDays.filter((day) => day.active).length,
        durationMinutes: sumNullableNumbers(trainingDays.map((day) => day.durationMinutes)),
        volumeKg: sumNullableNumbers(trainingDays.map((day) => day.volumeKg)),
        workoutsCompleted: trainingDays.reduce((sum, day) => sum + day.workoutsCompleted, 0)
      }
    },
    sleep: {
      days: sleepDays,
      source: "none",
      summary: {
        averageSleepMinutes: null,
        totalSleepMinutes: 0,
        trackedDays: 0
      }
    }
  };
}

export async function getReviewPageData(
  supabase: TypedSupabase,
  userId: string
): Promise<ReviewPageData> {
  const { data: profileTimezoneData } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const profileTimezoneRow = (profileTimezoneData ?? null) as Pick<Profile, "timezone"> | null;
  const timezone = profileTimezoneRow?.timezone ?? "Europe/Berlin";

  const today = toDateInputValue(new Date(), timezone);
  const currentWeekStart = startOfWeekDateKey(today, 1);
  const currentWeekEnd = endOfWeekDateKey(today, 1);

  const { data: entries } = await supabase
    .from("daily_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("entry_date", currentWeekStart)
    .lte("entry_date", currentWeekEnd)
    .order("entry_date", { ascending: true });

  const entryRows: DailyEntry[] = entries ?? [];
  const entryMap = new Map(entryRows.map((entry) => [entry.entry_date, entry]));
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDateKey(currentWeekStart, index));

  return {
    currentWeekEnd,
    currentWeekStart,
    days: weekDates.map((date) => {
      const entry = entryMap.get(date) ?? null;

      return {
        calories: entry?.calories ?? null,
        cravings: entry?.cravings_score ?? null,
        date,
        energy: entry?.energy_score ?? null,
        sleep: entry?.sleep_score ?? null,
        trainingCompleted: entry?.training_completed ?? false
      };
    }),
    summary: {
      caloriesAverage: average(entryRows.map((entry) => entry.calories)),
      caloriesLoggedDays: entryRows.filter((entry) => entry.calories !== null).length,
      cravingsAverage: average(entryRows.map((entry) => entry.cravings_score)),
      energyAverage: average(entryRows.map((entry) => entry.energy_score)),
      sleepAverage: average(entryRows.map((entry) => entry.sleep_score)),
      trackedDays: entryRows.length,
      trainingDays: entryRows.filter((entry) => entry.training_completed).length
    }
  };
}

export async function getSettingsPageData(
  supabase: TypedSupabase,
  userId: string
): Promise<SettingsPageData> {
  const [{ data: settings }, { data: phases }, { data: supplements }, { data: userSupplements }] =
    await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("phases").select("*").order("sort_order", { ascending: true }),
      supabase.from("supplement_catalog").select("*").order("sort_order", { ascending: true }),
      supabase.from("user_supplements").select("*").eq("user_id", userId)
    ]);

  const settingsRow: UserSettings | null = settings ?? null;
  const phaseRows: Phase[] = phases ?? [];
  const supplementRows: SupplementCatalog[] = supplements ?? [];
  const userSupplementRows: UserSupplement[] = userSupplements ?? [];
  const userStateMap = new Map(userSupplementRows.map((item) => [item.supplement_id, item]));

  return {
    settings: settingsRow,
    phases: phaseRows,
    supplements: supplementRows.map((supplement) => ({
      ...supplement,
      active: userStateMap.get(supplement.id)?.active ?? supplement.is_default_active,
      userState: userStateMap.get(supplement.id) ?? null
    }))
  };
}

export function complianceLabel(value: number) {
  if (value >= 85) {
    return "Sehr stark";
  }
  if (value >= 65) {
    return "Solide";
  }
  return "Verbesserbar";
}

export function currentPhaseLabel(currentPhase: Phase | null) {
  return currentPhase ? currentPhase.name : "Keine Phase gesetzt";
}

export function getPhaseDurationLabel(
  settings: UserSettings | null,
  currentPhase: Phase | null,
  timezone?: string | null
) {
  if (!currentPhase || !settings?.phase_started_at) {
    return null;
  }

  const activeDays = daysSince(settings.phase_started_at, timezone);
  return `seit ${activeDays} ${activeDays === 1 ? "Tag" : "Tagen"}`;
}

export function reviewComparisonLabel(value: number | null, unit = "") {
  if (value === null) {
    return "Keine Daten";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}${unit}`;
}

export function reviewTrainingHint(count: number) {
  if (count >= 4) {
    return "Starke Compliance";
  }
  if (count >= 2) {
    return "Solide Woche";
  }
  return "Mehr Struktur einplanen";
}

function computeTrainingComplianceAgainstPlan(
  entries: DailyEntry[],
  trainingDays: number[],
  referenceDateKey: string
) {
  if (!trainingDays.length) {
    return 0;
  }

  const completedTrainingCount = entries.filter((entry) => entry.training_completed).length;
  const plannedTrainingCount = Array.from({ length: 7 }, (_, index) =>
    getDateKeyDayIndex(shiftDateKey(referenceDateKey, -index))
  ).filter((dayIndex) => trainingDays.includes(dayIndex)).length;

  return computeChecklistCompletionFromCount(
    completedTrainingCount,
    plannedTrainingCount || 1
  );
}

function countMissingCoreMetrics(entry: DailyEntry | null) {
  if (!entry) {
    return 5;
  }

  return [
    entry.body_weight,
    entry.sleep_score,
    entry.energy_score,
    entry.cravings_score,
    entry.calories
  ].filter((value) => value === null || value === undefined).length;
}

function buildDashboardNextActions({
  currentPhase,
  plannedTrainingToday,
  todayChecklistCompletion,
  todayEntry,
  todaySupplementCompletion,
  trackedSupplementCount
}: {
  currentPhase: Phase | null;
  plannedTrainingToday: boolean;
  todayChecklistCompletion: number;
  todayEntry: DailyEntry | null;
  todaySupplementCompletion: number;
  trackedSupplementCount: number;
}) {
  const actions: DashboardData["nextActions"] = [];
  const missingCoreMetrics = countMissingCoreMetrics(todayEntry);

  if (!todayEntry) {
    actions.push({
      ctaLabel: "Daily öffnen",
      description: "Gewicht, Scores und Kalorien einmal sauber eintragen, dann steht der Tag.",
      href: "/daily" as Route,
      title: "Daily Capture starten"
    });
  } else if (missingCoreMetrics > 0) {
    actions.push({
      ctaLabel: "Eintrag vervollständigen",
      description: `${missingCoreMetrics} Kernwerte fehlen noch für einen vollständigen Tag.`,
      href: "/daily" as Route,
      title: "Metrics fertig machen"
    });
  }

  if (todayChecklistCompletion < 100) {
    actions.push({
      ctaLabel: "Checklisten abhaken",
      description: `${100 - todayChecklistCompletion}% des Tages-Setups sind noch offen.`,
      href: "/daily" as Route,
      title: "Heute noch offen"
    });
  }

  if (plannedTrainingToday && !todayEntry?.training_completed) {
    actions.push({
      ctaLabel: "Training loggen",
      description: "Heute ist ein geplanter Trainingstag. Haken direkt im Daily setzen.",
      href: "/daily" as Route,
      title: "Training bestätigen"
    });
  }

  if (!currentPhase) {
    actions.push({
      ctaLabel: "Phase wählen",
      description: "Ohne aktive Phase fehlen Kontext und Framing im Dashboard und im App-Shell-Header.",
      href: "/settings/phases" as Route,
      title: "Phase festlegen"
    });
  }

  if (trackedSupplementCount > 0 && todaySupplementCompletion < 100 && actions.length < 3) {
    actions.push({
      ctaLabel: "Stack prüfen",
      description: "Supplement-Logs hängen an den Checklisten. Ein kurzer Check hält die Compliance sauber.",
      href: "/daily" as Route,
      title: "Supplements abschließen"
    });
  }

  const openLoopCount = actions.length;

  if (!actions.length) {
    actions.push({
      ctaLabel: "Wochenreview öffnen",
      description: "Heute ist sauber erfasst. Der nächste sinnvolle Schritt ist der Blick auf den Wochenverlauf.",
      href: "/weekly-review" as Route,
      title: "Alles im grünen Bereich"
    });
  }

  return {
    actions: actions.slice(0, 3),
    openLoopCount
  };
}

function buildSupplementLogMeta(
  supplementCatalog: Array<
    Pick<SupplementCatalog, "id" | "slug" | "is_default_active">
  >,
  userSupplements: Array<Pick<UserSupplement, "supplement_id" | "active">>
) {
  const supplementStateMap = new Map(
    userSupplements.map((supplement) => [supplement.supplement_id, supplement])
  );

  return supplementCatalog.map((supplement) => ({
    active:
      supplementStateMap.get(supplement.id)?.active ?? supplement.is_default_active,
    id: supplement.id,
    slug: supplement.slug
  }));
}

function isJsonRecord(value: Json | undefined): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  const parsedValue = Number(compactValue.replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function summarizeWorkoutRawPayload(rawPayload: Json) {
  if (!isJsonRecord(rawPayload) || !Array.isArray(rawPayload.rows)) {
    return {
      exerciseCount: 0,
      hasStructuredSummary: false,
      totalVolumeKg: null
    };
  }

  const exerciseTitles = new Set<string>();
  let totalVolumeKg = 0;
  let hasVolume = false;

  for (const row of rawPayload.rows) {
    if (!isJsonRecord(row)) {
      continue;
    }

    const exerciseTitle =
      typeof row.exercise_title === "string" && row.exercise_title.trim()
        ? row.exercise_title.trim()
        : null;

    if (exerciseTitle) {
      exerciseTitles.add(exerciseTitle);
    }

    const reps = parseLooseNumber(row.reps);
    const weightKg = parseLooseNumber(row.weight_kg);

    if (reps !== null && reps > 0 && weightKg !== null && weightKg > 0) {
      totalVolumeKg += reps * weightKg;
      hasVolume = true;
    }
  }

  return {
    exerciseCount: exerciseTitles.size,
    hasStructuredSummary: true,
    totalVolumeKg: roundToSingleNullableNumber(totalVolumeKg, hasVolume)
  };
}

function roundToSingleNullableNumber(value: number, enabled: boolean) {
  if (!enabled) {
    return null;
  }

  return Number(value.toFixed(1));
}

function resolveNutritionSourceStatus(
  entry: DailyEntry | null,
  hasSyncedMeals: boolean
): DailySourceStatus {
  if (entry?.nutrition_source === "manual") {
    return "manual";
  }

  if (entry?.nutrition_source === "fatsecret") {
    return "synced";
  }

  if (hasSyncedMeals) {
    return "synced";
  }

  if (
    (entry?.calories !== null && entry?.calories !== undefined) ||
    (entry?.protein_g !== null && entry?.protein_g !== undefined) ||
    (entry?.carbs_g !== null && entry?.carbs_g !== undefined) ||
    (entry?.fat_g !== null && entry?.fat_g !== undefined)
  ) {
    return "manual";
  }

  return "missing";
}

function resolveWeeklyNutritionSource(
  entry: Pick<
    DailyEntry,
    "calories" | "protein_g" | "carbs_g" | "fat_g" | "nutrition_source"
  > | null,
  hasSourceNutrition: boolean
): WeeklySourceKind {
  if (entry?.nutrition_source === "manual") {
    return "manual";
  }

  if (entry?.nutrition_source === "fatsecret") {
    return "synced";
  }

  if (hasSourceNutrition) {
    return "derived";
  }

  // If nutrition_source is unset, no source rows remain, and daily macros exist,
  // Weekly falls back to manual because true historical provenance cannot be reconstructed.
  if (
    (entry?.calories !== null && entry?.calories !== undefined) ||
    (entry?.protein_g !== null && entry?.protein_g !== undefined) ||
    (entry?.carbs_g !== null && entry?.carbs_g !== undefined) ||
    (entry?.fat_g !== null && entry?.fat_g !== undefined)
  ) {
    return "manual";
  }

  return "none";
}

function resolveTrainingSourceStatus(
  entry: DailyEntry | null,
  hasSyncedWorkout: boolean
): DailySourceStatus {
  if (entry?.training_source === "hevy") {
    return "synced";
  }

  // Weekly mirrors Daily completion semantics: a true training_completed flag with no explicit
  // source still resolves to manual, even if synced workout rows also exist.
  if (entry?.training_source === "manual" || entry?.training_completed) {
    return "manual";
  }

  if (hasSyncedWorkout) {
    return "synced";
  }

  return "missing";
}

function resolveWeeklyTrainingSource(
  entry: Pick<DailyEntry, "training_completed" | "training_source"> | null,
  hasSyncedWorkout: boolean
): WeeklySourceKind {
  if (entry?.training_source === "hevy") {
    return "synced";
  }

  if (entry?.training_source === "manual" || entry?.training_completed) {
    return "manual";
  }

  if (hasSyncedWorkout) {
    return "synced";
  }

  return "none";
}

function collapseWeeklySources(sources: WeeklySourceKind[]): WeeklySourceKind {
  const nonNoneSources = Array.from(new Set(sources.filter((source) => source !== "none")));

  if (!nonNoneSources.length) {
    return "none";
  }

  return nonNoneSources.length === 1 ? nonNoneSources[0] : "mixed";
}

function sumNullableNumbers(values: Array<number | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const presentValues = values.filter((value): value is number => value !== null && value !== undefined);

  if (!presentValues.length) {
    return null;
  }

  return roundToSingleNullableNumber(
    presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length,
    true
  );
}

function sumNutritionRows(
  rows: Array<
    Pick<SourceNutritionEntry, "calories" | "protein_g" | "carbs_g" | "fat_g">
  >
) {
  return {
    calories: roundToSingleNullableNumber(
      rows.reduce((sum, row) => sum + (row.calories ?? 0), 0),
      rows.some((row) => row.calories !== null && row.calories !== undefined)
    ),
    carbs: roundToSingleNullableNumber(
      rows.reduce((sum, row) => sum + (row.carbs_g ?? 0), 0),
      rows.some((row) => row.carbs_g !== null && row.carbs_g !== undefined)
    ),
    fat: roundToSingleNullableNumber(
      rows.reduce((sum, row) => sum + (row.fat_g ?? 0), 0),
      rows.some((row) => row.fat_g !== null && row.fat_g !== undefined)
    ),
    protein: roundToSingleNullableNumber(
      rows.reduce((sum, row) => sum + (row.protein_g ?? 0), 0),
      rows.some((row) => row.protein_g !== null && row.protein_g !== undefined)
    )
  };
}

function mapFatSecretMealTypeToTodoTaskIds(mealType: string) {
  switch (mealType) {
    case "breakfast":
      return ["breakfast"];
    case "lunch":
      return ["lunch"];
    case "dinner":
      return ["dinner"];
    default:
      return [];
  }
}
