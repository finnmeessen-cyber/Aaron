import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function EmptyState({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <Card className="p-8 text-center">
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.32em] text-primary">{eyebrow}</p>
      ) : null}
      <CardTitle className="mt-3">{title}</CardTitle>
      <CardDescription className="mt-3">{description}</CardDescription>
    </Card>
  );
}
