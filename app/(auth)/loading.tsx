import { Card } from "@/components/ui/card";

export default function AuthLoading() {
  return (
    <main className="min-h-screen bg-dashboard-glow px-4 py-10 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="h-3 w-28 animate-pulse rounded-full bg-white/20" />
          <div className="space-y-4">
            <div className="h-12 max-w-3xl animate-pulse rounded-2xl bg-white/10 md:h-16" />
            <div className="h-8 max-w-xl animate-pulse rounded-2xl bg-white/10" />
          </div>
        </section>
        <div className="flex justify-center md:justify-end">
          <Card className="h-[28rem] w-full max-w-md animate-pulse border-white/10 bg-white/5" />
        </div>
      </div>
    </main>
  );
}
