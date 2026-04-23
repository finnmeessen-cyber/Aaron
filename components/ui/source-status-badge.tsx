import { Badge } from "@/components/ui/badge";

type SourceStatusBadgeProps = {
  manualLabel?: string;
  missingLabel?: string;
  status: "manual" | "missing" | "synced";
  syncedLabel?: string;
};

export function SourceStatusBadge({
  manualLabel = "Manuell",
  missingLabel = "Fehlt",
  status,
  syncedLabel = "Synchronisiert"
}: SourceStatusBadgeProps) {
  if (status === "synced") {
    return <Badge tone="success">{syncedLabel}</Badge>;
  }

  if (status === "manual") {
    return <Badge tone="default">{manualLabel}</Badge>;
  }

  return <Badge tone="muted">{missingLabel}</Badge>;
}
