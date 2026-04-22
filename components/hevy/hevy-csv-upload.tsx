"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Upload } from "lucide-react";

import type { HevyImportResult } from "@/lib/hevy/types";
import {
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
  title?: string;
  description?: string | null;
  hint?: string | null;
  variant?: "default" | "compact";
  onImported?: (result: HevyImportResult) => void;
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

export function HevyCsvUpload({
  description = "Lade deinen Hevy Workout-Export als CSV hoch. Die App gruppiert die Einträge zu Workouts und markiert die passenden Trainingstage automatisch.",
  hint = "Exportiere die Datei in Hevy unter Profile → Settings → Export & Import Data → Export Workouts.",
  onImported,
  title = "CSV hochladen",
  variant = "default"
}: HevyCsvUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<HevyImportResult | null>(null);
  const [status, setStatus] = useState<StatusState>({
    tone: "muted",
    message: null
  });

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

    setPending(true);
    setResult(null);
    setStatus({ tone: "muted", message: null });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/hevy/import", {
        body: formData,
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as HevyImportResult | ErrorResponse | null;

      if (!response.ok) {
        setStatus({
          tone: "danger",
          message: getErrorMessage(payload) ?? "Der Hevy-Import ist fehlgeschlagen."
        });
        return;
      }

      const importResult = payload as HevyImportResult;
      setResult(importResult);
      onImported?.(importResult);
      setStatus({
        tone: importResult.duplicateImport ? "warning" : "success",
        message: importResult.duplicateImport
          ? "Diese Datei wurde bereits importiert. Der Upload wurde sicher erkannt und keine neuen Workouts wurden angelegt."
          : "Hevy CSV erfolgreich importiert. Trainingstage wurden in deinem Tracker markiert."
      });
    } catch {
      setStatus({
        tone: "danger",
        message: "Der Upload konnte nicht abgeschlossen werden. Bitte versuche es erneut."
      });
    } finally {
      setPending(false);
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
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <CardTitle className={variant === "compact" ? "text-lg" : "text-xl"}>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {variant === "default" ? (
            <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Benötigt: <span className="font-medium text-foreground">title</span>,{" "}
              <span className="font-medium text-foreground">start_time</span>,{" "}
              <span className="font-medium text-foreground">end_time</span>
            </div>
          ) : null}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="hevy-csv-file">
              Hevy CSV-Datei
            </label>
            <Input
              ref={fileInputRef}
              id="hevy-csv-file"
              type="file"
              accept=".csv,text/csv"
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
            <Button className="sm:min-w-44" disabled={pending} type="submit">
              {pending ? (
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
            <Button disabled={pending || !file} onClick={resetSelection} type="button" variant="secondary">
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
                {result.duplicateImport ? (
                  <AlertCircle className="h-5 w-5 text-warning" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
                <CardTitle className="text-xl">
                  {result.duplicateImport ? "Import bereits vorhanden" : "Import abgeschlossen"}
                </CardTitle>
              </div>
              <CardDescription>
                {result.duplicateImport
                  ? "Die Datei wurde erkannt und sicher übersprungen. Dein bestehender Datenstand bleibt unverändert."
                  : "Die Hevy-Daten wurden verarbeitet und in deinen Trainingsverlauf übernommen."}
              </CardDescription>
            </div>
            <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Import-ID: <span className="font-mono text-xs text-foreground">{result.dataImportId}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric label="CSV-Zeilen" value={result.parsedRows} />
            <SummaryMetric label="Workouts gruppiert" value={result.groupedWorkouts} />
            <SummaryMetric label="Workouts importiert" value={result.insertedWorkouts} />
            <SummaryMetric label="Tage aktualisiert" value={result.updatedDailyEntries} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
