import { createHash } from "node:crypto";

import { parse as parseCsv } from "csv-parse/sync";
import { differenceInMinutes, isValid, parse, parseISO } from "date-fns";
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
const HEVY_DELIMITER_OPTIONS = [
  { label: "tab", value: "\t" },
  { label: "comma", value: "," },
  { label: "semicolon", value: ";" }
] as const;

const HEVY_DATE_FORMATS = [
  "d MMM yyyy, HH:mm",
  "dd MMM yyyy, HH:mm",
  "d MMM yyyy, H:mm",
  "dd MMM yyyy, H:mm",
  "d MMM yyyy, HH:mm:ss",
  "dd MMM yyyy, HH:mm:ss",
  "d MMMM yyyy, HH:mm",
  "dd MMMM yyyy, HH:mm",
  "d MMMM yyyy, H:mm",
  "dd MMMM yyyy, H:mm",
  "d MMMM yyyy, HH:mm:ss",
  "dd MMMM yyyy, HH:mm:ss",
  "MMM d yyyy, HH:mm",
  "MMM d, yyyy, HH:mm",
  "MMM d yyyy, H:mm",
  "MMM d, yyyy, H:mm",
  "MMMM d yyyy, HH:mm",
  "MMMM d, yyyy, HH:mm",
  "MMMM d yyyy, H:mm",
  "MMMM d, yyyy, H:mm",
  "MMM d yyyy, h:mm a",
  "MMM d, yyyy, h:mm a",
  "MMMM d yyyy, h:mm a",
  "MMMM d, yyyy, h:mm a",
  "MMM d yyyy, hh:mm a",
  "MMM d, yyyy, hh:mm a",
  "MMMM d yyyy, hh:mm a",
  "MMMM d, yyyy, hh:mm a",
  "d/M/yyyy, HH:mm",
  "dd/MM/yyyy, HH:mm",
  "d/M/yyyy HH:mm",
  "dd/MM/yyyy HH:mm",
  "d/M/yyyy, H:mm",
  "dd/MM/yyyy, H:mm",
  "d.M.yyyy, HH:mm",
  "dd.MM.yyyy, HH:mm",
  "d.M.yyyy HH:mm",
  "dd.MM.yyyy HH:mm",
  "M/d/yyyy, HH:mm",
  "MM/dd/yyyy, HH:mm",
  "M/d/yyyy HH:mm",
  "MM/dd/yyyy HH:mm",
  "M/d/yyyy, h:mm a",
  "MM/dd/yyyy, h:mm a",
  "M/d/yyyy h:mm a",
  "MM/dd/yyyy h:mm a",
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm"
] as const;

const HEVY_TIMESTAMP_EXAMPLES = [
  "21 Apr 2026, 18:30",
  "Apr 21, 2026, 6:30 PM",
  "21/04/2026 18:30"
] as const;

type ParsedTimestamp = {
  date: Date;
  dateKey: string;
  iso: string;
};
type HevyDelimiter = (typeof HEVY_DELIMITER_OPTIONS)[number]["value"];
type DelimiterDetectionResult = {
  delimiter: HevyDelimiter;
  headers: string[];
  label: (typeof HEVY_DELIMITER_OPTIONS)[number]["label"];
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

function parseHeaderRow(fileText: string, delimiter: HevyDelimiter) {
  const rows = parseCsv(fileText, {
    bom: true,
    delimiter,
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

function createNormalizedHeaderMap(headers: string[]) {
  const normalizedToOriginal = new Map<string, string>();

  for (const header of headers) {
    normalizedToOriginal.set(normalizeHeader(header), header);
  }

  return normalizedToOriginal;
}

function resolveRequiredColumn(
  headers: Map<string, string>,
  column: HevyRequiredColumn
) {
  return HEVY_HEADER_ALIASES[column]
    .map((alias) => headers.get(normalizeHeader(alias)))
    .find((value): value is string => Boolean(value));
}

function countResolvedRequiredColumns(headers: string[]) {
  const normalizedToOriginal = createNormalizedHeaderMap(headers);

  return HEVY_REQUIRED_COLUMNS.filter((column) =>
    Boolean(resolveRequiredColumn(normalizedToOriginal, column))
  ).length;
}

function resolveRequiredColumns(headers: string[]): HevyHeaderMap {
  if (!headers.length) {
    throw new HevyImportError("The uploaded file is missing a header row.");
  }

  const normalizedToOriginal = createNormalizedHeaderMap(headers);

  const resolvedEntries = HEVY_REQUIRED_COLUMNS.map((column) => {
    const resolvedHeader = resolveRequiredColumn(normalizedToOriginal, column);

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

function detectHevyDelimiter(fileText: string): DelimiterDetectionResult {
  let bestMatch: DelimiterDetectionResult & { matchedColumns: number } | null = null;

  for (const delimiterOption of HEVY_DELIMITER_OPTIONS) {
    try {
      const headers = parseHeaderRow(fileText, delimiterOption.value);

      if (!headers.length) {
        continue;
      }

      const matchedColumns = countResolvedRequiredColumns(headers);
      const match = {
        delimiter: delimiterOption.value,
        headers,
        label: delimiterOption.label,
        matchedColumns
      };

      if (matchedColumns === HEVY_REQUIRED_COLUMNS.length) {
        return match;
      }

      if (!bestMatch || matchedColumns > bestMatch.matchedColumns) {
        bestMatch = match;
      }
    } catch {
      continue;
    }
  }

  if (bestMatch && bestMatch.matchedColumns > 0) {
    return bestMatch;
  }

  throw new HevyImportError(
    "Unable to detect the file structure. Expected a tab-, comma-, or semicolon-delimited Hevy export with title, start_time, and end_time headers."
  );
}

function parseDelimitedRecords(fileText: string, delimiter: HevyDelimiter, delimiterLabel: string) {
  try {
    return parseCsv(fileText, {
      bom: true,
      columns: true,
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    }) as Array<Record<string, unknown>>;
  } catch {
    throw new HevyImportError(
      `Unable to parse the uploaded ${delimiterLabel}-delimited file. Please re-export the Hevy file and try again.`
    );
  }
}

function parseHevyTimestamp(
  value: string,
  rowNumber: number,
  columnName: HevyRequiredColumn
): ParsedTimestamp {
  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue
    .replace(/^"|"$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ");

  if (!trimmedValue) {
    throw new HevyImportError(`Row ${rowNumber} is missing a value for ${columnName}.`);
  }

  const hasExplicitOffset = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(normalizedValue);
  const isoCandidate = hasExplicitOffset ? parseISO(normalizedValue) : null;

  if (isoCandidate && isValid(isoCandidate)) {
    return buildOffsetAwareTimestamp(isoCandidate);
  }

  for (const dateFormat of HEVY_DATE_FORMATS) {
    const parsedDate = parse(normalizedValue, dateFormat, new Date(), {
      locale: enUS
    });

    if (!isValid(parsedDate)) {
      continue;
    }

    return buildWallClockTimestamp(parsedDate);
  }

  throw new HevyImportError(
    `Row ${rowNumber} has an invalid ${columnName} value: "${trimmedValue}". Expected a timestamp like ${HEVY_TIMESTAMP_EXAMPLES.map((example) => `"${example}"`).join(", ")}.`
  );
}

function buildWallClockTimestamp(parsedDate: Date): ParsedTimestamp {
  // Hevy exports naive local timestamps in many human-readable formats. We normalize the
  // parsed wall-clock date into UTC so grouping, duration, and workout_date remain stable
  // regardless of the server timezone.
  const stableUtcDate = new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      parsedDate.getHours(),
      parsedDate.getMinutes(),
      parsedDate.getSeconds(),
      parsedDate.getMilliseconds()
    )
  );

  return {
    date: stableUtcDate,
    dateKey: stableUtcDate.toISOString().slice(0, 10),
    iso: stableUtcDate.toISOString()
  };
}

function buildOffsetAwareTimestamp(parsedDate: Date): ParsedTimestamp {
  return {
    date: parsedDate,
    dateKey: parsedDate.toISOString().slice(0, 10),
    iso: parsedDate.toISOString()
  };
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
    const { delimiter, headers, label } = detectHevyDelimiter(fileText);
    const requiredColumns = resolveRequiredColumns(headers);
    const rawRecords = parseDelimitedRecords(fileText, delimiter, label);

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
