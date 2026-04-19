import { SetupRequired } from "@/components/ui/setup-required";
import { AuthForm } from "@/components/auth/auth-form";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export default function LoginPage({
  searchParams
}: {
  searchParams?: {
    next?: string;
  };
}) {
  if (!hasSupabaseEnv()) {
    return <SetupRequired />;
  }

  return (
    <main className="min-h-screen bg-dashboard-glow px-4 py-10 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <p className="text-xs uppercase tracking-[0.32em] text-primary">Lean Bulk OS</p>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-6xl">
              Persönliches Performance-Dashboard für Training, Supplements und Quit-Fokus.
            </h1>
            <p className="max-w-xl text-base leading-8 text-white/70">
              Mobile-first, schnell im Alltag, sauber synchronisiert zwischen iPhone und Mac.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Daily Tracker mit Checklisten",
              "Wochenreview mit Vorschlägen",
              "Phasen- und Stack-Steuerung"
            ].map((item) => (
              <div
                key={item}
                className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4 text-sm text-white/75 backdrop-blur"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-center md:justify-end">
          <AuthForm nextPath={searchParams?.next || "/dashboard"} />
        </div>
      </div>
    </main>
  );
}
