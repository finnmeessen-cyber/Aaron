import type { TableInsert, TableRow } from "@/types/supabase";

export const HEVY_PROVIDER = "hevy" as const;
export const HEVY_REQUIRED_COLUMNS = ["title", "start_time", "end_time"] as const;

export type HevyRequiredColumn = (typeof HEVY_REQUIRED_COLUMNS)[number];
export type HevyCsvRecord = Record<string, string>;

export type HevyHeaderMap = Record<HevyRequiredColumn, string>;

export type ParsedHevyCsvRow = {
  rowNumber: number;
  title: string;
  startTime: string;
  endTime: string;
  source: HevyCsvRecord;
};

export type GroupedHevyWorkout = {
  durationMinutes: number;
  endTime: string;
  endedAtIso: string;
  groupKey: string;
  rows: ParsedHevyCsvRow[];
  startedAtIso: string;
  startTime: string;
  title: string;
  workoutDate: string;
};

export type ParseHevyCsvResult = {
  groupedWorkouts: GroupedHevyWorkout[];
  headers: string[];
  parsedRows: ParsedHevyCsvRow[];
};

export type HevyImportSummary = {
  groupedWorkouts: number;
  insertedWorkouts: number;
  parsedRows: number;
  updatedDailyEntries: number;
};

export type HevyImportResult = HevyImportSummary & {
  dataImportId: string;
  duplicateImport: boolean;
};

export type HevyImportMetadata = {
  duplicate_of_import_id: string | null;
  file_hash: string;
  file_name: string | null;
  file_size: number;
  grouped_workouts: number;
  parsed_rows: number;
  skipped_duplicate: boolean;
};

export type DataImportInsert = TableInsert<"data_imports">;
export type DataImportRow = TableRow<"data_imports">;
export type DailyEntryInsert = TableInsert<"daily_entries">;
export type ExistingSourceWorkoutSignature = Pick<
  TableRow<"source_workouts">,
  "duration_minutes" | "started_at" | "title"
>;
export type SourceWorkoutInsert = TableInsert<"source_workouts">;
