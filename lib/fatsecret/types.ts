import type { Json, TableInsert, TableRow } from "@/types/supabase";

export const FATSECRET_PROVIDER = "fatsecret" as const;
export const FATSECRET_CONNECT_COOKIE = "fatsecret_oauth" as const;
export const FATSECRET_INITIAL_SYNC_DAYS = 30;
export const FATSECRET_AUTO_SYNC_LIMIT = 20;
export const FATSECRET_MAX_AUTO_SYNC_LIMIT = 50;

export type FatSecretStoredConnection = {
  authSecret: string;
  authToken: string;
  lastSyncedDate: string | null;
};

export type FatSecretConnectionStatus = {
  connected: boolean;
  lastSyncedAt: string | null;
  lastSyncedDate: string | null;
  lastSyncMode: FatSecretSyncMode | null;
};

export type FatSecretConnectCookiePayload = {
  createdAt: string;
  oauthToken: string;
  oauthTokenSecret: string;
  userId: string;
};

export type FatSecretSyncMode = "initial" | "incremental";
export type FatSecretSyncTriggerSource = "manual" | "cron";
export type FatSecretSyncImportStatus = "pending" | "success" | "failed";

export type FatSecretProfile = {
  goalWeightKg: number | null;
  heightCm: number | null;
  heightMeasure: string | null;
  lastWeightComment: string | null;
  lastWeightDateInt: number | null;
  lastWeightKg: number | null;
  weightMeasure: string | null;
};

export type FatSecretMealType = "breakfast" | "lunch" | "dinner" | "snack";

export type FatSecretFoodEntry = {
  calories: number | null;
  carbsG: number | null;
  entryDate: string;
  fatG: number | null;
  foodName: string;
  mealType: FatSecretMealType;
  profileEntryId: string;
  proteinG: number | null;
  rawPayload: Json;
};

export type FatSecretFoodSearchItem = {
  brandName: string | null;
  calories: number | null;
  carbsG: number | null;
  fatG: number | null;
  foodId: string;
  foodName: string;
  foodType: string | null;
  proteinG: number | null;
  servingDescription: string | null;
  servingId: string | null;
};

export type FatSecretFoodSearchResult = {
  foods: FatSecretFoodSearchItem[];
  maxResults: number;
  pageNumber: number;
  totalResults: number;
};

export type FatSecretDailyTotals = {
  calories: number | null;
  carbsG: number | null;
  fatG: number | null;
  proteinG: number | null;
};

export type FatSecretDailyEntryPreview = {
  calories: number | null;
  carbsG: number | null;
  fatG: number | null;
  foodName: string;
  id: string;
  mealType: string;
  proteinG: number | null;
};

export type FatSecretSyncResult = {
  dataImportId: string;
  deletedEntries: number;
  endDate: string;
  fetchedDates: number;
  fetchedEntries: number;
  operation: "api_sync";
  since: string | null;
  startDate: string;
  syncMode: FatSecretSyncMode;
  triggerSource: FatSecretSyncTriggerSource;
  updatedDailyEntries: number;
  upsertedEntries: number;
};

export type FatSecretAutoSyncUserResult =
  | {
      deletedEntries: number;
      endDate: string;
      fetchedEntries: number;
      startDate: string;
      status: "synced";
      syncMode: FatSecretSyncMode;
      updatedDailyEntries: number;
      upsertedEntries: number;
      userId: string;
    }
  | {
      reason: string;
      status: "failed" | "skipped";
      userId: string;
    };

export type FatSecretAutoSyncSummary = {
  deletedEntries: number;
  failed: number;
  fetchedEntries: number;
  processedUsers: number;
  results: FatSecretAutoSyncUserResult[];
  startedAt: string;
  synced: number;
  updatedDailyEntries: number;
  upsertedEntries: number;
};

export type FatSecretApiImportMetadata = {
  deleted_entries: number;
  end_date: string;
  fetched_dates: number;
  fetched_entries: number;
  last_synced_date: string | null;
  source: "api";
  start_date: string;
  sync_completed_at: string | null;
  sync_error: string | null;
  sync_failed_at: string | null;
  sync_mode: FatSecretSyncMode;
  sync_started_at: string;
  sync_status: FatSecretSyncImportStatus;
  trigger_source: FatSecretSyncTriggerSource;
  updated_daily_entries: number;
  upserted_entries: number;
};

export type DataImportInsert = TableInsert<"data_imports">;
export type DataImportRow = TableRow<"data_imports">;
export type DailyEntryInsert = TableInsert<"daily_entries">;
export type SourceNutritionEntryInsert = TableInsert<"source_nutrition_entries">;
export type SourceNutritionEntryRow = TableRow<"source_nutrition_entries">;
