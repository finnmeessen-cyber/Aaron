"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import type { NutritionPageData } from "@/lib/data";
import { saveMealTemplatesMutation } from "@/lib/mutations";
import {
  getAuthenticatedClientContext,
  notifyAppDataMutation,
  getOfflineMessage,
  isBrowserOffline
} from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { Textarea } from "@/components/ui/textarea";

export function NutritionEditor({ mealTemplates, settings }: NutritionPageData) {
  const router = useRouter();
  const [templates, setTemplates] = useState(mealTemplates);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{
    tone: "success" | "warning" | "danger" | "muted";
    message: string | null;
  }>({ tone: "muted", message: null });

  useEffect(() => {
    setTemplates(mealTemplates);
  }, [mealTemplates]);

  const totals = useMemo(
    () =>
      templates.reduce(
        (accumulator, template) => ({
          protein: accumulator.protein + (template.protein_g ?? 0),
          carbs: accumulator.carbs + (template.carbs_g ?? 0),
          fat: accumulator.fat + (template.fat_g ?? 0),
          calories: accumulator.calories + (template.calories ?? 0)
        }),
        { protein: 0, carbs: 0, fat: 0, calories: 0 }
      ),
    [templates]
  );

  async function saveTemplates() {
    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Bitte nach dem Reconnect speichern.")
      });
      return;
    }

    setPending(true);
    setStatus({ tone: "muted", message: null });

    try {
      const { supabase, userId } = await getAuthenticatedClientContext();

      if (!userId) {
        setStatus({ tone: "danger", message: "Session abgelaufen. Bitte erneut einloggen." });
        return;
      }

      const payload = templates.map((template) => ({
        user_id: userId,
        template_key: template.template_key,
        name: template.name,
        meal_slot: template.meal_slot,
        description: template.description,
        protein_g: template.protein_g,
        carbs_g: template.carbs_g,
        fat_g: template.fat_g,
        calories: template.calories,
        notes: template.notes,
        sort_order: template.sort_order
      }));

      const { error } = await saveMealTemplatesMutation({
        supabase,
        templates: payload
      });

      if (error) {
        setStatus({ tone: "danger", message: error });
        return;
      }

      setStatus({ tone: "success", message: "Meal Templates gespeichert." });
      notifyAppDataMutation();
      router.refresh();
    } catch {
      setStatus({
        tone: "danger",
        message: "Speichern fehlgeschlagen. Bitte versuche es erneut."
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Makro-Rahmen</CardTitle>
            <CardDescription className="mt-2">
              Protein rund 170 g, Fett rund 50 g, Rest Carbs. Hier siehst du Plan und Mahlzeiten auf einen Blick.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={saveTemplates} disabled={pending}>
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-muted px-4 py-4">
            <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Training</p>
            <p className="mt-3 text-2xl font-semibold">{settings?.macro_training_calories ?? 3150} kcal</p>
            <p className="mt-2 text-sm text-muted-foreground">
              P {settings?.macro_training_protein ?? 170} / C {settings?.macro_training_carbs ?? 420} / F{" "}
              {settings?.macro_training_fat ?? 50}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted px-4 py-4">
            <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Restday</p>
            <p className="mt-3 text-2xl font-semibold">{settings?.macro_rest_calories ?? 2750} kcal</p>
            <p className="mt-2 text-sm text-muted-foreground">
              P {settings?.macro_rest_protein ?? 170} / C {settings?.macro_rest_carbs ?? 320} / F{" "}
              {settings?.macro_rest_fat ?? 55}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted px-4 py-4">
            <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Template Summe</p>
            <p className="mt-3 text-2xl font-semibold">{totals.calories} kcal</p>
            <p className="mt-2 text-sm text-muted-foreground">
              P {totals.protein} / C {totals.carbs} / F {totals.fat}
            </p>
          </div>
        </div>
        <StatusMessage tone={status.tone} message={status.message} />
      </Card>

      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.template_key} className="space-y-4">
            <div>
              <CardTitle>{template.name}</CardTitle>
              <CardDescription className="mt-2">
                Slot: {template.meal_slot}
              </CardDescription>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Beschreibung</label>
              <Input
                value={template.description ?? ""}
                onChange={(event) =>
                  setTemplates((current) =>
                    current.map((item) =>
                      item.template_key === template.template_key
                        ? { ...item, description: event.target.value }
                        : item
                    )
                  )
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Protein</label>
                <Input
                  inputMode="numeric"
                  value={template.protein_g ?? ""}
                  onChange={(event) =>
                    setTemplates((current) =>
                      current.map((item) =>
                        item.template_key === template.template_key
                          ? { ...item, protein_g: Number(event.target.value) || 0 }
                          : item
                      )
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Carbs</label>
                <Input
                  inputMode="numeric"
                  value={template.carbs_g ?? ""}
                  onChange={(event) =>
                    setTemplates((current) =>
                      current.map((item) =>
                        item.template_key === template.template_key
                          ? { ...item, carbs_g: Number(event.target.value) || 0 }
                          : item
                      )
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fett</label>
                <Input
                  inputMode="numeric"
                  value={template.fat_g ?? ""}
                  onChange={(event) =>
                    setTemplates((current) =>
                      current.map((item) =>
                        item.template_key === template.template_key
                          ? { ...item, fat_g: Number(event.target.value) || 0 }
                          : item
                      )
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kalorien</label>
                <Input
                  inputMode="numeric"
                  value={template.calories ?? ""}
                  onChange={(event) =>
                    setTemplates((current) =>
                      current.map((item) =>
                        item.template_key === template.template_key
                          ? { ...item, calories: Number(event.target.value) || 0 }
                          : item
                      )
                    )
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notizen / Anpassungen</label>
              <Textarea
                className="min-h-24"
                value={template.notes ?? ""}
                onChange={(event) =>
                  setTemplates((current) =>
                    current.map((item) =>
                      item.template_key === template.template_key
                        ? { ...item, notes: event.target.value }
                        : item
                    )
                  )
                }
                placeholder="Optional: Anpassung für Trainingstag, Restday oder Verträglichkeit"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
