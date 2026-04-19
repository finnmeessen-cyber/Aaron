import type { TableRow } from "@/types/supabase";
import { average, percentage, shiftDateKey, toDateInputValue } from "@/lib/utils";

type DailyEntry = TableRow<"daily_entries">;
type DailyChecklist = TableRow<"daily_checklists">;

export function computeChecklistCompletionFromCount(completed: number, total: number) {
  return percentage(completed, total);
}

export function computeWeeklyWeightAverage(entries: DailyEntry[]) {
  return average(entries.map((entry) => entry.body_weight));
}

export function computeTrendDelta(
  currentValues: Array<number | null | undefined>,
  previousValues: Array<number | null | undefined>
) {
  const current = average(currentValues);
  const previous = average(previousValues);
  if (current === null || previous === null) {
    return null;
  }
  return current - previous;
}

export function computeStreak(
  entryDates: string[],
  checklistRows: DailyChecklist[] = [],
  timezone: string,
  minimumChecklistCount = 3
) {
  const dates = new Set(entryDates);
  const checklistCountsByDate = new Map<string, number>();

  for (const row of checklistRows) {
    if (!row.completed) {
      continue;
    }

    checklistCountsByDate.set(
      row.entry_date,
      (checklistCountsByDate.get(row.entry_date) ?? 0) + 1
    );
  }

  let streak = 0;
  // Timezone stays explicit here so server-side day boundaries cannot silently fall back.
  const todayDateKey = toDateInputValue(new Date(), timezone);

  for (let offset = 0; offset < 60; offset += 1) {
    const date = shiftDateKey(todayDateKey, -offset);
    const hasDailyEntry = dates.has(date);
    const hasMeaningfulChecklistProgress =
      (checklistCountsByDate.get(date) ?? 0) >= minimumChecklistCount;

    if (!hasDailyEntry && !hasMeaningfulChecklistProgress) {
      break;
    }
    streak += 1;
  }

  return streak;
}

export function buildWeeklySuggestions({
  averageWeightChange,
  cravingsAverage,
  sleepAverage,
  energyAverage
}: {
  averageWeightChange: number | null;
  cravingsAverage: number | null;
  sleepAverage: number | null;
  energyAverage: number | null;
}) {
  const suggestions: string[] = [];

  if (averageWeightChange !== null && averageWeightChange < 0.25) {
    suggestions.push("Gewicht steigt zu langsam: Erhöhe die Kalorien um ca. 150 kcal pro Tag.");
  }

  if (cravingsAverage !== null && cravingsAverage >= 6) {
    suggestions.push("Cravings sind erhöht: Prüfe NAC-Konstanz und deine Abendroutine.");
  }

  if (sleepAverage !== null && sleepAverage <= 5.5) {
    suggestions.push("Schlaf ist zu niedrig: Priorisiere Abendstack, Screen-Cutoff und Schlafvorbereitung.");
  }

  if (energyAverage !== null && energyAverage <= 5.5) {
    suggestions.push("Energie ist niedrig: Prüfe Carb-Zufuhr, Schlafqualität und Stresslast.");
  }

  if (!suggestions.length) {
    suggestions.push("Die Woche ist stabil. Halte das Setup konstant und optimiere nur minimal.");
  }

  return suggestions;
}

export function resolveEntryStatus(entry: DailyEntry | null) {
  if (!entry) {
    return "Noch kein Eintrag";
  }

  const metrics = [
    entry.body_weight,
    entry.sleep_score,
    entry.energy_score,
    entry.cravings_score,
    entry.calories
  ].filter((value) => value !== null);

  if (metrics.length >= 4) {
    return "Solider Track";
  }

  return "Teilweise erfasst";
}

export function toChartSeries(entries: DailyEntry[]) {
  return [...entries]
    .sort((left, right) => left.entry_date.localeCompare(right.entry_date))
    .map((entry) => ({
      date: entry.entry_date,
      weight: entry.body_weight,
      energy: entry.energy_score,
      cravings: entry.cravings_score
    }));
}
