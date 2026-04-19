import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DEFAULT_SETUP_MESSAGE } from "@/lib/constants";

export function SetupRequired({
  message = DEFAULT_SETUP_MESSAGE
}: {
  message?: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-12">
      <Card className="w-full p-8">
        <p className="text-xs uppercase tracking-[0.32em] text-primary">Setup</p>
        <CardTitle className="mt-4 text-3xl">Supabase verbinden</CardTitle>
        <CardDescription className="mt-4 max-w-2xl text-base">
          {message}
        </CardDescription>
        <div className="mt-6 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <code>NEXT_PUBLIC_SUPABASE_URL</code> und <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
        </div>
      </Card>
    </main>
  );
}
