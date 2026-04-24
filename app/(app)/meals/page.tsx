import { PageHeader } from "@/components/app-shell/page-header";
import { PageShell } from "@/components/app-shell/page-shell";
import { NutritionEditor } from "@/components/nutrition/nutrition-editor";
import { SetupRequired } from "@/components/ui/setup-required";
import { getNutritionPageData } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MealsPage({
  searchParams
}: {
  searchParams?: {
    fatsecret?: string;
  };
}) {
  if (!hasSupabaseEnv()) {
    return <SetupRequired />;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const data = await getNutritionPageData(supabase, user.id);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Meals"
        title="FatSecret"
        description="FatSecret ist der dedizierte Bereich für synced Meals und Tagesmakros."
      />
      <NutritionEditor
        {...data}
        fatsecretFlashStatus={
          searchParams?.fatsecret === "connected" || searchParams?.fatsecret === "error"
            ? searchParams.fatsecret
            : null
        }
      />
    </PageShell>
  );
}
