"use client";

import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getDailyTodoItems, toDailyTodoMinutes, type DailyTodoItem } from "@/lib/daily-todos";
import { cn, toDateInputValue } from "@/lib/utils";

const STORAGE_KEY_PREFIX = "daily-todos";

function buildStorageKey(date: string) {
  return `${STORAGE_KEY_PREFIX}:${date}`;
}

function resolveCurrentMinutes(date: string, timezone?: string | null) {
  const now = new Date();
  const todayDate = toDateInputValue(now, timezone);

  if (date !== todayDate) {
    return null;
  }

  return now.getHours() * 60 + now.getMinutes();
}

function readStoredCheckedIds(date: string) {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(buildStorageKey(date));

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(storedValue) as unknown;
    return Array.isArray(parsedValue)
      ? parsedValue.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function TodoRow({
  checked,
  item,
  onToggle,
  pending = false
}: {
  checked: boolean;
  item: DailyTodoItem;
  onToggle: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className={cn(
        "grid min-w-0 w-full max-w-full grid-cols-[4.25rem_minmax(0,1fr)_2rem] items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-70",
        checked && "border-primary/30 bg-primary/10"
      )}
      aria-pressed={checked}
    >
      <span className={cn("text-sm font-medium text-muted-foreground", checked && "opacity-70")}>
        {item.time}
      </span>
      <span
        className={cn(
          "min-w-0 text-sm font-medium",
          checked && "text-muted-foreground line-through decoration-muted-foreground/70"
        )}
      >
        {item.title}
      </span>
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-xl border border-border bg-background",
          checked && "border-primary bg-primary text-primary-foreground"
        )}
      >
        {checked ? <Check className="h-4 w-4" /> : null}
      </span>
    </button>
  );
}

export function DailyTodoList({
  dayType,
  selectedDate,
  supplementTaskStates = {},
  onToggleSupplementTask,
  timezone
}: {
  dayType: "training" | "rest";
  onToggleSupplementTask?: (taskId: string, checked: boolean) => void;
  selectedDate: string;
  supplementTaskStates?: Record<string, { checked: boolean; count: number; pending?: boolean }>;
  timezone?: string | null;
}) {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [currentMinutes, setCurrentMinutes] = useState<number | null>(null);

  useEffect(() => {
    setCheckedIds(readStoredCheckedIds(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateCurrentMinutes = () => {
      setCurrentMinutes(resolveCurrentMinutes(selectedDate, timezone));
    };

    updateCurrentMinutes();

    const interval = window.setInterval(updateCurrentMinutes, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [selectedDate, timezone]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== buildStorageKey(selectedDate)) {
        return;
      }

      setCheckedIds(readStoredCheckedIds(selectedDate));
    };

    const handleFocus = () => {
      setCheckedIds(readStoredCheckedIds(selectedDate));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [selectedDate]);

  const supplementTaskCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(supplementTaskStates).map(([taskId, state]) => [taskId, state.count])
      ),
    [supplementTaskStates]
  );

  const tasks = useMemo(
    () =>
      getDailyTodoItems({
        date: selectedDate,
        dayType,
        supplementTaskCounts,
        timezone
      }),
    [dayType, selectedDate, supplementTaskCounts, timezone]
  );

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((left, right) => {
      const leftChecked = supplementTaskStates[left.id]?.checked ?? checkedIds.includes(left.id);
      const rightChecked = supplementTaskStates[right.id]?.checked ?? checkedIds.includes(right.id);

      if (leftChecked !== rightChecked) {
        return leftChecked ? 1 : -1;
      }

      if (currentMinutes !== null) {
        const leftUpcoming = toDailyTodoMinutes(left.time) >= currentMinutes;
        const rightUpcoming = toDailyTodoMinutes(right.time) >= currentMinutes;

        if (leftUpcoming !== rightUpcoming) {
          return leftUpcoming ? -1 : 1;
        }
      }

      return left.time.localeCompare(right.time);
    });
  }, [checkedIds, currentMinutes, supplementTaskStates, tasks]);

  function handleToggle(taskId: string) {
    const supplementTaskState = supplementTaskStates[taskId];

    if (supplementTaskState && onToggleSupplementTask) {
      onToggleSupplementTask(taskId, !supplementTaskState.checked);
      return;
    }

    const nextCheckedIds = checkedIds.includes(taskId)
      ? checkedIds.filter((checkedId) => checkedId !== taskId)
      : [...checkedIds, taskId];

    setCheckedIds(nextCheckedIds);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(buildStorageKey(selectedDate), JSON.stringify(nextCheckedIds));
    }
  }

  if (!sortedTasks.length) {
    return null;
  }

  return (
    <section className="min-w-0 max-w-full space-y-2">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Heute</h2>
      </div>
      <div className="space-y-2">
        {sortedTasks.map((task) => (
          <TodoRow
            key={task.id}
            checked={supplementTaskStates[task.id]?.checked ?? checkedIds.includes(task.id)}
            item={task}
            pending={supplementTaskStates[task.id]?.pending}
            onToggle={() => handleToggle(task.id)}
          />
        ))}
      </div>
    </section>
  );
}
