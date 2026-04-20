"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { StrengthProgressData, StrengthProgressPoint } from "@/lib/hevy/strength-progress";
import { formatShortDate } from "@/lib/utils";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

function buildChartPath(points: StrengthProgressPoint[]) {
  const width = 100;
  const height = 100;
  const values = points.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;

  const linePath = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - minValue) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const areaPath = `${linePath} L 100 100 L 0 100 Z`;
  const circles = points.map((point, index) => ({
    cx: (index / Math.max(points.length - 1, 1)) * width,
    cy: height - ((point.value - minValue) / range) * height,
    label: point.value
  }));

  return {
    areaPath,
    circles,
    linePath,
    maxValue,
    minValue
  };
}

function SummaryMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted px-4 py-4">
      <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function StrengthLineChart({ points }: { points: StrengthProgressPoint[] }) {
  const { areaPath, circles, linePath, maxValue, minValue } = useMemo(
    () => buildChartPath(points),
    [points]
  );

  return (
    <div className="rounded-2xl border border-border bg-muted/60 p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatShortDate(points[0].date)}</span>
        <span>{formatShortDate(points[points.length - 1].date)}</span>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-56 w-full overflow-visible text-primary md:h-64"
          aria-hidden="true"
        >
          {[20, 50, 80].map((offset) => (
            <line
              key={offset}
              x1="0"
              y1={offset}
              x2="100"
              y2={offset}
              stroke="currentColor"
              strokeDasharray="2 4"
              strokeOpacity="0.12"
            />
          ))}
          <path d={areaPath} fill="currentColor" opacity="0.08" />
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {circles.map((circle, index) => (
            <circle
              key={`${circle.label}-${index}`}
              cx={circle.cx}
              cy={circle.cy}
              r="1.8"
              fill="hsl(var(--background))"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-1 text-xs text-muted-foreground">
          <span>{maxValue.toFixed(1)}</span>
          <span>{minValue.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

export function StrengthProgressCard({ data }: { data: StrengthProgressData }) {
  const [selectedExerciseKey, setSelectedExerciseKey] = useState(data.defaultExerciseKey ?? "");
  const selectedExercise = useMemo(
    () =>
      data.exercises.find((exercise) => exercise.key === selectedExerciseKey) ??
      data.exercises[0] ??
      null,
    [data.exercises, selectedExerciseKey]
  );

  if (!selectedExercise) {
    return (
      <Card className="space-y-4 p-5 md:p-6">
        <div>
          <CardTitle>Strength Progress</CardTitle>
          <CardDescription className="mt-2">
            Based on estimated 1RM from your imported Hevy workouts.
          </CardDescription>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-muted/50 px-5 py-6">
          <p className="text-sm font-medium">Noch nicht genug Hevy-Daten für einen Verlauf.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Importiere eine Hevy CSV im Daily-Tracker oder auf der{" "}
            <Link href="/settings/hevy-import" className="font-medium text-primary">
              Hevy-Import-Seite
            </Link>
            , damit wir pro Übung mehrere Datenpunkte vergleichen können.
          </p>
        </div>
      </Card>
    );
  }

  const startPoint = selectedExercise.points[0];
  const latestPoint = selectedExercise.points[selectedExercise.points.length - 1];
  const deltaValue = latestPoint.value - startPoint.value;

  return (
    <Card className="space-y-5 p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Strength Progress</CardTitle>
          <CardDescription className="mt-2">
            Based on estimated 1RM from your imported Hevy workouts.
          </CardDescription>
          <p className="mt-3 text-sm text-muted-foreground">
            {data.workoutCount} Trainingstage und {data.validSetCount} valide Sets aus deinem
            Hevy-Import.
          </p>
        </div>
        {data.exercises.length > 1 ? (
          <div className="w-full md:max-w-xs">
            <label className="mb-2 block text-sm font-medium" htmlFor="strength-progress-exercise">
              Übung
            </label>
            <Select
              id="strength-progress-exercise"
              value={selectedExercise.key}
              onChange={(event) => setSelectedExerciseKey(event.target.value)}
            >
              {data.exercises.map((exercise) => (
                <option key={exercise.key} value={exercise.key}>
                  {exercise.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Start" value={startPoint.value.toFixed(1)} />
        <SummaryMetric label="Aktuell" value={latestPoint.value.toFixed(1)} />
        <SummaryMetric
          label="Delta"
          value={`${deltaValue > 0 ? "+" : ""}${deltaValue.toFixed(1)}`}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{selectedExercise.label}</p>
            <p className="text-sm text-muted-foreground">
              Best point per date, calculated with the Epley formula.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedExercise.points.length} Datenpunkte
          </p>
        </div>

        <StrengthLineChart points={selectedExercise.points} />
      </div>
    </Card>
  );
}
