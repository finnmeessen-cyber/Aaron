import { createHash } from "node:crypto";

import { parse as parseCsv } from "csv-parse/sync";
import { differenceInMinutes, format, isValid, parse } from "date-fns";
import { enUS } from "date-fns/locale";

import {
  HEVY_REQUIRED_COLUMNS,
  type GroupedHevyWorkout,
  type HevyCsvRecord,
  type HevyHeaderMap,
  type HevyRequiredColumn,
  type ParseHevyCsvResult,
  type ParsedHevyCsvRow
} from "@/lib/hevy/types";

const HEVY_HEADER_ALIASES: Record<HevyRequiredColumn, string[]> = {
  end_time: ["end_time", "end time", "ended_at", "ended at", "end"],
  start_time: ["start_time", "start time", "started_at", "started at", "start"],
  title: ["title", "workout_title", "workout title", "workout_name", "workout name", "workout"]
};

const HEVY_DATE_FORMATS = [
  "dd MMM yyyy, HH:mm",
  "d MMM yyyy, HH:mm",
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm"
] as const;

type ParsedTimestamp = {
  date: Date;
  dateKey: string;
  iso: string;
};

export class HevyImportError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "HevyImportError";
    this.status = status;
  }
}

function buildProviderWorkoutId(row: ParsedHevyCsvRow) {
  return createHash("sha256")
    .update(
      [row.title.trim().toLowerCase(), row.startTime.trim(), row.endTime.trim()].join("::")
    )
    .digest("hex");
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getCsvHeaders(fileText: string) {
  const rows = parseCsv(fileText, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    to_line: 1,
    trim: true
  }) as string[][];

  return rows[0] ?? [];
}

function toCsvRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, typeof value === "string" ? value : ""])
  ) as HevyCsvRecord;
}

function resolveRequiredColumns(headers: string[]): HevyHeaderMap {
  if (!headers.length) {
    throw new HevyImportError("The uploaded file is missing a CSV header row.");
  }

  const normalizedToOriginal = new Map<string, string>();

  for (const header of headers) {
    normalizedToOriginal.set(normalizeHeader(header), header);
  }

  const resolvedEntries = HEVY_REQUIRED_COLUMNS.map((column) => {
    const resolvedHeader = HEVY_HEADER_ALIASES[column]
      .map((alias) => normalizedToOriginal.get(normalizeHeader(alias)))
      .find((value): value is string => Boolean(value));

    if (!resolvedHeader) {
      return null;
    }

    return [column, resolvedHeader] as const;
  });

  const missingColumns = HEVY_REQUIRED_COLUMNS.filter((column, index) => !resolvedEntries[index]);

  if (missingColumns.length) {
    throw new HevyImportError(
      `The uploaded CSV is missing required columns: ${missingColumns.join(", ")}.`
    );
  }

  const resolvedColumns = resolvedEntries.filter(
    (entry): entry is readonly [HevyRequiredColumn, string] => Boolean(entry)
  );

  return Object.fromEntries(resolvedColumns) as HevyHeaderMap;
}

function parseHevyTimestamp(
  value: string,
  rowNumber: number,
  columnName: HevyRequiredColumn
): ParsedTimestamp {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new HevyImportError(`Row ${rowNumber} is missing a value for ${columnName}.`);
  }

  for (const dateFormat of HEVY_DATE_FORMATS) {
    const parsedDate = parse(trimmedValue, dateFormat, new Date(), {
      locale: enUS
    });

    if (!isValid(parsedDate)) {
      continue;
    }

    // Hevy exports naive local timestamps, so we persist the same wall-clock values in UTC
    // to avoid server-timezone-dependent drift when deriving dates and durations.
    const stableUtcDate = new Date(
      Date.UTC(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate(),
        parsedDate.getHours(),
        parsedDate.getMinutes(),
        parsedDate.getSeconds()
      )
    );

    return {
      date: stableUtcDate,
      dateKey: format(parsedDate, "yyyy-MM-dd"),
      iso: stableUtcDate.toISOString()
    };
  }

  throw new HevyImportError(
    `Row ${rowNumber} has an invalid ${columnName} value: "${trimmedValue}".`
  );
}

function buildWorkoutGroupKey(row: ParsedHevyCsvRow, startedAtIso: string, endedAtIso: string) {
  return [row.title.trim().toLowerCase(), startedAtIso, endedAtIso].join("::");
}

export function groupHevyRows(rows: ParsedHevyCsvRow[]) {
  const groupedWorkouts = new Map<string, GroupedHevyWorkout>();

  for (const row of rows) {
    const startTimestamp = parseHevyTimestamp(row.startTime, row.rowNumber, "start_time");
    const endTimestamp = parseHevyTimestamp(row.endTime, row.rowNumber, "end_time");

    if (endTimestamp.date.getTime() < startTimestamp.date.getTime()) {
      throw new HevyImportError(
        `Row ${row.rowNumber} has an end_time that is earlier than start_time.`
      );
    }

    const durationMinutes = differenceInMinutes(endTimestamp.date, startTimestamp.date);
    const groupKey = buildWorkoutGroupKey(row, startTimestamp.iso, endTimestamp.iso);
    const existingWorkout = groupedWorkouts.get(groupKey);

    if (existingWorkout) {
      existingWorkout.rows.push(row);
      continue;
    }

    groupedWorkouts.set(groupKey, {
      durationMinutes,
      endTime: row.endTime,
      endedAtIso: endTimestamp.iso,
      groupKey,
      providerWorkoutId: buildProviderWorkoutId(row),
      rows: [row],
      startedAtIso: startTimestamp.iso,
      startTime: row.startTime,
      title: row.title,
      workoutDate: startTimestamp.dateKey
    });
  }

  return Array.from(groupedWorkouts.values()).sort((left, right) => {
    return left.startedAtIso.localeCompare(right.startedAtIso) || left.title.localeCompare(right.title);
  });
}

export function parseHevyCsv(fileText: string): ParseHevyCsvResult {
  if (!fileText.trim()) {
    throw new HevyImportError("The uploaded CSV file is empty.");
  }

  try {
    const headers = getCsvHeaders(fileText);
    const requiredColumns = resolveRequiredColumns(headers);
    const rawRecords = parseCsv(fileText, {
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    }) as Array<Record<string, unknown>>;

    if (!rawRecords.length) {
      throw new HevyImportError("The uploaded CSV does not contain any workout rows.");
    }

    const parsedRows = rawRecords.map((record, index) => {
      const rowNumber = index + 2;
      const source = toCsvRecord(record);
      const title = source[requiredColumns.title]?.trim() ?? "";
      const startTime = source[requiredColumns.start_time]?.trim() ?? "";
      const endTime = source[requiredColumns.end_time]?.trim() ?? "";

      if (!title || !startTime || !endTime) {
        const missingFields = [
          !title ? "title" : null,
          !startTime ? "start_time" : null,
          !endTime ? "end_time" : null
        ].filter((value): value is string => Boolean(value));

        throw new HevyImportError(
          `Row ${rowNumber} is missing required values: ${missingFields.join(", ")}.`
        );
      }

      return {
        endTime,
        rowNumber,
        source,
        startTime,
        title
      };
    });

    return {
      groupedWorkouts: groupHevyRows(parsedRows),
      headers,
      parsedRows
    };
  } catch (error) {
    if (error instanceof HevyImportError) {
      throw error;
    }

    throw new HevyImportError(
      "Unable to read the uploaded CSV. Please export the file again from Hevy and try once more."
    );
  }
}
