"use client";

import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Copy } from "lucide-react";

import { DailyChecklistPanel } from "@/components/daily/daily-checklist-panel";
import { DailyMetricsPanel } from "@/components/daily/daily-metrics-panel";
import { DailySyncOverview } from "@/components/daily/daily-sync-overview";
import { DailyTodoList } from "@/components/daily/daily-todo-list";
import { HevyCsvUpload } from "@/components/hevy/hevy-csv-upload";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { useAutosave } from "@/lib/autosave/use-autosave";
import type { DailyPageData } from "@/lib/data";
import {
  type DailyChecklistItemMutationResult,
  type DailyTrackingMutationResult,
  saveDailyEntryMutation,
  saveDailyChecklistGroupMutation,
  saveDailyChecklistItemMutation,
  saveDailyTrackingMutation
} from "@/lib/mutations";
import { getTrackedSupplementSections } from "@/lib/supplement-tracking";
import {
  getAuthenticatedClientContext,
  notifyAppDataMutation,
  getOfflineMessage,
  isBrowserOffline
} from "@/lib/supabase/client";
import {
  cn,
  getDateKeyDayIndex,
  numberOrNull,
  percentage,
  shiftDateKey,
  toDateInputValue
} from "@/lib/utils";
import type { TableInsert, TableRow } from "@/types/supabase";

type DailyTrackerFormProps = DailyPageData;
type DailyEntryInsert = TableInsert<"daily_entries">;
type DailyEntryRow = TableRow<"daily_entries">;
type DailyChecklistRow = TableRow<"daily_checklists">;
type FormField = keyof FormState;

type FormState = {
  body_weight: string;
  sleep_score: number;
  energy_score: number;
  cravings_score: number;
  training_completed: boolean;
  calories: string;
  notes: string;
  day_type: "training" | "rest";
};

type StatusState = {
  tone: "success" | "warning" | "danger" | "muted";
  message: string | null;
};

type PersistedEntryContext = {
  bodyWeight: number | null;
  cravingsScore: number | null;
  calories: number | null;
  dayType: "training" | "rest" | null;
  energyScore: number | null;
  nutritionSource: string | null;
  notes: string | null;
  sleepScore: number | null;
  trainingCompleted: boolean;
  trainingSource: string | null;
};

type ActiveSection = "metrics" | "checklists";
type ChecklistTemplateWithCompletion = DailyPageData["checklistTemplates"][number] & {
  completed: boolean;
};

const SUPPLEMENT_TODO_TASKS = {
  evening: "evening-supplements",
  morning: "morning-supplements"
} as const;

const SUPPLEMENT_TODO_SECTIONS_BY_TASK_ID = Object.fromEntries(
  Object.entries(SUPPLEMENT_TODO_TASKS).map(([section, taskId]) => [taskId, section])
) as Record<string, string>;
const ALL_FORM_FIELDS: FormField[] = [
  "body_weight",
  "sleep_score",
  "energy_score",
  "cravings_score",
  "training_completed",
  "calories",
  "notes",
  "day_type"
];

function withMutationDetail(message: string, detail?: string | null) {
  return detail ? `${message} Details: ${detail}` : message;
}

function resolveRuntimeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function resolveDailySaveStatus(result: DailyTrackingMutationResult): StatusState {
  if (result.status === "success") {
    return {
      tone: "success",
      message: "Tages-Tracking vollständig gespeichert."
    };
  }

  if (result.entrySaved && !result.checklistSaved) {
    return {
      tone: "warning",
      message: withMutationDetail(
        "Tagesdaten wurden gespeichert, aber Checklisten nicht. Bitte erneut speichern, damit der Tag konsistent bleibt.",
        result.checklistError
      )
    };
  }

  if (result.entrySaved && result.checklistSaved && !result.supplementLogsSaved) {
    return {
      tone: "warning",
      message: withMutationDetail(
        "Tagesdaten und Checklisten wurden gespeichert. Supplement-Logs konnten noch nicht synchronisiert werden.",
        result.supplementLogError
      )
    };
  }

  return {
    tone: "danger",
    message: withMutationDetail(
      "Tages-Tracking konnte nicht gespeichert werden.",
      result.entryError
    )
  };
}

function resolveChecklistSaveStatus(result: DailyChecklistItemMutationResult): StatusState {
  if (result.status === "success") {
    return {
      tone: "success",
      message: "Checklist gespeichert."
    };
  }

  if (result.checklistSaved && !result.supplementLogsSaved) {
    return {
      tone: "warning",
      message: withMutationDetail(
        "Checklist gespeichert, aber Supplement-Logs konnten noch nicht synchronisiert werden.",
        result.supplementLogError
      )
    };
  }

  return {
    tone: "danger",
    message: withMutationDetail(
      "Checklist konnte nicht gespeichert werden.",
      result.checklistError
    )
  };
}

function buildDailyRoute(date: string, timezone?: string | null): Route {
  if (date === toDateInputValue(new Date(), timezone)) {
    return "/daily";
  }

  return `/daily?date=${date}` as Route;
}

function resolveSuggestedDayType(data: DailyPageData) {
  const trainingDays = data.settings?.training_days ?? [1, 3, 5];
  const dayIndex = getDateKeyDayIndex(data.selectedDate);
  return trainingDays.includes(dayIndex) ? "training" : "rest";
}

function resolveTemplateForDayType(data: DailyPageData, dayType: "training" | "rest") {
  return data.dayTemplates.find((template) => template.day_type === dayType) ?? data.dayTemplates[0];
}

function buildChecklistState(data: DailyPageData) {
  return Object.fromEntries(
    data.checklistTemplates.map((template) => [
      template.template_key,
      data.checklistStates.find((state) => state.template_key === template.template_key)
        ?.completed ?? false
    ])
  );
}

function createInitialState(data: DailyPageData): FormState {
  const suggestedDayType = resolveSuggestedDayType(data);
  const dayType = data.entry?.day_type ?? suggestedDayType;
  const template = resolveTemplateForDayType(data, dayType);

  return {
    body_weight: data.entry?.body_weight?.toString() ?? "",
    sleep_score: data.entry?.sleep_score ?? 7,
    energy_score: data.entry?.energy_score ?? 7,
    cravings_score: data.entry?.cravings_score ?? 4,
    training_completed: data.entry?.training_completed ?? false,
    calories: data.entry?.calories?.toString() ?? template?.calories?.toString() ?? "",
    notes: data.entry?.notes ?? template?.notes ?? "",
    day_type: dayType
  };
}

function buildDailyNutritionMutationPayload({
  currentCalories,
  existingCalories,
  existingNutritionSource
}: {
  currentCalories: number | null;
  existingCalories: number | null;
  existingNutritionSource: string | null;
}) {
  if (existingNutritionSource === "fatsecret") {
    if (currentCalories === existingCalories) {
      return {
        calories: currentCalories,
        nutrition_source: "fatsecret" as const
      };
    }

    if (currentCalories === null) {
      return {
        calories: null,
        carbs_g: null,
        fat_g: null,
        nutrition_source: null,
        protein_g: null
      };
    }

    return {
      calories: currentCalories,
      carbs_g: null,
      fat_g: null,
      nutrition_source: "manual" as const,
      protein_g: null
    };
  }

  if (currentCalories === null) {
    return {
      calories: null,
      carbs_g: null,
      fat_g: null,
      nutrition_source: null,
      protein_g: null
    };
  }

  return {
    calories: currentCalories,
    nutrition_source: "manual" as const
  };
}

function normalizeExistingTrainingSource(
  existingTrainingCompleted: boolean,
  existingTrainingSource: string | null
) {
  if (existingTrainingSource) {
    return existingTrainingSource;
  }

  return existingTrainingCompleted ? "manual" : null;
}

function buildDailyTrainingMutationPayload({
  currentTrainingCompleted,
  existingTrainingCompleted,
  existingTrainingSource
}: {
  currentTrainingCompleted: boolean;
  existingTrainingCompleted: boolean;
  existingTrainingSource: string | null;
}) {
  const normalizedExistingTrainingSource = normalizeExistingTrainingSource(
    existingTrainingCompleted,
    existingTrainingSource
  );

  if (normalizedExistingTrainingSource === "hevy") {
    if (currentTrainingCompleted === existingTrainingCompleted) {
      return {
        training_completed: currentTrainingCompleted,
        training_source: "hevy"
      };
    }

    return {
      training_completed: currentTrainingCompleted,
      training_source: "manual"
    };
  }

  if (normalizedExistingTrainingSource === "manual") {
    return {
      training_completed: currentTrainingCompleted,
      training_source: "manual"
    };
  }

  if (currentTrainingCompleted === existingTrainingCompleted) {
    return {
      training_completed: currentTrainingCompleted,
      training_source: normalizedExistingTrainingSource
    };
  }

  return {
    training_completed: currentTrainingCompleted,
    training_source: currentTrainingCompleted ? "manual" : null
  };
}

function createPersistedEntryContext(entry: DailyEntryRow | null): PersistedEntryContext {
  return {
    bodyWeight: entry?.body_weight ?? null,
    cravingsScore: entry?.cravings_score ?? null,
    calories: entry?.calories ?? null,
    dayType: entry?.day_type ?? null,
    energyScore: entry?.energy_score ?? null,
    nutritionSource: entry?.nutrition_source ?? null,
    notes: entry?.notes ?? null,
    sleepScore: entry?.sleep_score ?? null,
    trainingCompleted: entry?.training_completed ?? false,
    trainingSource: entry?.training_source ?? null
  };
}

export function DailyTrackerForm(props: DailyTrackerFormProps) {
  const router = useRouter();
  const checklistTemplates = props.checklistTemplates;
  const [activeSection, setActiveSection] = useState<ActiveSection>("metrics");
  const [selectedDate, setSelectedDate] = useState(props.selectedDate);
  const [form, setForm] = useState<FormState>(() => createInitialState(props));
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => buildChecklistState(props));
  const [status, setStatus] = useState<StatusState>({ tone: "muted", message: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [syncingChecklistKey, setSyncingChecklistKey] = useState<string | null>(null);
  const [syncingSupplementTaskId, setSyncingSupplementTaskId] = useState<string | null>(null);
  const checklistStateRef = useRef<Record<string, boolean>>(buildChecklistState(props));
  const checklistRequestVersionRef = useRef<Record<string, number>>({});
  const supplementTaskRequestVersionRef = useRef<Record<string, number>>({});
  const checklistSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingAutosaveResetRef = useRef<FormState | null>(null);
  const touchedFieldsRef = useRef<Set<FormField>>(new Set());
  const activeEntryDate = props.selectedDate;

  useEffect(() => {
    setSelectedDate(props.selectedDate);
    const nextFormState = createInitialState(props);
    pendingAutosaveResetRef.current = nextFormState;
    setForm(nextFormState);
    const nextChecklistState = buildChecklistState(props);
    checklistStateRef.current = nextChecklistState;
    setChecklist(nextChecklistState);
    touchedFieldsRef.current = new Set();
    setActiveSection("metrics");
  }, [props]);

  useEffect(() => {
    touchedFieldsRef.current = new Set();
  }, [activeEntryDate]);

  const groupedChecklist = useMemo(() => {
    return checklistTemplates.reduce<Record<string, ChecklistTemplateWithCompletion[]>>(
      (accumulator, template) => {
      accumulator[template.section] ??= [];
      accumulator[template.section].push({
        ...template,
        completed: checklist[template.template_key] ?? false
      });
      return accumulator;
      },
      {}
    );
  }, [checklist, checklistTemplates]);

  const compliance = useMemo(() => {
    const values = Object.values(checklist);
    const completed = values.filter(Boolean).length;
    return percentage(completed, values.length || 1);
  }, [checklist]);

  const supplementTodoTasks = useMemo(() => {
    return getTrackedSupplementSections(checklistTemplates, props.supplementLogMeta)
      .flatMap((section) => {
        const taskId = SUPPLEMENT_TODO_TASKS[section.section as keyof typeof SUPPLEMENT_TODO_TASKS];

        if (!taskId) {
          return [];
        }

        return [
          {
            checked: section.templateKeys.every(
              (templateKey) => checklist[templateKey] ?? false
            ),
            count: section.supplementIds.length,
            pending: syncingSupplementTaskId === taskId,
            taskId,
            templateKeys: section.templateKeys
          } satisfies {
          checked: boolean;
          count: number;
          pending: boolean;
          taskId: string;
          templateKeys: string[];
            }
        ];
      });
  }, [checklist, checklistTemplates, props.supplementLogMeta, syncingSupplementTaskId]);

  const supplementTodoTaskStates = useMemo(
    () =>
      Object.fromEntries(
        supplementTodoTasks.map((task) => [
          task.taskId,
          {
            checked: task.checked,
            count: task.count,
            pending: task.pending
          }
        ])
      ),
    [supplementTodoTasks]
  );

  async function navigateToDate(date: string) {
    if (!date) {
      return;
    }

    if (date === activeEntryDate) {
      setSelectedDate(date);
      return;
    }

    const saved = await autosave.flush();

    if (!saved) {
      setStatus({
        tone: "danger",
        message: "Bitte speichere den aktuellen Tag zuerst, bevor du das Datum wechselst."
      });
      setSelectedDate(activeEntryDate);
      return;
    }

    setSelectedDate(date);
    router.replace(buildDailyRoute(date, props.timezone));
  }

  function isLatestChecklistRequest(templateKey: string, requestVersion: number) {
    return checklistRequestVersionRef.current[templateKey] === requestVersion;
  }

  function isLatestSupplementTaskRequest(taskId: string, requestVersion: number) {
    return supplementTaskRequestVersionRef.current[taskId] === requestVersion;
  }

  function updateChecklistState(nextChecklistState: Record<string, boolean>) {
    checklistStateRef.current = nextChecklistState;
    setChecklist(nextChecklistState);
  }

  function revertChecklistValue(templateKey: string, value: boolean) {
    updateChecklistState({
      ...checklistStateRef.current,
      [templateKey]: value
    });
  }

  function revertChecklistValues(values: Record<string, boolean>) {
    updateChecklistState({
      ...checklistStateRef.current,
      ...values
    });
  }

  function enqueueChecklistSync(task: () => Promise<void>) {
    const run = checklistSyncQueueRef.current.then(task, task);
    checklistSyncQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function markFieldTouched(field: FormField) {
    touchedFieldsRef.current.add(field);
  }

  function mergeTouchedFields(...extraFields: FormField[]) {
    return new Set<FormField>([...touchedFieldsRef.current, ...extraFields]);
  }

  async function loadLatestEntryContext(userId: string, entryDate: string) {
    const { supabase } = await getAuthenticatedClientContext();
    const { data, error } = await supabase
      .from("daily_entries")
      .select(
        "body_weight, sleep_score, energy_score, cravings_score, calories, notes, day_type, nutrition_source, training_completed, training_source"
      )
      .eq("user_id", userId)
      .eq("entry_date", entryDate)
      .maybeSingle();

    if (error) {
      throw new Error(
        withMutationDetail("Neuester Daily-Eintrag konnte nicht geladen werden.", error.message)
      );
    }

    return createPersistedEntryContext((data ?? null) as DailyEntryRow | null);
  }

  function buildEntryPayload({
    entryDate,
    formSnapshot,
    latestEntryContext,
    touchedFields,
    userId
  }: {
    entryDate: string;
    formSnapshot: FormState;
    latestEntryContext: PersistedEntryContext;
    touchedFields: ReadonlySet<FormField>;
    userId: string;
  }): DailyEntryInsert {
    const bodyWeight = numberOrNull(formSnapshot.body_weight);
    const notes = formSnapshot.notes || null;
    const persistNutrition = touchedFields.has("calories");
    const persistTraining = touchedFields.has("training_completed");

    return {
      body_weight: touchedFields.has("body_weight")
        ? bodyWeight
        : (latestEntryContext.bodyWeight ?? bodyWeight),
      cravings_score: touchedFields.has("cravings_score")
        ? formSnapshot.cravings_score
        : (latestEntryContext.cravingsScore ?? formSnapshot.cravings_score),
      day_type: touchedFields.has("day_type")
        ? formSnapshot.day_type
        : (latestEntryContext.dayType ?? formSnapshot.day_type),
      energy_score: touchedFields.has("energy_score")
        ? formSnapshot.energy_score
        : (latestEntryContext.energyScore ?? formSnapshot.energy_score),
      entry_date: entryDate,
      notes: touchedFields.has("notes")
        ? notes
        : (latestEntryContext.notes ?? notes),
      sleep_score: touchedFields.has("sleep_score")
        ? formSnapshot.sleep_score
        : (latestEntryContext.sleepScore ?? formSnapshot.sleep_score),
      user_id: userId,
      ...(persistTraining
        ? buildDailyTrainingMutationPayload({
            currentTrainingCompleted: formSnapshot.training_completed,
            existingTrainingCompleted: latestEntryContext.trainingCompleted,
            existingTrainingSource: latestEntryContext.trainingSource
          })
        : {}),
      ...(persistNutrition
        ? buildDailyNutritionMutationPayload({
            currentCalories: numberOrNull(formSnapshot.calories),
            existingCalories: latestEntryContext.calories,
            existingNutritionSource: latestEntryContext.nutritionSource
          })
        : {})
    };
  }

  function markPersistedFields(fields: ReadonlySet<FormField>) {
    for (const field of fields) {
      touchedFieldsRef.current.delete(field);
    }
  }

  async function persistEntrySnapshot(formSnapshot: FormState) {
    if (isBrowserOffline()) {
      throw new Error(getOfflineMessage("Bitte nach dem Reconnect erneut speichern."));
    }

    await checklistSyncQueueRef.current;

    const { supabase, userId } = await getAuthenticatedClientContext();

    if (!userId) {
      throw new Error("Session abgelaufen. Bitte erneut einloggen.");
    }

    const entryDate = activeEntryDate;
    const latestEntryContext = await loadLatestEntryContext(userId, entryDate);
    const touchedFields = mergeTouchedFields();
    const entryPayload = buildEntryPayload({
      entryDate,
      formSnapshot,
      latestEntryContext,
      touchedFields,
      userId
    });
    const mutationResult = await saveDailyEntryMutation({
      entry: entryPayload,
      supabase
    });

    if (!mutationResult.saved) {
      throw new Error(withMutationDetail("Tages-Tracking konnte nicht gespeichert werden.", mutationResult.error));
    }

    markPersistedFields(touchedFields);
    notifyAppDataMutation();
  }

  const autosave = useAutosave<FormState>({
    debounceMs: 900,
    enabled: !actionLoading,
    onSave: persistEntrySnapshot,
    resetKey: `${activeEntryDate}:${props.entry?.id ?? "new"}`,
    value: form
  });

  useEffect(() => {
    if (!pendingAutosaveResetRef.current) {
      return;
    }

    autosave.markSaved(pendingAutosaveResetRef.current);
    pendingAutosaveResetRef.current = null;
  }, [autosave, activeEntryDate, props.entry?.id]);

  async function saveEntryNow() {
    setActionLoading(true);
    setStatus({ tone: "muted", message: null });

    try {
      if (isBrowserOffline()) {
        throw new Error(getOfflineMessage("Bitte nach dem Reconnect erneut speichern."));
      }

      await checklistSyncQueueRef.current;

      const { supabase, userId } = await getAuthenticatedClientContext();

      if (!userId) {
        throw new Error("Session abgelaufen. Bitte erneut einloggen.");
      }

      const entryDate = activeEntryDate;
      const formSnapshot = form;
      const checklistSnapshot = { ...checklistStateRef.current };
      const latestEntryContext = await loadLatestEntryContext(userId, entryDate);
      const touchedFields = mergeTouchedFields();
      const entryPayload = buildEntryPayload({
        entryDate,
        formSnapshot,
        latestEntryContext,
        touchedFields,
        userId
      });
      const mutationResult = await saveDailyTrackingMutation({
        checklistState: checklistSnapshot,
        checklistTemplates: props.checklistTemplates,
        entry: entryPayload,
        entryDate,
        supplementLogMeta: props.supplementLogMeta,
        supabase,
        userId
      });

      if (mutationResult.entrySaved) {
        markPersistedFields(touchedFields);
        autosave.markSaved(formSnapshot);
        notifyAppDataMutation();
      }

      setStatus(resolveDailySaveStatus(mutationResult));
    } catch (error) {
      setStatus({
        tone: "danger",
        message: resolveRuntimeErrorMessage(error, "Tages-Tracking konnte nicht gespeichert werden.")
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function persistChecklistToggle(templateKey: string, checked: boolean) {
    if (actionLoading) {
      setStatus({
        tone: "warning",
        message: "Daily-Save läuft bereits. Bitte kurz warten."
      });
      return;
    }

    const previousValue = checklistStateRef.current[templateKey] ?? false;
    const nextChecklistState = {
      ...checklistStateRef.current,
      [templateKey]: checked
    };
    const requestVersion = (checklistRequestVersionRef.current[templateKey] ?? 0) + 1;

    checklistRequestVersionRef.current[templateKey] = requestVersion;
    updateChecklistState(nextChecklistState);

    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage(
          "Checklisten bleiben lokal markiert, der Sync laeuft nach dem nächsten Speichern."
        )
      });
      return;
    }

    void enqueueChecklistSync(async () => {
      if (!isLatestChecklistRequest(templateKey, requestVersion)) {
        return;
      }

      setSyncingChecklistKey(templateKey);

      try {
        const { supabase, userId } = await getAuthenticatedClientContext();

        if (!userId) {
          if (!isLatestChecklistRequest(templateKey, requestVersion)) {
            return;
          }

          revertChecklistValue(templateKey, previousValue);
          setStatus({ tone: "danger", message: "Session abgelaufen. Bitte erneut einloggen." });
          return;
        }

        const mutationResult = await saveDailyChecklistItemMutation({
          checked,
          checklistState: checklistStateRef.current,
          checklistTemplates: props.checklistTemplates,
          entryDate: activeEntryDate,
          supplementLogMeta: props.supplementLogMeta,
          supabase,
          templateKey,
          userId
        });

        if (!isLatestChecklistRequest(templateKey, requestVersion)) {
          return;
        }

        if (mutationResult.status === "failed") {
          revertChecklistValue(templateKey, previousValue);
        }

        setStatus(resolveChecklistSaveStatus(mutationResult));

        if (mutationResult.status !== "failed") {
          notifyAppDataMutation();
        }
      } catch {
        if (!isLatestChecklistRequest(templateKey, requestVersion)) {
          return;
        }

        revertChecklistValue(templateKey, previousValue);
        setStatus({
          tone: "danger",
          message: "Checklist konnte nicht gespeichert werden."
        });
      } finally {
        setSyncingChecklistKey((current) => (current === templateKey ? null : current));
      }
    });
  }

  async function persistSupplementTaskToggle(taskId: string, checked: boolean) {
    if (actionLoading) {
      setStatus({
        tone: "warning",
        message: "Daily-Save läuft bereits. Bitte kurz warten."
      });
      return;
    }

    if (!SUPPLEMENT_TODO_SECTIONS_BY_TASK_ID[taskId]) {
      return;
    }

    const supplementTask = supplementTodoTasks.find((task) => task.taskId === taskId);

    if (!supplementTask?.templateKeys.length) {
      return;
    }

    const previousValues = Object.fromEntries(
      supplementTask.templateKeys.map((templateKey) => [
        templateKey,
        checklistStateRef.current[templateKey] ?? false
      ])
    );
    const nextChecklistState = { ...checklistStateRef.current };

    for (const templateKey of supplementTask.templateKeys) {
      nextChecklistState[templateKey] = checked;
    }

    const requestVersion = (supplementTaskRequestVersionRef.current[taskId] ?? 0) + 1;

    supplementTaskRequestVersionRef.current[taskId] = requestVersion;
    updateChecklistState(nextChecklistState);

    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage(
          "Supplemente bleiben lokal markiert, der Sync läuft nach dem nächsten Speichern."
        )
      });
      return;
    }

    void enqueueChecklistSync(async () => {
      if (!isLatestSupplementTaskRequest(taskId, requestVersion)) {
        return;
      }

      setSyncingSupplementTaskId(taskId);

      try {
        const { supabase, userId } = await getAuthenticatedClientContext();

        if (!userId) {
          if (!isLatestSupplementTaskRequest(taskId, requestVersion)) {
            return;
          }

          revertChecklistValues(previousValues);
          setStatus({ tone: "danger", message: "Session abgelaufen. Bitte erneut einloggen." });
          return;
        }

        const mutationResult = await saveDailyChecklistGroupMutation({
          checked,
          checklistState: checklistStateRef.current,
          checklistTemplates: props.checklistTemplates,
          entryDate: activeEntryDate,
          supplementLogMeta: props.supplementLogMeta,
          supabase,
          templateKeys: supplementTask.templateKeys,
          userId
        });

        if (!isLatestSupplementTaskRequest(taskId, requestVersion)) {
          return;
        }

        if (mutationResult.status === "failed") {
          revertChecklistValues(previousValues);
        }

        setStatus(resolveChecklistSaveStatus(mutationResult));

        if (mutationResult.status !== "failed") {
          notifyAppDataMutation();
        }
      } catch {
        if (!isLatestSupplementTaskRequest(taskId, requestVersion)) {
          return;
        }

        revertChecklistValues(previousValues);
        setStatus({
          tone: "danger",
          message: "Supplemente konnten nicht gespeichert werden."
        });
      } finally {
        setSyncingSupplementTaskId((current) => (current === taskId ? null : current));
      }
    });
  }

  async function copyPreviousDay() {
    setActionLoading(true);
    setStatus({ tone: "muted", message: null });

    try {
      const { supabase, userId } = await getAuthenticatedClientContext();

      if (!userId) {
        setStatus({ tone: "danger", message: "Session abgelaufen. Bitte erneut einloggen." });
        return;
      }

      const entryDate = activeEntryDate;
      const previousDate = shiftDateKey(entryDate, -1);

      const [{ data: entryData }, { data: checklistRowsData }] = await Promise.all([
        supabase
          .from("daily_entries")
          .select("*")
          .eq("user_id", userId)
          .eq("entry_date", previousDate)
          .maybeSingle(),
        supabase
          .from("daily_checklists")
          .select("*")
          .eq("user_id", userId)
          .eq("entry_date", previousDate)
      ]);

      const previousEntry = (entryData ?? null) as DailyEntryRow | null;
      const previousChecklistRows = (checklistRowsData ?? []) as DailyChecklistRow[];

      if (!previousEntry) {
        setStatus({ tone: "warning", message: "Kein Vortagseintrag gefunden." });
        return;
      }

      const copiedForm: FormState = {
        body_weight: previousEntry.body_weight?.toString() ?? "",
        sleep_score: previousEntry.sleep_score ?? 7,
        energy_score: previousEntry.energy_score ?? 7,
        cravings_score: previousEntry.cravings_score ?? 4,
        training_completed: previousEntry.training_completed ?? false,
        calories: previousEntry.calories?.toString() ?? "",
        notes: previousEntry.notes ?? "",
        day_type: previousEntry.day_type
      };
      const copiedChecklist = Object.fromEntries(
        props.checklistTemplates.map((template) => [
          template.template_key,
          previousChecklistRows.find((item) => item.template_key === template.template_key)
            ?.completed ?? false
        ])
      );
      const latestEntryContext = await loadLatestEntryContext(userId, entryDate);
      const touchedFields = new Set<FormField>(ALL_FORM_FIELDS);
      const entryPayload = buildEntryPayload({
        entryDate,
        formSnapshot: copiedForm,
        latestEntryContext,
        touchedFields,
        userId
      });
      const mutationResult = await saveDailyTrackingMutation({
        checklistState: copiedChecklist,
        checklistTemplates: props.checklistTemplates,
        entry: entryPayload,
        entryDate,
        supplementLogMeta: props.supplementLogMeta,
        supabase,
        userId
      });

      if (mutationResult.entrySaved) {
        markPersistedFields(touchedFields);
        setForm(copiedForm);
        autosave.markSaved(copiedForm);
        notifyAppDataMutation();
      }

      if (mutationResult.checklistSaved) {
        updateChecklistState(copiedChecklist);
      }

      if (mutationResult.entrySaved || mutationResult.checklistSaved) {
        setActiveSection("metrics");
      }

      setStatus(
        mutationResult.status === "success"
          ? {
              tone: "success",
              message: "Werte und Checklisten vom Vortag übernommen."
            }
          : resolveDailySaveStatus(mutationResult)
      );
    } catch (error) {
      setStatus({
        tone: "danger",
        message: resolveRuntimeErrorMessage(error, "Vortag konnte nicht geladen werden.")
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function applyTemplate() {
    const matchingTemplate = resolveTemplateForDayType(props, form.day_type);

    if (!matchingTemplate) {
      setStatus({ tone: "warning", message: "Keine Tagesvorlage gefunden." });
      return;
    }

    setActionLoading(true);
    setStatus({ tone: "muted", message: null });

    try {
      if (isBrowserOffline()) {
        throw new Error(getOfflineMessage("Bitte nach dem Reconnect erneut speichern."));
      }

      await checklistSyncQueueRef.current;

      const { supabase, userId } = await getAuthenticatedClientContext();

      if (!userId) {
        throw new Error("Session abgelaufen. Bitte erneut einloggen.");
      }

      const entryDate = activeEntryDate;
      const nextForm: FormState = {
        ...form,
        calories:
          form.calories.trim().length > 0
            ? form.calories
            : matchingTemplate.calories?.toString() ?? form.calories,
        notes: matchingTemplate.notes ?? form.notes,
        day_type: matchingTemplate.day_type,
        training_completed: form.training_completed
      };
      const nextChecklist = Object.fromEntries(
        props.checklistTemplates.map((template) => [template.template_key, false])
      );
      const latestEntryContext = await loadLatestEntryContext(userId, entryDate);
      const touchedFields = mergeTouchedFields("day_type", "notes");
      const entryPayload = buildEntryPayload({
        entryDate,
        formSnapshot: nextForm,
        latestEntryContext,
        touchedFields,
        userId
      });
      const mutationResult = await saveDailyTrackingMutation({
        checklistState: nextChecklist,
        checklistTemplates: props.checklistTemplates,
        entry: entryPayload,
        entryDate,
        supplementLogMeta: props.supplementLogMeta,
        supabase,
        userId
      });

      if (mutationResult.entrySaved) {
        markPersistedFields(touchedFields);
        setForm(nextForm);
        autosave.markSaved(nextForm);
        notifyAppDataMutation();
      }

      if (mutationResult.checklistSaved) {
        updateChecklistState(nextChecklist);
      }

      if (mutationResult.entrySaved || mutationResult.checklistSaved) {
        setActiveSection("metrics");
      }

      setStatus(
        mutationResult.status === "success"
          ? {
              tone: "success",
              message: `Vorlage "${matchingTemplate.title}" geladen.`
            }
          : resolveDailySaveStatus(mutationResult)
      );
    } catch (error) {
      setStatus({
        tone: "danger",
        message: resolveRuntimeErrorMessage(error, "Vorlage konnte nicht geladen werden.")
      });
    } finally {
      setActionLoading(false);
    }
  }

  const todayDate = toDateInputValue(new Date(), props.timezone);
  const previousDate = shiftDateKey(todayDate, -1);

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <Card className="min-w-0 max-w-full space-y-4">
        <div className="flex min-w-0 max-w-full flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <CardTitle>Jetzt loggen</CardTitle>
            <CardDescription className="mt-1">Werte und Checklisten.</CardDescription>
          </div>
          <div className="grid min-w-0 w-full max-w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] xl:max-w-[34rem]">
            <Button
              className="w-full max-w-full"
              variant={selectedDate === todayDate ? "primary" : "secondary"}
              onClick={() => {
                void navigateToDate(todayDate);
              }}
            >
              Heute
            </Button>
            <Button
              className="w-full max-w-full"
              variant={selectedDate === previousDate ? "primary" : "secondary"}
              onClick={() => {
                void navigateToDate(previousDate);
              }}
            >
              Gestern
            </Button>
            <div className="min-w-0 w-full max-w-full overflow-hidden">
              <Input
                className="min-w-0 w-full max-w-full"
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  void navigateToDate(event.target.value);
                }}
              />
            </div>
          </div>
        </div>

        <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-3">
          <Button
            variant="secondary"
            onClick={() => void applyTemplate()}
            disabled={actionLoading}
            className="w-full max-w-full"
          >
            <ClipboardPaste className="mr-2 h-4 w-4" />
            Vorlage
          </Button>
          <Button
            variant="secondary"
            onClick={copyPreviousDay}
            disabled={actionLoading}
            className="w-full max-w-full"
          >
            <Copy className="mr-2 h-4 w-4" />
            Vortag
          </Button>
          <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            <Button
              className="w-full max-w-full"
              variant={activeSection === "metrics" ? "primary" : "secondary"}
              onClick={() => setActiveSection("metrics")}
            >
              Metrics
            </Button>
            <Button
              className="w-full max-w-full"
              variant={activeSection === "checklists" ? "primary" : "secondary"}
              onClick={() => setActiveSection("checklists")}
            >
              Checklisten {compliance}%
            </Button>
          </div>
        </div>

        <StatusMessage tone={status.tone} message={status.message} />
      </Card>

      <DailyTodoList
        dayType={form.day_type}
        onToggleSupplementTask={(taskId, checked) =>
          void persistSupplementTaskToggle(taskId, checked)
        }
        selectedDate={activeEntryDate}
        supplementTaskStates={supplementTodoTaskStates}
        syncedTaskIds={props.syncedTodoTaskIds}
        timezone={props.timezone}
      />

      <DailySyncOverview
        dailyNutrition={props.dailyNutrition}
        dailyTraining={props.dailyTraining}
        timezone={props.timezone}
      />

      <CollapsibleSection title="Mehr">
        <HevyCsvUpload
          variant="compact"
          title="Hevy Import"
          description={null}
          hint={null}
        />
      </CollapsibleSection>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className={cn(activeSection === "metrics" ? "block" : "hidden", "xl:block")}>
          <DailyMetricsPanel
            actionLoading={actionLoading}
            bodyWeight={form.body_weight}
            calories={form.calories}
            cravingsScore={form.cravings_score}
            dayType={form.day_type}
            energyScore={form.energy_score}
            notes={form.notes}
            onBodyWeightChange={(value) =>
              setForm((current) => {
                markFieldTouched("body_weight");
                return { ...current, body_weight: value };
              })
            }
            onBlurSave={() => {
              void autosave.flush();
            }}
            onCaloriesChange={(value) =>
              setForm((current) => {
                markFieldTouched("calories");
                return { ...current, calories: value };
              })
            }
            onCravingsScoreChange={(value) =>
              setForm((current) => {
                markFieldTouched("cravings_score");
                return { ...current, cravings_score: value };
              })
            }
            onDayTypeChange={(value) =>
              setForm((current) => {
                markFieldTouched("day_type");
                return {
                  ...current,
                  day_type: value
                };
              })
            }
            onEnergyScoreChange={(value) =>
              setForm((current) => {
                markFieldTouched("energy_score");
                return { ...current, energy_score: value };
              })
            }
            onNotesChange={(value) =>
              setForm((current) => {
                markFieldTouched("notes");
                return { ...current, notes: value };
              })
            }
            onSave={() => void saveEntryNow()}
            onShowChecklists={() => setActiveSection("checklists")}
            onSleepScoreChange={(value) =>
              setForm((current) => {
                markFieldTouched("sleep_score");
                return { ...current, sleep_score: value };
              })
            }
            onTrainingCompletedChange={(value) =>
              setForm((current) => {
                markFieldTouched("training_completed");
                return { ...current, training_completed: value };
              })
            }
            nutritionSourceStatus={props.dailyNutrition.sourceStatus}
            saveDirty={autosave.isDirty}
            saveErrorMessage={autosave.errorMessage}
            saveStatus={autosave.status}
            showChecklistShortcut
            sleepScore={form.sleep_score}
            trainingCompleted={form.training_completed}
            trainingSourceStatus={props.dailyTraining.sourceStatus}
          />
        </div>

        <div className={cn(activeSection === "checklists" ? "block" : "hidden", "xl:block")}>
          <DailyChecklistPanel
            compliance={compliance}
            groupedChecklist={groupedChecklist}
            onShowMetrics={() => setActiveSection("metrics")}
            onToggleChecklist={(templateKey, checked) =>
              void persistChecklistToggle(templateKey, checked)
            }
            showMetricsShortcut
            syncingChecklistKey={syncingChecklistKey}
          />
        </div>
      </div>
    </div>
  );
}
