"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Save } from "lucide-react";

import { THEME_OPTIONS, WEEK_DAYS } from "@/lib/constants";
import type { SettingsPageData } from "@/lib/data";
import { saveSettingsMutation } from "@/lib/mutations";
import {
  getAuthenticatedClientContext,
  getOfflineMessage,
  isBrowserOffline
} from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusMessage } from "@/components/ui/status-message";

type SettingsState = {
  macro_training_calories: number;
  macro_training_protein: number;
  macro_training_carbs: number;
  macro_training_fat: number;
  macro_rest_calories: number;
  macro_rest_protein: number;
  macro_rest_carbs: number;
  macro_rest_fat: number;
  training_days: number[];
  current_phase_slug: string;
  dark_mode_preference: "system" | "light" | "dark";
  supplementActiveMap: Record<string, boolean>;
};

const positiveMacroKeys = [
  "macro_training_calories",
  "macro_training_protein",
  "macro_rest_calories",
  "macro_rest_protein"
] as const;

const nonNegativeMacroKeys = [
  "macro_training_carbs",
  "macro_training_fat",
  "macro_rest_carbs",
  "macro_rest_fat"
] as const;

function buildState(data: SettingsPageData): SettingsState {
  return {
    macro_training_calories: data.settings?.macro_training_calories ?? 3150,
    macro_training_protein: data.settings?.macro_training_protein ?? 170,
    macro_training_carbs: data.settings?.macro_training_carbs ?? 420,
    macro_training_fat: data.settings?.macro_training_fat ?? 50,
    macro_rest_calories: data.settings?.macro_rest_calories ?? 2750,
    macro_rest_protein: data.settings?.macro_rest_protein ?? 170,
    macro_rest_carbs: data.settings?.macro_rest_carbs ?? 320,
    macro_rest_fat: data.settings?.macro_rest_fat ?? 55,
    training_days: data.settings?.training_days ?? [1, 3, 5],
    current_phase_slug: data.settings?.current_phase_slug ?? data.phases[0]?.slug ?? "",
    dark_mode_preference: data.settings?.dark_mode_preference ?? "dark",
    supplementActiveMap: Object.fromEntries(
      data.supplements.map((supplement) => [supplement.id, supplement.active])
    )
  };
}

export function SettingsForm(data: SettingsPageData) {
  const router = useRouter();
  const [state, setState] = useState<SettingsState>(() => buildState(data));
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{
    tone: "success" | "warning" | "danger" | "muted";
    message: string | null;
  }>({ tone: "muted", message: null });
  const { setTheme } = useTheme();

  useEffect(() => {
    setState(buildState(data));
  }, [data]);

  const activeSupplements = useMemo(
    () => Object.values(state.supplementActiveMap).filter(Boolean).length,
    [state.supplementActiveMap]
  );

  async function saveSettings() {
    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Einstellungen nach Reconnect speichern.")
      });
      return;
    }

    if (!state.current_phase_slug) {
      setStatus({ tone: "warning", message: "Bitte wähle zuerst eine Phase." });
      return;
    }

    if (!state.training_days.length) {
      setStatus({ tone: "warning", message: "Bitte wähle mindestens einen Trainingstag." });
      return;
    }

    if (positiveMacroKeys.some((key) => state[key] <= 0)) {
      setStatus({
        tone: "warning",
        message: "Kalorien- und Protein-Ziele müssen größer als 0 sein."
      });
      return;
    }

    if (nonNegativeMacroKeys.some((key) => state[key] < 0)) {
      setStatus({
        tone: "warning",
        message: "Carbs- und Fett-Ziele dürfen nicht negativ sein."
      });
      return;
    }

    setPending(true);
    setStatus({ tone: "muted", message: null });

    try {
      const { supabase, userId } = await getAuthenticatedClientContext();

      if (!userId) {
        setStatus({ tone: "danger", message: "Session abgelaufen. Bitte erneut einloggen." });
        return;
      }

      const phaseChanged = data.settings?.current_phase_slug !== state.current_phase_slug;
      const { error } = await saveSettingsMutation({
        settings: {
          macro_training_calories: state.macro_training_calories,
          macro_training_protein: state.macro_training_protein,
          macro_training_carbs: state.macro_training_carbs,
          macro_training_fat: state.macro_training_fat,
          macro_rest_calories: state.macro_rest_calories,
          macro_rest_protein: state.macro_rest_protein,
          macro_rest_carbs: state.macro_rest_carbs,
          macro_rest_fat: state.macro_rest_fat,
          training_days: state.training_days,
          current_phase_slug: state.current_phase_slug,
          dark_mode_preference: state.dark_mode_preference
        },
        supplements: data.supplements.map((supplement) => ({
          active: state.supplementActiveMap[supplement.id] ?? supplement.active,
          supplement_id: supplement.id,
          user_id: userId
        })),
        supabase,
        userId
      });

      if (error) {
        setStatus({ tone: "danger", message: error });
        return;
      }

      setTheme(state.dark_mode_preference);
      setStatus({ tone: "success", message: "Settings gespeichert." });

      if (phaseChanged) {
        router.refresh();
      }
    } catch {
      setStatus({
        tone: "danger",
        message: "Speichern fehlgeschlagen. Bitte versuche es erneut."
      });
    } finally {
      setPending(false);
    }
  }

  function toggleTrainingDay(value: number) {
    setState((current) => ({
      ...current,
      training_days: current.training_days.includes(value)
        ? current.training_days.filter((day) => day !== value)
        : [...current.training_days, value].sort()
    }));
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Globale Settings</CardTitle>
            <CardDescription className="mt-2">
              Makro-Ziele, Trainingstage, Phase, Theme und aktive Standardsupplements.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={saveSettings} disabled={pending}>
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </Button>
        </div>
        <StatusMessage tone={status.tone} message={status.message} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-5">
          <Card className="space-y-4">
            <CardTitle>Makro-Ziele</CardTitle>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Training kcal", "macro_training_calories"],
                ["Training Protein", "macro_training_protein"],
                ["Training Carbs", "macro_training_carbs"],
                ["Training Fett", "macro_training_fat"],
                ["Rest kcal", "macro_rest_calories"],
                ["Rest Protein", "macro_rest_protein"],
                ["Rest Carbs", "macro_rest_carbs"],
                ["Rest Fett", "macro_rest_fat"]
              ].map(([label, key]) => (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium">{label}</label>
                  <Input
                    inputMode="numeric"
                    value={state[key as keyof SettingsState] as number}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        [key]: Number(event.target.value) || 0
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <CardTitle>Trainingstage</CardTitle>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
              {WEEK_DAYS.map((day) => {
                const active = state.training_days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleTrainingDay(day.value)}
                    className={`min-h-12 rounded-2xl border text-sm font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4">
            <CardTitle>Phase & Theme</CardTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Aktuelle Phase</label>
                <Select
                  value={state.current_phase_slug}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      current_phase_slug: event.target.value
                    }))
                  }
                >
                  {data.phases.map((phase) => (
                    <option key={phase.id} value={phase.slug}>
                      {phase.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Theme</label>
                <Select
                  value={state.dark_mode_preference}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      dark_mode_preference: event.target.value as "system" | "light" | "dark"
                    }))
                  }
                >
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>
        </div>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Standardsupplements</CardTitle>
              <CardDescription className="mt-2">
                {activeSupplements} Standardsupplements aktuell aktiv.
              </CardDescription>
            </div>
          </div>
          <div className="space-y-3">
            {data.supplements.map((supplement) => (
              <Checkbox
                key={supplement.id}
                checked={state.supplementActiveMap[supplement.id] ?? supplement.active}
                onCheckedChange={(checked) =>
                  setState((current) => ({
                    ...current,
                    supplementActiveMap: {
                      ...current.supplementActiveMap,
                      [supplement.id]: checked
                    }
                  }))
                }
                label={supplement.name}
                description={supplement.category}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
