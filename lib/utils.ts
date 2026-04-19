import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_APP_TIMEZONE = "Europe/Berlin";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function resolveTimezone(timezone?: string | null) {
  const candidate = timezone?.trim();

  if (candidate) {
    try {
      new Intl.DateTimeFormat("de-DE", { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      return DEFAULT_APP_TIMEZONE;
    }
  }

  if (typeof Intl !== "undefined") {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (localTimezone) {
      return localTimezone;
    }
  }

  return DEFAULT_APP_TIMEZONE;
}

function parseDateKeyParts(dateKey: string) {
  if (!DATE_KEY_REGEX.test(dateKey)) {
    return null;
  }

  const [yearValue, monthValue, dayValue] = dateKey.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    day,
    month,
    year
  };
}

function createDateKeyDate(dateKey: string) {
  const parts = parseDateKeyParts(dateKey);

  if (!parts) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

function toIsoDateKeyFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateParts(date: Date, timezone?: string | null) {
  const parts = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: resolveTimezone(timezone),
    year: "numeric"
  }).formatToParts(date);

  return {
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    year: parts.find((part) => part.type === "year")?.value ?? "1970"
  };
}

function toDisplayDate(value: string | Date) {
  if (typeof value === "string" && isDateKey(value)) {
    return {
      date: createDateKeyDate(value),
      timeZone: "UTC"
    };
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.valueOf())) {
    return {
      date: new Date(),
      timeZone: resolveTimezone()
    };
  }

  return {
    date,
    timeZone: resolveTimezone()
  };
}

export function isDateKey(value: string) {
  return parseDateKeyParts(value) !== null;
}

export function formatDateKey(value: string | Date, timezone?: string | null): string {
  if (typeof value === "string" && isDateKey(value)) {
    return value;
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.valueOf())) {
    return toDateInputValue(new Date(), timezone);
  }

  const parts = formatDateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDisplayDate(value: string | Date) {
  const { date, timeZone } = toDisplayDate(value);
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    timeZone,
    weekday: "long"
  }).format(date);
}

export function formatShortDate(value: string | Date) {
  const { date, timeZone } = toDisplayDate(value);
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).format(date);
}

export function toDateInputValue(date = new Date(), timezone?: string | null): string {
  return formatDateKey(date, timezone);
}

export function shiftDateKey(dateKey: string, amount: number) {
  if (!Number.isInteger(amount)) {
    throw new Error(`Invalid day shift: ${amount}`);
  }

  const shifted = createDateKeyDate(dateKey);
  shifted.setUTCDate(shifted.getUTCDate() + amount);
  return toIsoDateKeyFromUtcDate(shifted);
}

export function getDateKeyDayIndex(dateKey: string) {
  return createDateKeyDate(dateKey).getUTCDay();
}

export function startOfWeekDateKey(dateKey: string, weekStartsOn = 1) {
  const currentDay = getDateKeyDayIndex(dateKey);
  const offset = (currentDay - weekStartsOn + 7) % 7;
  return shiftDateKey(dateKey, -offset);
}

export function endOfWeekDateKey(dateKey: string, weekStartsOn = 1) {
  return shiftDateKey(startOfWeekDateKey(dateKey, weekStartsOn), 6);
}

export function differenceInDateKeys(laterDateKey: string, earlierDateKey: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (createDateKeyDate(laterDateKey).getTime() - createDateKeyDate(earlierDateKey).getTime()) /
      millisecondsPerDay
  );
}

export function daysSince(value: string | Date, timezone?: string | null) {
  const startDateKey = formatDateKey(value, timezone);
  const todayDateKey = toDateInputValue(new Date(), timezone);
  return Math.max(1, differenceInDateKeys(todayDateKey, startDateKey) + 1);
}

export function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number");
  if (!clean.length) {
    return null;
  }
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function percentage(completed: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function numberOrNull(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
