import { cn } from "@/lib/utils";

type StatusMessageProps = {
  tone?: "success" | "warning" | "danger" | "muted";
  message: string | null;
};

const toneClasses = {
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  danger: "border-danger/20 bg-danger/10 text-danger",
  muted: "border-border/60 bg-muted text-muted-foreground"
};

export function StatusMessage({ tone = "muted", message }: StatusMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", toneClasses[tone])}>
      {message}
    </div>
  );
}
