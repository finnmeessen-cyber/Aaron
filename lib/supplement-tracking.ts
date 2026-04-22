import type { TableRow } from "@/types/supabase";

type BaseChecklistTemplate = Pick<
  TableRow<"checklist_templates">,
  "template_key" | "is_supplement" | "supplement_slugs"
>;

type ChecklistTemplateWithSection = BaseChecklistTemplate &
  Pick<TableRow<"checklist_templates">, "section">;

type TrackedSupplementMeta = {
  active: boolean;
  id: string;
  slug: string;
};

type ChecklistState = Record<string, boolean>;

type TrackedSupplementSection = {
  section: string;
  supplementIds: string[];
  templateKeys: string[];
};

function buildActiveSupplementMap(supplements: TrackedSupplementMeta[]) {
  return new Map(supplements.map((supplement) => [supplement.slug, supplement]));
}

function getActiveSupplementIdsForTemplate(
  template: BaseChecklistTemplate,
  supplementBySlug: Map<string, TrackedSupplementMeta>
) {
  if (!template.is_supplement) {
    return [];
  }

  const trackedIds = new Set<string>();

  for (const slug of template.supplement_slugs ?? []) {
    const supplement = supplementBySlug.get(slug);

    if (supplement?.active) {
      trackedIds.add(supplement.id);
    }
  }

  return [...trackedIds];
}

export function getTrackedSupplementIds<TTemplate extends BaseChecklistTemplate>(
  checklistTemplates: TTemplate[],
  supplements: TrackedSupplementMeta[]
) {
  const supplementBySlug = buildActiveSupplementMap(supplements);
  const trackedIds = new Set<string>();

  for (const template of checklistTemplates) {
    for (const supplementId of getActiveSupplementIdsForTemplate(template, supplementBySlug)) {
      trackedIds.add(supplementId);
    }
  }

  return [...trackedIds];
}

export function filterChecklistTemplatesByActiveSupplements<TTemplate extends BaseChecklistTemplate>(
  checklistTemplates: TTemplate[],
  supplements: TrackedSupplementMeta[]
) {
  const supplementBySlug = buildActiveSupplementMap(supplements);

  return checklistTemplates.filter((template) => {
    if (!template.is_supplement) {
      return true;
    }

    return getActiveSupplementIdsForTemplate(template, supplementBySlug).length > 0;
  });
}

export function getTrackedSupplementSections(
  checklistTemplates: ChecklistTemplateWithSection[],
  supplements: TrackedSupplementMeta[]
) {
  const supplementBySlug = buildActiveSupplementMap(supplements);
  const sections = new Map<
    string,
    {
      supplementIds: Set<string>;
      templateKeys: Set<string>;
    }
  >();

  for (const template of checklistTemplates) {
    const supplementIds = getActiveSupplementIdsForTemplate(template, supplementBySlug);

    if (!supplementIds.length) {
      continue;
    }

    const sectionState = sections.get(template.section) ?? {
      supplementIds: new Set<string>(),
      templateKeys: new Set<string>()
    };

    sectionState.templateKeys.add(template.template_key);

    for (const supplementId of supplementIds) {
      sectionState.supplementIds.add(supplementId);
    }

    sections.set(template.section, sectionState);
  }

  return [...sections.entries()].map(
    ([section, value]) =>
      ({
        section,
        supplementIds: [...value.supplementIds],
        templateKeys: [...value.templateKeys]
      }) satisfies TrackedSupplementSection
  );
}

export function buildSupplementLogPayload({
  checklistState,
  checklistTemplates,
  entryDate,
  supplements,
  userId
}: {
  checklistState: ChecklistState;
  checklistTemplates: BaseChecklistTemplate[];
  entryDate: string;
  supplements: TrackedSupplementMeta[];
  userId: string;
}) {
  const supplementBySlug = buildActiveSupplementMap(supplements);
  const completionBySupplementId = new Map<string, boolean>();

  for (const template of checklistTemplates) {
    const isCompleted = checklistState[template.template_key] ?? false;

    for (const supplementId of getActiveSupplementIdsForTemplate(template, supplementBySlug)) {
      completionBySupplementId.set(
        supplementId,
        Boolean(completionBySupplementId.get(supplementId) || isCompleted)
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
