import type { Json, TableInsert, TableRow } from "@/types/supabase";

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
  providerWorkoutId: string;
  rawSource?: Json | null;
  rows: ParsedHevyCsvRow[];
  sourceKind?: "api" | "csv";
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
  operation: "csv_import";
};

export type HevyApiSyncMode = "full" | "incremental";
export type HevySyncTriggerSource = "manual" | "cron";

export type HevySyncResult = {
  dataImportId: string;
  deletedEventsIgnored: number;
  fetchedWorkouts: number;
  insertedWorkouts: number;
  operation: "api_sync";
  since: string | null;
  syncMode: HevyApiSyncMode;
  triggerSource: HevySyncTriggerSource;
  updatedDailyEntries: number;
};

export type HevyOperationResult = HevyImportResult | HevySyncResult;

export type HevySyncStatus = {
  connected: boolean;
  lastSyncedAt: string | null;
  lastSyncMode: HevyApiSyncMode | null;
};

export type HevyCsvImportMetadata = {
  duplicate_of_import_id: string | null;
  file_hash: string;
  file_name: string | null;
  file_size: number;
  grouped_workouts: number;
  parsed_rows: number;
  skipped_duplicate: boolean;
  source: "csv";
};

export type HevyApiImportMetadata = {
  api_user_id: string | null;
  api_user_name: string | null;
  api_user_url: string | null;
  deleted_events_ignored: number;
  fetched_workouts: number;
  grouped_workouts: number;
  parsed_rows: number;
  since: string | null;
  source: "api";
  sync_mode: HevyApiSyncMode;
  sync_started_at: string;
  trigger_source: HevySyncTriggerSource;
};

export type HevyImportMetadata = HevyCsvImportMetadata | HevyApiImportMetadata;

export type HevyAutoSyncUserResult =
  | {
      fetchedWorkouts: number;
      insertedWorkouts: number;
      since: string | null;
      status: "synced";
      syncMode: HevyApiSyncMode;
      updatedDailyEntries: number;
      userId: string;
    }
  | {
      reason: string;
      status: "failed" | "skipped";
      userId: string;
    };

export type HevyAutoSyncSummary = {
  failed: number;
  fetchedWorkouts: number;
  insertedWorkouts: number;
  processedUsers: number;
  results: HevyAutoSyncUserResult[];
  startedAt: string;
  synced: number;
  updatedDailyEntries: number;
};

export type DataImportInsert = TableInsert<"data_imports">;
export type DataImportRow = TableRow<"data_imports">;
export type DailyEntryInsert = TableInsert<"daily_entries">;
export type ExistingSourceWorkoutSignature = Pick<
  TableRow<"source_workouts">,
  "provider_workout_id"
>;
export type SourceWorkoutInsert = TableInsert<"source_workouts">;
