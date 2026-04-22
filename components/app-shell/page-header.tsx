import { Badge } from "@/components/ui/badge";

export function PageHeader({
  eyebrow,
  title,
  description,
  badge
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? <p className="text-xs uppercase tracking-[0.32em] text-primary">{eyebrow}</p> : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {badge ? <Badge>{badge}</Badge> : null}
    </div>
  );
}
