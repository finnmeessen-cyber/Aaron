"use client";

import { Apple, Dumbbell } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SourceStatusBadge } from "@/components/ui/source-status-badge";
import type { DailyPageData } from "@/lib/data";

type DailySyncOverviewProps = Pick<
  DailyPageData,
  "dailyNutrition" | "dailyTraining" | "timezone"
>;

function formatMacro(value: number | null, suffix = "g") {
  if (value === null || value === undefined) {
    return "Offen";
  }

  return suffix ? `${value}${suffix}` : `${value}`;
}

function formatMealType(value: string) {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatWorkoutTime(value: string | null, timezone?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone ?? "Europe/Berlin"
  }).format(date);
}

function NutritionCard({ dailyNutrition }: Pick<DailySyncOverviewProps, "dailyNutrition">) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Apple className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.32em]">Nutrition</p>
          </div>
          <CardTitle className="mt-3">Meals und Makros</CardTitle>
          <CardDescription className="mt-1.5">
            FatSecret-Meals direkt im Daily-Kontext, ohne den Nutrition-Tab zu wechseln.
          </CardDescription>
        </div>
        <SourceStatusBadge
          status={dailyNutrition.sourceStatus}
          syncedLabel="FatSecret"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Calories</p>
          <p className="mt-1 text-sm font-semibold">{formatMacro(dailyNutrition.totals.calories, "")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Protein</p>
          <p className="mt-1 text-sm font-semibold">{formatMacro(dailyNutrition.totals.proteinG)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Carbs</p>
          <p className="mt-1 text-sm font-semibold">{formatMacro(dailyNutrition.totals.carbsG)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fat</p>
          <p className="mt-1 text-sm font-semibold">{formatMacro(dailyNutrition.totals.fatG)}</p>
        </div>
      </div>

      {dailyNutrition.entries.length ? (
        <div className="space-y-2">
          {dailyNutrition.entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-border/80 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{entry.foodName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMealType(entry.mealType)}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{formatMacro(entry.calories, " kcal")}</p>
                  <p>
                    P {formatMacro(entry.proteinG)} · C {formatMacro(entry.carbsG)} · F{" "}
                    {formatMacro(entry.fatG)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Keine FatSecret-Meals für diesen Tag gefunden.
        </div>
      )}

      {dailyNutrition.sourceStatus === "manual" && dailyNutrition.entries.length ? (
        <p className="text-xs text-muted-foreground">
          FatSecret-Meals sind sichtbar, aber die Tagesmakros bleiben manuell geschützt.
        </p>
      ) : null}
    </Card>
  );
}

function TrainingCard({
  dailyTraining,
  timezone
}: Pick<DailySyncOverviewProps, "dailyTraining" | "timezone">) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Dumbbell className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.32em]">Training</p>
          </div>
          <CardTitle className="mt-3">Workout-Status</CardTitle>
          <CardDescription className="mt-1.5">
            Hevy-Workouts und Tagesstatus in einem Blick.
          </CardDescription>
        </div>
        <SourceStatusBadge status={dailyTraining.sourceStatus} syncedLabel="Hevy" />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
          <p className="mt-1 text-sm font-semibold">
            {dailyTraining.completed ? "Workout done" : "Noch offen"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workouts</p>
          <p className="mt-1 text-sm font-semibold">{dailyTraining.summary.workoutCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Duration</p>
          <p className="mt-1 text-sm font-semibold">
            {dailyTraining.summary.totalDurationMinutes
              ? `${dailyTraining.summary.totalDurationMinutes} min`
              : "Offen"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Exercises</p>
          <p className="mt-1 text-sm font-semibold">{dailyTraining.summary.totalExerciseCount}</p>
        </div>
      </div>

      {dailyTraining.workouts.length ? (
        <div className="space-y-2">
          {dailyTraining.workouts.map((workout) => (
            <div
              key={workout.id}
              className="rounded-2xl border border-border/80 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{workout.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      formatWorkoutTime(workout.startedAt, timezone),
                      workout.durationMinutes ? `${workout.durationMinutes} min` : null,
                      `${workout.exerciseCount} Übungen`
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    {workout.totalVolumeKg !== null
                      ? `${workout.totalVolumeKg.toFixed(0)} kg Volumen`
                      : "Volumen offen"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Kein Hevy-Workout für diesen Tag gefunden.
        </div>
      )}

      {dailyTraining.sourceStatus === "manual" && dailyTraining.workouts.length ? (
        <p className="text-xs text-muted-foreground">
          Hevy-Workouts sind sichtbar, aber der Tagesstatus bleibt manuell gesetzt.
        </p>
      ) : null}
      {dailyTraining.summary.isBestEffort ? (
        <p className="text-xs text-muted-foreground">
          Trainingsmetriken sind best-effort, weil nicht jede Hevy-Payload vollständige
          Übungsdetails enthält.
        </p>
      ) : null}
    </Card>
  );
}

export function DailySyncOverview({
  dailyNutrition,
  dailyTraining,
  timezone
}: DailySyncOverviewProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <NutritionCard dailyNutrition={dailyNutrition} />
      <TrainingCard dailyTraining={dailyTraining} timezone={timezone} />
    </div>
  );
}
