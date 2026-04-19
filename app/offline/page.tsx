import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-dashboard-glow px-6 py-12 text-white">
      <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-soft backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">Offline</p>
        <h1 className="mt-4 text-3xl font-semibold">Keine Verbindung</h1>
        <p className="mt-4 text-sm leading-7 text-white/70">
          Die App ist gerade offline. Bereits geladene Seiten bleiben nutzbar, neue
          Supabase-Anfragen werden nach dem Reconnect wieder synchronisiert.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-white/90"
        >
          Zurück zum Dashboard
        </Link>
      </div>
    </main>
  );
}
