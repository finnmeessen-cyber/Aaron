"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import type { PhasesPageData } from "@/lib/data";
import { savePhaseMutation } from "@/lib/mutations";
import {
  getAuthenticatedClientContext,
  notifyAppDataMutation,
  getOfflineMessage,
  isBrowserOffline
} from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/status-message";

export function PhaseSelector({ phases, currentPhaseSlug }: PhasesPageData) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentPhaseSlug ?? phases[0]?.slug ?? "");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{
    tone: "success" | "warning" | "danger" | "muted";
    message: string | null;
  }>({ tone: "muted", message: null });

  useEffect(() => {
    setSelected(currentPhaseSlug ?? phases[0]?.slug ?? "");
  }, [currentPhaseSlug, phases]);

  async function savePhase() {
    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Nach dem Reconnect erneut speichern.")
      });
      return;
    }

    if (!selected) {
      setStatus({ tone: "warning", message: "Bitte wähle zuerst eine Phase." });
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

      const phaseChanged = selected !== currentPhaseSlug;
      const { error } = await savePhaseMutation({
        currentPhaseSlug: selected,
        supabase,
        userId
      });

      if (error) {
        setStatus({ tone: "danger", message: error });
        return;
      }

      setStatus({ tone: "success", message: "Aktuelle Phase gespeichert." });
      notifyAppDataMutation();

      if (phaseChanged) {
        router.refresh();
      }
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
            <CardTitle>Phase wählen</CardTitle>
            <CardDescription className="mt-2">
              Die aktuelle Phase wird im Dashboard angezeigt und beeinflusst dein mentales Setup.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={savePhase} disabled={pending}>
            <Save className="mr-2 h-4 w-4" />
            Phase speichern
          </Button>
        </div>
        <StatusMessage tone={status.tone} message={status.message} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {phases.map((phase) => {
          const isActive = phase.slug === selected;
          return (
            <Card
              key={phase.id}
              className={`space-y-5 ${isActive ? "border-primary/50 bg-primary/5" : ""}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone={isActive ? "default" : "muted"}>
                    {isActive ? "Aktiv" : "Verfügbar"}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setSelected(phase.slug)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                  >
                    Auswählen
                  </button>
                </div>
                <CardTitle>{phase.name}</CardTitle>
                <CardDescription>{phase.summary}</CardDescription>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-muted px-4 py-4">
                <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Ziel</p>
                <p className="text-sm leading-6">{phase.objective}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                  Aktive Supplements
                </p>
                <div className="space-y-3">
                  {phase.supplements.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.supplement?.name ?? "Supplement"}</span>
                        <Badge tone="muted">{item.timing || item.supplement?.timing || "Timing offen"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {item.dosage || item.supplement?.dosage || "Dosis offen"}
                      </p>
                      {item.notes ? (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.notes}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {phase.guidance ? (
                <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm leading-6 text-muted-foreground">
                  {phase.guidance}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
