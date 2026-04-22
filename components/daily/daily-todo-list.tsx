"use client";

import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getDailyTodoItems, toDailyTodoMinutes, type DailyTodoItem } from "@/lib/daily-todos";
import { cn, toDateInputValue } from "@/lib/utils";

const STORAGE_KEY_PREFIX = "daily-todos";

function buildStorageKey(date: string) {
  return `${STORAGE_KEY_PREFIX}:${date}`;
}

function TodoRow({
  checked,
  item,
  onToggle
}: {
  checked: boolean;
  item: DailyTodoItem;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "grid w-full grid-cols-[4.25rem_1fr_2rem] items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-muted/70",
        checked && "border-primary/30 bg-primary/10"
      )}
      aria-pressed={checked}
    >
      <span className={cn("text-sm font-medium text-muted-foreground", checked && "opacity-70")}>
        {item.time}
      </span>
      <span
        className={cn(
          "text-sm font-medium",
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
  supplementCount,
  timezone
}: {
  dayType: "training" | "rest";
  selectedDate: string;
  supplementCount: number;
  timezone?: string | null;
}) {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(buildStorageKey(selectedDate));
    setCheckedIds(storedValue ? (JSON.parse(storedValue) as string[]) : []);
  }, [selectedDate]);

  const tasks = useMemo(
    () =>
      getDailyTodoItems({
        date: selectedDate,
        dayType,
        supplementCount,
        timezone
      }),
    [dayType, selectedDate, supplementCount, timezone]
  );

  const todayDate = toDateInputValue(new Date(), timezone);
  const currentMinutes = useMemo(() => {
    if (selectedDate !== todayDate) {
      return null;
    }

    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, [selectedDate, todayDate]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((left, right) => {
      const leftChecked = checkedIds.includes(left.id);
      const rightChecked = checkedIds.includes(right.id);

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
  }, [checkedIds, currentMinutes, tasks]);

  function handleToggle(taskId: string) {
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
    <section className="space-y-2">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Heute</h2>
      </div>
      <div className="space-y-2">
        {sortedTasks.map((task) => (
          <TodoRow
            key={task.id}
            checked={checkedIds.includes(task.id)}
            item={task}
            onToggle={() => handleToggle(task.id)}
          />
        ))}
      </div>
    </section>
  );
}
