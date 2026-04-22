"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, Upload } from "lucide-react";

import type {
  HevyOperationResult,
  HevySyncStatus
} from "@/lib/hevy/types";
import {
  notifyAppDataMutation,
  getOfflineMessage,
  isBrowserOffline
} from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";

type StatusState = {
  tone: "success" | "warning" | "danger" | "muted";
  message: string | null;
};

type ErrorResponse = {
  error?: string;
};

type HevyCsvUploadProps = {
  onCompleted?: () => void;
  title?: string;
  description?: string | null;
  hint?: string | null;
  variant?: "default" | "compact";
};

function getErrorMessage(payload: unknown) {
  if (typeof payload === "object" && payload && "error" in payload) {
    return (payload as ErrorResponse).error ?? null;
  }

  return null;
}

function SummaryMetric({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted px-4 py-4">
      <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function formatSyncDate(value: string) {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildResultDescription(result: HevyOperationResult) {
  if (result.operation === "api_sync") {
    return result.deletedEventsIgnored > 0
      ? `${result.deletedEventsIgnored} gelöschte Hevy-Events wurden im MVP übersprungen.`
      : "Die neuesten Hevy-Workouts wurden mit deinem Tracker abgeglichen.";
  }

  return result.duplicateImport
    ? "Die Datei wurde erkannt und sicher übersprungen. Dein bestehender Datenstand bleibt unverändert."
    : "Die Hevy-Daten wurden verarbeitet und in deinen Trainingsverlauf übernommen.";
}

export function HevyCsvUpload({
  description = "Sync direkt per Hevy API oder lade deinen Hevy Workout-Export als CSV hoch.",
  hint = "Exportiere die Datei in Hevy unter Profile → Settings → Export & Import Data → Export Workouts.",
  onCompleted,
  title = "Hevy Import",
  variant = "default"
}: HevyCsvUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [importPending, setImportPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [result, setResult] = useState<HevyOperationResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<HevySyncStatus | null>(null);
  const [status, setStatus] = useState<StatusState>({
    tone: "muted",
    message: null
  });

  async function loadSyncStatus() {
    try {
      const response = await fetch("/api/hevy/sync", {
        method: "GET"
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as HevySyncStatus | null;

      if (payload) {
        setSyncStatus(payload);
      }
    } catch {
      return;
    }
  }

  useEffect(() => {
    void loadSyncStatus();
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setResult(null);
    setStatus({ tone: "muted", message: null });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Import bitte nach dem Reconnect erneut starten.")
      });
      return;
    }

    if (!file) {
      setStatus({
        tone: "warning",
        message: "Bitte wähle zuerst eine Hevy CSV-Datei aus."
      });
      return;
    }

    setImportPending(true);
    setResult(null);
    setStatus({ tone: "muted", message: null });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/hevy/import", {
        body: formData,
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as HevyOperationResult | ErrorResponse | null;

      if (!response.ok) {
        setStatus({
          tone: "danger",
          message: getErrorMessage(payload) ?? "Der Hevy-Import ist fehlgeschlagen."
        });
        return;
      }

      const importResult = payload as HevyOperationResult;
      setResult(importResult);
      notifyAppDataMutation();
      onCompleted?.();
      setStatus({
        tone:
          importResult.operation === "csv_import" && importResult.duplicateImport
            ? "warning"
            : "success",
        message:
          importResult.operation === "csv_import" && importResult.duplicateImport
            ? "Diese Datei wurde bereits importiert. Der Upload wurde sicher erkannt und keine neuen Workouts wurden angelegt."
            : "Hevy CSV erfolgreich importiert. Trainingstage wurden in deinem Tracker markiert."
      });
    } catch {
      setStatus({
        tone: "danger",
        message: "Der Upload konnte nicht abgeschlossen werden. Bitte versuche es erneut."
      });
    } finally {
      setImportPending(false);
    }
  }

  async function handleSync() {
    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Sync bitte nach dem Reconnect erneut starten.")
      });
      return;
    }

    setSyncPending(true);
    setResult(null);
    setStatus({ tone: "muted", message: null });

    try {
      const response = await fetch("/api/hevy/sync", {
        body: JSON.stringify(apiKey.trim() ? { apiKey } : {}),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as HevyOperationResult | ErrorResponse | null;

      if (!response.ok) {
        setStatus({
          tone: "danger",
          message: getErrorMessage(payload) ?? "Der Hevy-Sync ist fehlgeschlagen."
        });
        return;
      }

      const syncResult = payload as HevyOperationResult;
      setApiKey("");
      setResult(syncResult);
      notifyAppDataMutation();
      onCompleted?.();
      setStatus({
        tone: "success",
        message: syncStatus?.connected
          ? "Hevy erfolgreich synchronisiert."
          : "Hevy verbunden und synchronisiert."
      });
      await loadSyncStatus();
    } catch {
      setStatus({
        tone: "danger",
        message: "Der Hevy-Sync konnte nicht abgeschlossen werden. Bitte versuche es erneut."
      });
    } finally {
      setSyncPending(false);
    }
  }

  async function handleDisconnect() {
    if (isBrowserOffline()) {
      setStatus({
        tone: "warning",
        message: getOfflineMessage("Verbindung bitte nach dem Reconnect erneut entfernen.")
      });
      return;
    }

    setStatus({ tone: "muted", message: null });

    try {
      const response = await fetch("/api/hevy/sync", {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as ErrorResponse | null;

      if (!response.ok) {
        setStatus({
          tone: "danger",
          message: getErrorMessage(payload) ?? "Die Hevy-Verbindung konnte nicht entfernt werden."
        });
        return;
      }

      setApiKey("");
      setResult(null);
      setSyncStatus((current) =>
        current
          ? {
              ...current,
              connected: false
            }
          : {
              connected: false,
              lastSyncedAt: null,
              lastSyncMode: null
            }
      );
      setStatus({
        tone: "success",
        message: "Der gespeicherte Hevy API Key wurde entfernt."
      });
    } catch {
      setStatus({
        tone: "danger",
        message: "Die Hevy-Verbindung konnte nicht entfernt werden."
      });
    }
  }

  function resetSelection() {
    setFile(null);
    setResult(null);
    setStatus({ tone: "muted", message: null });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-5 p-5 md:p-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <CardTitle className={variant === "compact" ? "text-lg" : "text-xl"}>
                {title}
              </CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
            {variant === "default" ? (
              <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                Hevy API + CSV fallback
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-muted/60 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Sync Hevy</p>
                {variant === "default" ? (
                  <p className="text-sm text-muted-foreground">
                    API-Key einmal eingeben, serverseitig speichern und Workouts direkt
                    synchronisieren.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                {syncStatus?.connected ? (
                  <span className="rounded-full border border-border bg-background px-3 py-1 text-foreground">
                    Verbunden
                  </span>
                ) : (
                  <span className="rounded-full border border-border bg-background px-3 py-1">
                    Nicht verbunden
                  </span>
                )}
                {syncStatus?.lastSyncedAt ? (
                  <span className="rounded-full border border-border bg-background px-3 py-1 normal-case tracking-normal">
                    {formatSyncDate(syncStatus.lastSyncedAt)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="hevy-api-key">
                Hevy API Key
              </label>
              <Input
                id="hevy-api-key"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                placeholder={
                  syncStatus?.connected
                    ? "Leer lassen, um den gespeicherten Key zu verwenden"
                    : "Hevy API Key"
                }
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              {variant === "default" ? (
                <p className="text-sm text-muted-foreground">
                  Den Key findest du in Hevy unter <span className="font-medium text-foreground">hevy.com/settings?developer</span>.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="sm:min-w-44"
                disabled={syncPending}
                onClick={() => void handleSync()}
                type="button"
              >
                {syncPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Sync läuft
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Hevy
                  </>
                )}
              </Button>
              {syncStatus?.connected ? (
                <Button
                  disabled={syncPending}
                  onClick={() => void handleDisconnect()}
                  type="button"
                  variant="secondary"
                >
                  Verbindung entfernen
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="h-px bg-border/70" />

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">CSV Fallback</p>
              {variant === "default" ? (
                <p className="text-sm text-muted-foreground">
                  Verwende den Export aus Hevy, wenn du lieber per Datei importierst.
                </p>
              ) : null}
            </div>
            {variant === "default" ? (
              <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                Benötigt: <span className="font-medium text-foreground">title</span>,{" "}
                <span className="font-medium text-foreground">start_time</span>,{" "}
                <span className="font-medium text-foreground">end_time</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="hevy-csv-file">
              Hevy CSV-Datei
            </label>
            <Input
              ref={fileInputRef}
              id="hevy-csv-file"
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              className="file:mr-4 file:rounded-xl file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
              onChange={handleFileChange}
            />
            {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
          </div>

          {file ? (
            <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm">
              <p className="font-medium">{file.name}</p>
              <p className="mt-1 text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB bereit für den Import
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="sm:min-w-44" disabled={importPending} type="submit">
              {importPending ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Import läuft
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {variant === "compact" ? "CSV importieren" : "Hevy CSV importieren"}
                </>
              )}
            </Button>
            <Button
              disabled={importPending || !file}
              onClick={resetSelection}
              type="button"
              variant="secondary"
            >
              Auswahl zurücksetzen
            </Button>
          </div>
        </form>

        <StatusMessage message={status.message} tone={status.tone} />
      </Card>

      {result ? (
        <Card className="space-y-5 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {result.operation === "csv_import" && result.duplicateImport ? (
                  <AlertCircle className="h-5 w-5 text-warning" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
                <CardTitle className="text-xl">
                  {result.operation === "api_sync"
                    ? "Sync abgeschlossen"
                    : result.duplicateImport
                      ? "Import bereits vorhanden"
                      : "Import abgeschlossen"}
                </CardTitle>
              </div>
              <CardDescription>{buildResultDescription(result)}</CardDescription>
            </div>
            <div className="space-y-2">
              {result.operation === "api_sync" ? (
                <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                  Sync: <span className="font-medium text-foreground">{result.syncMode}</span>
                </div>
              ) : null}
              <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                Import-ID:{" "}
                <span className="font-mono text-xs text-foreground">{result.dataImportId}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              label={result.operation === "api_sync" ? "Workouts geladen" : "CSV-Zeilen"}
              value={result.operation === "api_sync" ? result.fetchedWorkouts : result.parsedRows}
            />
            <SummaryMetric
              label={
                result.operation === "api_sync" ? "Events ignoriert" : "Workouts gruppiert"
              }
              value={
                result.operation === "api_sync"
                  ? result.deletedEventsIgnored
                  : result.groupedWorkouts
              }
            />
            <SummaryMetric label="Workouts importiert" value={result.insertedWorkouts} />
            <SummaryMetric label="Tage aktualisiert" value={result.updatedDailyEntries} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
