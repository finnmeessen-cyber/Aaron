"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Unplug, UtensilsCrossed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/status-message";
import { notifyAppDataMutation } from "@/lib/supabase/client";
import type { FatSecretConnectionStatus } from "@/lib/fatsecret/types";

type FatSecretSyncCardProps = {
  daily: {
    entries: Array<{
      calories: number | null;
      carbsG: number | null;
      fatG: number | null;
      foodName: string;
      id: string;
      mealType: string;
      proteinG: number | null;
    }>;
    selectedDate: string;
    totals: {
      calories: number | null;
      carbsG: number | null;
      fatG: number | null;
      proteinG: number | null;
    };
  };
  flashStatus?: "connected" | "error" | null;
};

type StatusState = {
  message: string | null;
  tone: "danger" | "muted" | "success" | "warning";
};

type ErrorResponse = {
  error?: string;
};

function isErrorResponse(payload: unknown): payload is ErrorResponse {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

function formatSyncDate(value: string | null) {
  if (!value) {
    return "Noch kein Sync";
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "Noch kein Sync";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatMacro(value: number | null, suffix = "g") {
  if (value === null || value === undefined) {
    return "Offen";
  }

  return suffix ? `${value}${suffix}` : `${value}`;
}

export function FatSecretSyncCard({ daily, flashStatus = null }: FatSecretSyncCardProps) {
  const router = useRouter();
  const [syncStatus, setSyncStatus] = useState<FatSecretConnectionStatus | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [status, setStatus] = useState<StatusState>(() => {
    if (flashStatus === "connected") {
      return {
        message: "FatSecret verbunden. Du kannst jetzt den Nutrition-Sync starten.",
        tone: "success"
      };
    }

    if (flashStatus === "error") {
      return {
        message: "Die FatSecret-Verbindung konnte nicht abgeschlossen werden.",
        tone: "warning"
      };
    }

    return {
      message: null,
      tone: "muted"
    };
  });

  useEffect(() => {
    let active = true;

    async function loadSyncStatus() {
      try {
        const response = await fetch("/api/fatsecret/sync", {
          method: "GET"
        });
        const payload = (await response.json().catch(() => null)) as
          | FatSecretConnectionStatus
          | ErrorResponse
          | null;

        if (!response.ok || !payload || isErrorResponse(payload)) {
          return;
        }

        if (active) {
          setSyncStatus(payload);
        }
      } catch {
        // Keep the initial server totals visible even if status loading fails.
      }
    }

    void loadSyncStatus();

    return () => {
      active = false;
    };
  }, []);

  async function handleSync() {
    setSyncPending(true);
    setStatus({ message: null, tone: "muted" });

    try {
      const response = await fetch("/api/fatsecret/sync", {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            endDate?: string;
            fetchedEntries?: number;
            syncMode?: "incremental" | "initial";
            updatedDailyEntries?: number;
            upsertedEntries?: number;
          }
        | ErrorResponse
        | null;

      if (!response.ok || !payload || isErrorResponse(payload)) {
        setStatus({
          message: isErrorResponse(payload)
            ? payload.error ?? "FatSecret-Sync fehlgeschlagen."
            : "FatSecret-Sync fehlgeschlagen.",
          tone: "danger"
        });
        return;
      }

      const fetchedEntries = payload.fetchedEntries ?? 0;
      const upsertedEntries = payload.upsertedEntries ?? 0;
      const zeroEntrySync = fetchedEntries === 0 && upsertedEntries === 0;

      setStatus({
        message: zeroEntrySync
          ? "FatSecret-Sync abgeschlossen, aber es wurden 0 Nutrition-Einträge importiert. Bitte Datum und Server-Logs prüfen."
          : `FatSecret synchronisiert. ${fetchedEntries} Einträge geladen, ${payload.updatedDailyEntries ?? 0} Tageswerte aktualisiert.`,
        tone: zeroEntrySync ? "warning" : "success"
      });
      setSyncStatus((current) => ({
        connected: true,
        lastSyncedAt: new Date().toISOString(),
        lastSyncedDate: payload.endDate ?? daily.selectedDate,
        lastSyncMode: payload.syncMode ?? (current?.lastSyncedAt ? "incremental" : "initial")
      }));
      notifyAppDataMutation();
      router.refresh();
    } catch {
      setStatus({
        message: "Der FatSecret-Sync konnte nicht abgeschlossen werden.",
        tone: "danger"
      });
    } finally {
      setSyncPending(false);
    }
  }

  async function handleDisconnect() {
    setDisconnectPending(true);
    setStatus({ message: null, tone: "muted" });

    try {
      const response = await fetch("/api/fatsecret/sync", {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as ErrorResponse | null;

      if (!response.ok) {
        setStatus({
          message: payload?.error ?? "Die FatSecret-Verbindung konnte nicht entfernt werden.",
          tone: "danger"
        });
        return;
      }

      setStatus({
        message: "FatSecret-Verbindung entfernt.",
        tone: "success"
      });
      notifyAppDataMutation();
      setSyncStatus({
        connected: false,
        lastSyncedAt: null,
        lastSyncedDate: null,
        lastSyncMode: null
      });
      router.refresh();
    } catch {
      setStatus({
        message: "Die FatSecret-Verbindung konnte nicht entfernt werden.",
        tone: "danger"
      });
    } finally {
      setDisconnectPending(false);
    }
  }

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <UtensilsCrossed className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.32em]">FatSecret</p>
          </div>
          <CardTitle className="mt-3">Nutrition Sync</CardTitle>
          <CardDescription className="mt-2">
            Verbindung serverseitig speichern, Meals importieren und Tages-Makros automatisch in
            `daily_entries` schreiben.
          </CardDescription>
        </div>

        {syncStatus?.connected ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleSync} disabled={syncPending || disconnectPending}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {syncPending ? "Synchronisiert..." : "Jetzt syncen"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDisconnect}
              disabled={syncPending || disconnectPending}
            >
              <Unplug className="mr-2 h-4 w-4" />
              {disconnectPending ? "Trennt..." : "Trennen"}
            </Button>
          </div>
        ) : (
          <Button onClick={() => window.location.assign("/api/fatsecret/connect")}>
            FatSecret verbinden
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-muted px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Status</p>
          <p className="mt-3 text-2xl font-semibold">
            {syncStatus?.connected ? "Verbunden" : "Nicht verbunden"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Letzter Sync: {formatSyncDate(syncStatus?.lastSyncedAt ?? null)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Cursor</p>
          <p className="mt-3 text-2xl font-semibold">
            {syncStatus?.lastSyncedDate ?? daily.selectedDate}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Modus: {syncStatus?.lastSyncMode ?? "initial"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Heute</p>
          <p className="mt-3 text-2xl font-semibold">{daily.entries.length} Entries</p>
          <p className="mt-2 text-sm text-muted-foreground">{daily.selectedDate}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Calories</p>
          <p className="mt-3 text-2xl font-semibold">{formatMacro(daily.totals.calories, "")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Protein</p>
          <p className="mt-3 text-2xl font-semibold">{formatMacro(daily.totals.proteinG)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Carbs</p>
          <p className="mt-3 text-2xl font-semibold">{formatMacro(daily.totals.carbsG)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Fat</p>
          <p className="mt-3 text-2xl font-semibold">{formatMacro(daily.totals.fatG)}</p>
        </div>
      </div>

      {daily.entries.length ? (
        <div className="grid gap-3">
          {daily.entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-border bg-card px-4 py-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{entry.foodName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.28em] text-muted-foreground">
                    {entry.mealType}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatMacro(entry.calories, " kcal")} • P {formatMacro(entry.proteinG)} • C{" "}
                  {formatMacro(entry.carbsG)} • F {formatMacro(entry.fatG)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <StatusMessage tone={status.tone} message={status.message} />
    </Card>
  );
}
