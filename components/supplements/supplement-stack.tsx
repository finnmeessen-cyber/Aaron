"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";

import type { SupplementsPageData } from "@/lib/data";
import { saveSupplementsMutation } from "@/lib/mutations";
import {
  getAuthenticatedClientContext,
  notifyAppDataMutation,
  getOfflineMessage,
  isBrowserOffline
} from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { Textarea } from "@/components/ui/textarea";

export function SupplementStack({ items }: SupplementsPageData) {
  const [supplements, setSupplements] = useState(items);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{
    tone: "success" | "warning" | "danger" | "muted";
    message: string | null;
  }>({ tone: "muted", message: null });

  useEffect(() => {
    setSupplements(items);
  }, [items]);

  const activeCount = useMemo(
    () => supplements.filter((supplement) => supplement.active).length,
    [supplements]
  );

  async function saveSupplements() {
    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Aenderungen nach Reconnect speichern.")
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

      const { error } = await saveSupplementsMutation({
        supplements: supplements.map((supplement) => ({
          active: supplement.active,
          custom_dosage: supplement.effectiveDosage,
          custom_timing: supplement.effectiveTiming,
          notes: supplement.effectiveNotes,
          supplement_id: supplement.id,
          user_id: userId
        })),
        supabase
      });

      if (error) {
        setStatus({ tone: "danger", message: error });
        return;
      }

      setStatus({ tone: "success", message: "Supplement-Stack gespeichert." });
      notifyAppDataMutation();
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Aktiver Stack</CardTitle>
            <CardDescription className="mt-2">
              Default-Supplements aus dem Seed sind schon da. Hier steuerst du aktiv, Dosis und Timing.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge>{activeCount} aktiv</Badge>
            <Button variant="secondary" onClick={saveSupplements} disabled={pending}>
              <Save className="mr-2 h-4 w-4" />
              Speichern
            </Button>
          </div>
        </div>
        <StatusMessage tone={status.tone} message={status.message} />
      </Card>

      <div className="grid gap-4">
        {supplements.map((supplement) => (
          <Card key={supplement.id} className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{supplement.name}</CardTitle>
                  <Badge tone="muted">{supplement.category}</Badge>
                </div>
                <CardDescription className="mt-2 max-w-2xl">
                  {supplement.guidance || "Keine zusätzlichen Hinweise hinterlegt."}
                </CardDescription>
              </div>
              <div className="w-full md:w-72">
                <Checkbox
                  checked={supplement.active}
                  onCheckedChange={(checked) =>
                    setSupplements((current) =>
                      current.map((item) =>
                        item.id === supplement.id ? { ...item, active: checked } : item
                      )
                    )
                  }
                  label={supplement.active ? "Aktiv" : "Inaktiv"}
                  description="Im Plan berücksichtigen"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Dosis</label>
                <Input
                  value={supplement.effectiveDosage ?? ""}
                  onChange={(event) =>
                    setSupplements((current) =>
                      current.map((item) =>
                        item.id === supplement.id
                          ? { ...item, effectiveDosage: event.target.value }
                          : item
                      )
                    )
                  }
                  placeholder="z. B. 600 mg"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Timing</label>
                <Input
                  value={supplement.effectiveTiming ?? ""}
                  onChange={(event) =>
                    setSupplements((current) =>
                      current.map((item) =>
                        item.id === supplement.id
                          ? { ...item, effectiveTiming: event.target.value }
                          : item
                      )
                    )
                  }
                  placeholder="z. B. morgens nüchtern"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Hinweise / Notizen</label>
              <Textarea
                className="min-h-24"
                value={supplement.effectiveNotes ?? ""}
                onChange={(event) =>
                  setSupplements((current) =>
                    current.map((item) =>
                      item.id === supplement.id
                        ? {
                          ...item,
                          effectiveNotes: event.target.value
                        }
                        : item
                    )
                  )
                }
                placeholder="Optional: was ist dir wichtig, worauf achtest du, wie reagierst du darauf?"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
