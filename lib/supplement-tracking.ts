import type { TableRow } from "@/types/supabase";

type ChecklistTemplate = Pick<
  TableRow<"checklist_templates">,
  "template_key" | "is_supplement" | "supplement_slugs"
>;

type TrackedSupplementMeta = {
  active: boolean;
  id: string;
  slug: string;
};

type ChecklistState = Record<string, boolean>;

export function getTrackedSupplementIds(
  checklistTemplates: ChecklistTemplate[],
  supplements: TrackedSupplementMeta[]
) {
  const supplementBySlug = new Map(supplements.map((supplement) => [supplement.slug, supplement]));
  const trackedIds = new Set<string>();

  for (const template of checklistTemplates) {
    if (!template.is_supplement) {
      continue;
    }

    for (const slug of template.supplement_slugs ?? []) {
      const supplement = supplementBySlug.get(slug);

      if (supplement?.active) {
        trackedIds.add(supplement.id);
      }
    }
  }

  return [...trackedIds];
}

export function buildSupplementLogPayload({
  checklistState,
  checklistTemplates,
  entryDate,
  supplements,
  userId
}: {
  checklistState: ChecklistState;
  checklistTemplates: ChecklistTemplate[];
  entryDate: string;
  supplements: TrackedSupplementMeta[];
  userId: string;
}) {
  const supplementBySlug = new Map(supplements.map((supplement) => [supplement.slug, supplement]));
  const completionBySupplementId = new Map<string, boolean>();

  for (const template of checklistTemplates) {
    if (!template.is_supplement) {
      continue;
    }

    const isCompleted = checklistState[template.template_key] ?? false;

    for (const slug of template.supplement_slugs ?? []) {
      const supplement = supplementBySlug.get(slug);

      if (!supplement?.active) {
        continue;
      }

      completionBySupplementId.set(
        supplement.id,
        Boolean(completionBySupplementId.get(supplement.id) || isCompleted)
      );
    }
  }

  return [...completionBySupplementId.entries()].map(([supplementId, completed]) => ({
    completed,
    log_date: entryDate,
    supplement_id: supplementId,
    user_id: userId
  }));
}
