import { buildSupplementLogPayload } from "@/lib/supplement-tracking";
import { createClientSupabaseClient } from "@/lib/supabase/client";
import type { TableInsert, TableRow } from "@/types/supabase";

type TypedSupabase = ReturnType<typeof createClientSupabaseClient>;

type DailyEntryInsert = TableInsert<"daily_entries">;
type DailyChecklistInsert = TableInsert<"daily_checklists">;
type MealTemplateInsert = TableInsert<"meal_templates">;
type SupplementLogInsert = TableInsert<"supplement_logs">;
type UserSettingsInsert = TableInsert<"user_settings">;
type UserSupplementInsert = TableInsert<"user_supplements">;
type ChecklistTemplate = Pick<
  TableRow<"checklist_templates">,
  "template_key" | "is_supplement" | "supplement_slugs"
>;

type SupplementLogMeta = {
  active: boolean;
  id: string;
  slug: string;
};

type MutationError = { message: string } | null;
type MutationUpsertOptions = {
  onConflict?: string;
  ignoreDuplicates?: boolean;
  count?: "exact" | "planned" | "estimated";
  defaultToNull?: boolean;
};
type UpsertableTable<Payload> = {
  upsert: (values: Payload, options?: MutationUpsertOptions) => Promise<{ error: MutationError }>;
};

type MutationState = {
  error: string | null;
};

export type DailyTrackingMutationResult = {
  checklistError: string | null;
  checklistSaved: boolean;
  entryError: string | null;
  entrySaved: boolean;
  status: "failed" | "partial" | "success";
  supplementLogError: string | null;
  supplementLogsSaved: boolean;
};

export type DailyEntryMutationResult = {
  error: string | null;
  saved: boolean;
};

export type DailyChecklistItemMutationResult = {
  checklistError: string | null;
  checklistSaved: boolean;
  status: "failed" | "partial" | "success";
  supplementLogError: string | null;
  supplementLogsSaved: boolean;
};

function getErrorMessage(error: { message: string } | null) {
  return error?.message ?? null;
}

async function upsertUserSettings(
  supabase: TypedSupabase,
  payload: UserSettingsInsert
): Promise<MutationState> {
  const userSettingsTable = supabase.from("user_settings") as unknown as UpsertableTable<UserSettingsInsert>;
  const { error } = await userSettingsTable.upsert(payload, {
    onConflict: "user_id"
  });

  return {
    error: getErrorMessage(error)
  };
}

async function upsertUserSupplements(
  supabase: TypedSupabase,
  payload: UserSupplementInsert[]
): Promise<MutationState> {
  const userSupplementsTable =
    supabase.from("user_supplements") as unknown as UpsertableTable<UserSupplementInsert[]>;
  const { error } = await userSupplementsTable.upsert(payload, {
    onConflict: "user_id,supplement_id"
  });

  return {
    error: getErrorMessage(error)
  };
}

async function syncSupplementLogs(
  supabase: TypedSupabase,
  userId: string,
  entryDate: string,
  checklistTemplates: ChecklistTemplate[],
  checklistState: Record<string, boolean>,
  supplementLogMeta: SupplementLogMeta[]
) {
  const payload: SupplementLogInsert[] = buildSupplementLogPayload({
    checklistState,
    checklistTemplates,
    entryDate,
    supplements: supplementLogMeta,
    userId
  });

  if (!payload.length) {
    return {
      error: null
    };
  }

  const supplementLogsTable =
    supabase.from("supplement_logs") as unknown as UpsertableTable<SupplementLogInsert[]>;
  const { error } = await supplementLogsTable.upsert(payload, {
    onConflict: "user_id,supplement_id,log_date"
  });

  return {
    error: getErrorMessage(error)
  };
}

export async function saveDailyTrackingMutation({
  checklistState,
  checklistTemplates,
  entry,
  entryDate,
  supplementLogMeta,
  supabase,
  userId
}: {
  checklistState: Record<string, boolean>;
  checklistTemplates: ChecklistTemplate[];
  entry: DailyEntryInsert;
  entryDate: string;
  supplementLogMeta: SupplementLogMeta[];
  supabase: TypedSupabase;
  userId: string;
}): Promise<DailyTrackingMutationResult> {
  const dailyEntriesTable =
    supabase.from("daily_entries") as unknown as UpsertableTable<DailyEntryInsert>;
  const { error: entryError } = await dailyEntriesTable.upsert(entry, {
    onConflict: "user_id,entry_date"
  });

  if (entryError) {
    return {
      checklistError: null,
      checklistSaved: false,
      entryError: entryError.message,
      entrySaved: false,
      status: "failed",
      supplementLogError: null,
      supplementLogsSaved: false
    };
  }

  const checklistPayload: DailyChecklistInsert[] = checklistTemplates.map((template) => ({
    completed: checklistState[template.template_key] ?? false,
    entry_date: entryDate,
    template_key: template.template_key,
    user_id: userId
  }));

  const dailyChecklistsTable =
    supabase.from("daily_checklists") as unknown as UpsertableTable<DailyChecklistInsert[]>;
  const { error: checklistError } = await dailyChecklistsTable.upsert(checklistPayload, {
    onConflict: "user_id,entry_date,template_key"
  });

  if (checklistError) {
    return {
      checklistError: checklistError.message,
      checklistSaved: false,
      entryError: null,
      entrySaved: true,
      status: "partial",
      supplementLogError: null,
      supplementLogsSaved: false
    };
  }

  const supplementLogResult = await syncSupplementLogs(
    supabase,
    userId,
    entryDate,
    checklistTemplates,
    checklistState,
    supplementLogMeta
  );

  return {
    checklistError: null,
    checklistSaved: true,
    entryError: null,
    entrySaved: true,
    status: supplementLogResult.error ? "partial" : "success",
    supplementLogError: supplementLogResult.error,
    supplementLogsSaved: !supplementLogResult.error
  };
}

export async function saveDailyEntryMutation({
  entry,
  supabase
}: {
  entry: DailyEntryInsert;
  supabase: TypedSupabase;
}): Promise<DailyEntryMutationResult> {
  const dailyEntriesTable =
    supabase.from("daily_entries") as unknown as UpsertableTable<DailyEntryInsert>;
  const { error } = await dailyEntriesTable.upsert(entry, {
    onConflict: "user_id,entry_date"
  });

  return {
    error: getErrorMessage(error),
    saved: !error
  };
}

export async function saveDailyChecklistItemMutation({
  checked,
  checklistState,
  checklistTemplates,
  entryDate,
  supplementLogMeta,
  supabase,
  templateKey,
  userId
}: {
  checked: boolean;
  checklistState: Record<string, boolean>;
  checklistTemplates: ChecklistTemplate[];
  entryDate: string;
  supplementLogMeta: SupplementLogMeta[];
  supabase: TypedSupabase;
  templateKey: string;
  userId: string;
}): Promise<DailyChecklistItemMutationResult> {
  const checklistItemPayload = {
    completed: checked,
    entry_date: entryDate,
    template_key: templateKey,
    user_id: userId
  } as DailyChecklistInsert;

  const dailyChecklistItemTable =
    supabase.from("daily_checklists") as unknown as UpsertableTable<DailyChecklistInsert>;
  const { error } = await dailyChecklistItemTable.upsert(checklistItemPayload, {
    onConflict: "user_id,entry_date,template_key"
  });

  if (error) {
    return {
      checklistError: error.message,
      checklistSaved: false,
      status: "failed",
      supplementLogError: null,
      supplementLogsSaved: false
    };
  }

  const supplementLogResult = await syncSupplementLogs(
    supabase,
    userId,
    entryDate,
    checklistTemplates,
    checklistState,
    supplementLogMeta
  );

  return {
    checklistError: null,
    checklistSaved: true,
    status: supplementLogResult.error ? "partial" : "success",
    supplementLogError: supplementLogResult.error,
    supplementLogsSaved: !supplementLogResult.error
  };
}

export async function saveDailyChecklistGroupMutation({
  checked,
  checklistState,
  checklistTemplates,
  entryDate,
  supplementLogMeta,
  supabase,
  templateKeys,
  userId
}: {
  checked: boolean;
  checklistState: Record<string, boolean>;
  checklistTemplates: ChecklistTemplate[];
  entryDate: string;
  supplementLogMeta: SupplementLogMeta[];
  supabase: TypedSupabase;
  templateKeys: string[];
  userId: string;
}): Promise<DailyChecklistItemMutationResult> {
  const checklistPayload: DailyChecklistInsert[] = templateKeys.map((templateKey) => ({
    completed: checked,
    entry_date: entryDate,
    template_key: templateKey,
    user_id: userId
  }));

  const dailyChecklistTable =
    supabase.from("daily_checklists") as unknown as UpsertableTable<DailyChecklistInsert[]>;
  const { error } = await dailyChecklistTable.upsert(checklistPayload, {
    onConflict: "user_id,entry_date,template_key"
  });

  if (error) {
    return {
      checklistError: error.message,
      checklistSaved: false,
      status: "failed",
      supplementLogError: null,
      supplementLogsSaved: false
    };
  }

  const supplementLogResult = await syncSupplementLogs(
    supabase,
    userId,
    entryDate,
    checklistTemplates,
    checklistState,
    supplementLogMeta
  );

  return {
    checklistError: null,
    checklistSaved: true,
    status: supplementLogResult.error ? "partial" : "success",
    supplementLogError: supplementLogResult.error,
    supplementLogsSaved: !supplementLogResult.error
  };
}

export async function savePhaseMutation({
  currentPhaseSlug,
  supabase,
  userId
}: {
  currentPhaseSlug: string;
  supabase: TypedSupabase;
  userId: string;
}): Promise<MutationState> {
  return upsertUserSettings(supabase, {
    current_phase_slug: currentPhaseSlug,
    user_id: userId
  });
}

export async function saveSettingsMutation({
  settings,
  supplements,
  supabase,
  userId
}: {
  settings: UserSettingsInsert;
  supplements: UserSupplementInsert[];
  supabase: TypedSupabase;
  userId: string;
}): Promise<MutationState> {
  const settingsResult = await upsertUserSettings(supabase, {
    ...settings,
    user_id: userId
  });

  if (settingsResult.error) {
    return settingsResult;
  }

  return upsertUserSupplements(supabase, supplements);
}

export async function saveSupplementsMutation({
  supplements,
  supabase
}: {
  supplements: UserSupplementInsert[];
  supabase: TypedSupabase;
}): Promise<MutationState> {
  return upsertUserSupplements(supabase, supplements);
}

export async function saveMealTemplatesMutation({
  supabase,
  templates
}: {
  supabase: TypedSupabase;
  templates: MealTemplateInsert[];
}): Promise<MutationState> {
  const mealTemplatesTable =
    supabase.from("meal_templates") as unknown as UpsertableTable<MealTemplateInsert[]>;
  const { error } = await mealTemplatesTable.upsert(templates, {
    onConflict: "user_id,template_key"
  });

  return {
    error: getErrorMessage(error)
  };
}
