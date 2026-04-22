"use client";

import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Copy } from "lucide-react";

import { DailyChecklistPanel } from "@/components/daily/daily-checklist-panel";
import { DailyMetricsPanel } from "@/components/daily/daily-metrics-panel";
import { DailyTodoList } from "@/components/daily/daily-todo-list";
import { HevyCsvUpload } from "@/components/hevy/hevy-csv-upload";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import type { DailyPageData } from "@/lib/data";
import {
  type DailyChecklistItemMutationResult,
  type DailyTrackingMutationResult,
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
import type { TableRow } from "@/types/supabase";

type DailyTrackerFormProps = DailyPageData;
type DailyEntryRow = TableRow<"daily_entries">;
type DailyChecklistRow = TableRow<"daily_checklists">;

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

function withMutationDetail(message: string, detail?: string | null) {
  return detail ? `${message} Details: ${detail}` : message;
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

export function DailyTrackerForm(props: DailyTrackerFormProps) {
  const router = useRouter();
  const checklistTemplates = props.checklistTemplates;
  const [activeSection, setActiveSection] = useState<ActiveSection>("metrics");
  const [selectedDate, setSelectedDate] = useState(props.selectedDate);
  const [form, setForm] = useState<FormState>(() => createInitialState(props));
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => buildChecklistState(props));
  const [status, setStatus] = useState<StatusState>({ tone: "muted", message: null });
  const [loading, setLoading] = useState(false);
  const [syncingChecklistKey, setSyncingChecklistKey] = useState<string | null>(null);
  const [syncingSupplementTaskId, setSyncingSupplementTaskId] = useState<string | null>(null);
  const checklistStateRef = useRef<Record<string, boolean>>(buildChecklistState(props));
  const checklistRequestVersionRef = useRef<Record<string, number>>({});
  const supplementTaskRequestVersionRef = useRef<Record<string, number>>({});
  const checklistSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setSelectedDate(props.selectedDate);
    setForm(createInitialState(props));
    const nextChecklistState = buildChecklistState(props);
    checklistStateRef.current = nextChecklistState;
    setChecklist(nextChecklistState);
    setActiveSection("metrics");
  }, [props]);

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

  function navigateToDate(date: string) {
    if (!date) {
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

  async function saveEntry() {
    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Bitte nach dem Reconnect erneut speichern.")
      });
      return;
    }

    setLoading(true);
    setStatus({ tone: "muted", message: null });

    try {
      await checklistSyncQueueRef.current;

      const { supabase, userId } = await getAuthenticatedClientContext();

      if (!userId) {
        setStatus({ tone: "danger", message: "Session abgelaufen. Bitte erneut einloggen." });
        return;
      }

      const mutationResult = await saveDailyTrackingMutation({
        checklistState: checklistStateRef.current,
        checklistTemplates: props.checklistTemplates,
        entry: {
          body_weight: numberOrNull(form.body_weight),
          calories: numberOrNull(form.calories),
          cravings_score: form.cravings_score,
          day_type: form.day_type,
          energy_score: form.energy_score,
          entry_date: selectedDate,
          notes: form.notes || null,
          sleep_score: form.sleep_score,
          training_completed: form.training_completed,
          user_id: userId
        },
        entryDate: selectedDate,
        supplementLogMeta: props.supplementLogMeta,
        supabase,
        userId
      });

      setStatus(resolveDailySaveStatus(mutationResult));

      if (mutationResult.status !== "failed") {
        notifyAppDataMutation();
      }
    } catch {
      setStatus({
        tone: "danger",
        message: "Speichern fehlgeschlagen. Bitte versuche es erneut."
      });
    } finally {
      setLoading(false);
    }
  }

  async function persistChecklistToggle(templateKey: string, checked: boolean) {
    if (loading) {
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
          entryDate: selectedDate,
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
    if (loading) {
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
          entryDate: selectedDate,
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
    setLoading(true);
    setStatus({ tone: "muted", message: null });

    try {
      const { supabase, userId } = await getAuthenticatedClientContext();

      if (!userId) {
        setStatus({ tone: "danger", message: "Session abgelaufen. Bitte erneut einloggen." });
        return;
      }

      const previousDate = shiftDateKey(selectedDate, -1);

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

      setForm({
        body_weight: previousEntry.body_weight?.toString() ?? "",
        sleep_score: previousEntry.sleep_score ?? 7,
        energy_score: previousEntry.energy_score ?? 7,
        cravings_score: previousEntry.cravings_score ?? 4,
        training_completed: previousEntry.training_completed ?? false,
        calories: previousEntry.calories?.toString() ?? "",
        notes: previousEntry.notes ?? "",
        day_type: previousEntry.day_type
      });

      updateChecklistState(
        Object.fromEntries(
          props.checklistTemplates.map((template) => [
            template.template_key,
            previousChecklistRows.find((item) => item.template_key === template.template_key)
              ?.completed ?? false
          ])
        )
      );

      setActiveSection("metrics");
      setStatus({
        tone: "success",
        message: "Werte und Checklisten vom Vortag übernommen. Speichern nicht vergessen."
      });
    } catch {
      setStatus({
        tone: "danger",
        message: "Vortag konnte nicht geladen werden."
      });
    } finally {
      setLoading(false);
    }
  }

  function applyTemplate() {
    const matchingTemplate = resolveTemplateForDayType(props, form.day_type);

    if (!matchingTemplate) {
      setStatus({ tone: "warning", message: "Keine Tagesvorlage gefunden." });
      return;
    }

    setForm((current) => ({
      ...current,
      calories: matchingTemplate.calories?.toString() ?? current.calories,
      notes: matchingTemplate.notes ?? current.notes,
      day_type: matchingTemplate.day_type,
      training_completed: false
    }));

    updateChecklistState(
      Object.fromEntries(props.checklistTemplates.map((template) => [template.template_key, false]))
    );
    setActiveSection("metrics");

    setStatus({
      tone: "success",
      message: `Vorlage "${matchingTemplate.title}" geladen.`
    });
  }

  const todayDate = toDateInputValue(new Date(), props.timezone);
  const previousDate = shiftDateKey(todayDate, -1);

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle>Jetzt loggen</CardTitle>
            <CardDescription className="mt-1">Werte und Checklisten.</CardDescription>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <Button
              variant={selectedDate === todayDate ? "primary" : "secondary"}
              onClick={() => navigateToDate(todayDate)}
            >
              Heute
            </Button>
            <Button
              variant={selectedDate === previousDate ? "primary" : "secondary"}
              onClick={() => navigateToDate(previousDate)}
            >
              Gestern
            </Button>
            <div className="min-w-0">
              <Input
                className="min-w-0 max-w-full"
                type="date"
                value={selectedDate}
                onChange={(event) => navigateToDate(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Button variant="secondary" onClick={applyTemplate}>
            <ClipboardPaste className="mr-2 h-4 w-4" />
            Vorlage
          </Button>
          <Button variant="secondary" onClick={copyPreviousDay} disabled={loading}>
            <Copy className="mr-2 h-4 w-4" />
            Vortag
          </Button>
          <div className="grid grid-cols-2 gap-3 xl:hidden">
            <Button
              variant={activeSection === "metrics" ? "primary" : "secondary"}
              onClick={() => setActiveSection("metrics")}
            >
              Metrics
            </Button>
            <Button
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
        selectedDate={selectedDate}
        supplementTaskStates={supplementTodoTaskStates}
        timezone={props.timezone}
      />

      <CollapsibleSection title="Mehr">
        <HevyCsvUpload
          variant="compact"
          title="Hevy Import"
          description={null}
          hint={null}
          onCompleted={() => router.refresh()}
        />
      </CollapsibleSection>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className={cn(activeSection === "metrics" ? "block" : "hidden", "xl:block")}>
          <DailyMetricsPanel
            bodyWeight={form.body_weight}
            calories={form.calories}
            cravingsScore={form.cravings_score}
            dayType={form.day_type}
            energyScore={form.energy_score}
            loading={loading}
            notes={form.notes}
            onBodyWeightChange={(value) =>
              setForm((current) => ({ ...current, body_weight: value }))
            }
            onCaloriesChange={(value) =>
              setForm((current) => ({ ...current, calories: value }))
            }
            onCravingsScoreChange={(value) =>
              setForm((current) => ({ ...current, cravings_score: value }))
            }
            onDayTypeChange={(value) =>
              setForm((current) => ({
                ...current,
                day_type: value
              }))
            }
            onEnergyScoreChange={(value) =>
              setForm((current) => ({ ...current, energy_score: value }))
            }
            onNotesChange={(value) =>
              setForm((current) => ({ ...current, notes: value }))
            }
            onSave={() => void saveEntry()}
            onShowChecklists={() => setActiveSection("checklists")}
            onSleepScoreChange={(value) =>
              setForm((current) => ({ ...current, sleep_score: value }))
            }
            onTrainingCompletedChange={(value) =>
              setForm((current) => ({ ...current, training_completed: value }))
            }
            showChecklistShortcut
            sleepScore={form.sleep_score}
            trainingCompleted={form.training_completed}
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
