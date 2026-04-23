import { cn } from "@/lib/utils";

import type { AutosaveStatus } from "@/lib/autosave/use-autosave";

type SaveIndicatorProps = {
  className?: string;
  errorMessage?: string | null;
  isDirty?: boolean;
  status: AutosaveStatus;
};

export function SaveIndicator({
  className,
  errorMessage,
  isDirty = false,
  status
}: SaveIndicatorProps) {
  if (status === "error") {
    return (
      <div className={cn("space-y-1", className)}>
        <p className="text-xs font-medium text-danger">Fehler beim Speichern</p>
        {errorMessage ? (
          <p className="text-xs text-danger/80">{errorMessage}</p>
        ) : null}
      </div>
    );
  }

  if (status === "saving" || isDirty) {
    return (
      <p className={cn("text-xs font-medium text-muted-foreground", className)}>
        Speichert...
      </p>
    );
  }

  if (status === "saved") {
    return <p className={cn("text-xs font-medium text-success", className)}>Gespeichert</p>;
  }

  return null;
}
