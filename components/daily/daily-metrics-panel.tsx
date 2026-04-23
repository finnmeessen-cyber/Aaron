"use client";

import { ArrowRight, Save } from "lucide-react";

import { ScorePicker } from "@/components/daily/score-picker";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SaveIndicator } from "@/components/ui/save-indicator";
import { SourceStatusBadge } from "@/components/ui/source-status-badge";
import { Textarea } from "@/components/ui/textarea";
import type { AutosaveStatus } from "@/lib/autosave/use-autosave";
import { DAY_TYPE_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type DailyMetricsPanelProps = {
  bodyWeight: string;
  calories: string;
  cravingsScore: number;
  energyScore: number;
  actionLoading: boolean;
  notes: string;
  onBodyWeightChange: (value: string) => void;
  onBlurSave: () => void;
  onCaloriesChange: (value: string) => void;
  onCravingsScoreChange: (value: number) => void;
  onDayTypeChange: (value: "training" | "rest") => void;
  onEnergyScoreChange: (value: number) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  onShowChecklists?: () => void;
  onSleepScoreChange: (value: number) => void;
  onTrainingCompletedChange: (value: boolean) => void;
  nutritionSourceStatus: "manual" | "missing" | "synced";
  saveDirty: boolean;
  saveErrorMessage: string | null;
  saveStatus: AutosaveStatus;
  showChecklistShortcut?: boolean;
  sleepScore: number;
  trainingCompleted: boolean;
  trainingSourceStatus: "manual" | "missing" | "synced";
  dayType: "training" | "rest";
};

export function DailyMetricsPanel({
  actionLoading,
  bodyWeight,
  calories,
  cravingsScore,
  dayType,
  energyScore,
  notes,
  onBodyWeightChange,
  onBlurSave,
  onCaloriesChange,
  onCravingsScoreChange,
  onDayTypeChange,
  onEnergyScoreChange,
  onNotesChange,
  onSave,
  onShowChecklists,
  onSleepScoreChange,
  onTrainingCompletedChange,
  nutritionSourceStatus,
  saveDirty,
  saveErrorMessage,
  saveStatus,
  showChecklistShortcut = false,
  sleepScore,
  trainingCompleted,
  trainingSourceStatus
}: DailyMetricsPanelProps) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Metrics / Tagesdaten</CardTitle>
          <CardDescription className="mt-1.5">
            Gewicht, Scores, Kalorien und Notizen in einem Block.
          </CardDescription>
        </div>
        {showChecklistShortcut && onShowChecklists ? (
          <Button variant="secondary" onClick={onShowChecklists} className="sm:w-auto xl:hidden">
            Zu Checklisten
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Gewicht (kg)</label>
          <Input
            inputMode="decimal"
            placeholder="z. B. 76.4"
            value={bodyWeight}
            onChange={(event) => onBodyWeightChange(event.target.value)}
            onBlur={onBlurSave}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium">Kalorien</label>
            <SourceStatusBadge status={nutritionSourceStatus} syncedLabel="FatSecret" />
          </div>
          <Input
            inputMode="numeric"
            placeholder="z. B. 3150"
            value={calories}
            onChange={(event) => onCaloriesChange(event.target.value)}
            onBlur={onBlurSave}
          />
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">Tagestyp</label>
        <div className="grid grid-cols-2 gap-3">
          {DAY_TYPE_OPTIONS.map((option) => {
            const active = dayType === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onDayTypeChange(option.value)}
                className={cn(
                  "min-h-14 rounded-2xl border px-4 text-left transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary/40"
                )}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span
                  className={cn(
                    "mt-1 block text-xs",
                    active ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {option.value === "training"
                    ? "Mehr Carbs, Performance, Workout"
                    : "Recovery und Struktur"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium">Training heute</label>
          <SourceStatusBadge status={trainingSourceStatus} syncedLabel="Hevy" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: true, label: "Workout done", description: "Heute erledigt" },
            { value: false, label: "Noch offen", description: "Noch nicht abgeschlossen" }
          ].map((option) => {
            const active = trainingCompleted === option.value;

            return (
              <button
                key={option.label}
                type="button"
                onClick={() => onTrainingCompletedChange(option.value)}
                className={cn(
                  "min-h-14 rounded-2xl border px-4 text-left transition",
                  active
                    ? "border-success bg-success/15 text-foreground"
                    : "border-border bg-card hover:border-success/40"
                )}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ScorePicker label="Schlafscore" value={sleepScore} onChange={onSleepScoreChange} />
      <ScorePicker label="Energiescore" value={energyScore} onChange={onEnergyScoreChange} />
      <ScorePicker label="Cravingsscore" value={cravingsScore} onChange={onCravingsScoreChange} />

      <div className="space-y-2">
        <label className="text-sm font-medium">Notizen</label>
        <Textarea
          placeholder="Wie lief der Tag, Training, Stimmung, Trigger, Anpassungen..."
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          onBlur={onBlurSave}
        />
      </div>

      <div className="rounded-[1.5rem] border border-border bg-muted p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Autosave</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily-Eingaben werden automatisch gespeichert.
            </p>
            <SaveIndicator
              className="mt-2"
              errorMessage={saveErrorMessage}
              isDirty={saveDirty}
              status={saveStatus}
            />
          </div>
          <Button onClick={onSave} disabled={actionLoading} className="w-full sm:w-auto">
            <Save className="mr-2 h-4 w-4" />
            {actionLoading ? "Lädt..." : "Jetzt speichern"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
