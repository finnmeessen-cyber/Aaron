"use client";

import type { Route } from "next";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClientSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";

const AUTH_REDIRECT_ROUTES = [
  "/dashboard",
  "/daily",
  "/supplements",
  "/nutrition",
  "/phases",
  "/weekly-review",
  "/settings"
] as const satisfies readonly Route[];

function isAuthRedirectRoute(value: string): value is (typeof AUTH_REDIRECT_ROUTES)[number] {
  return AUTH_REDIRECT_ROUTES.includes(value as (typeof AUTH_REDIRECT_ROUTES)[number]);
}

export function AuthForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const router = useRouter();
  const safeNextPath: Route =
    nextPath.startsWith("/") && isAuthRedirectRoute(nextPath) ? nextPath : "/dashboard";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{
    tone: "success" | "warning" | "danger" | "muted";
    message: string | null;
  }>({ tone: "muted", message: null });
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!navigator.onLine) {
      setStatus({
        tone: "warning",
        message: "Keine Verbindung. Verbinde dich mit dem Internet und versuche es erneut."
      });
      return;
    }

    setPending(true);
    setStatus({ tone: "muted", message: null });

    try {
      const supabase = createClientSupabaseClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          setStatus({ tone: "danger", message: error.message });
          return;
        }

        router.push(safeNextPath);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined
        }
      });

      if (error) {
        setStatus({ tone: "danger", message: error.message });
        return;
      }

      if (data.session) {
        router.push(safeNextPath);
        router.refresh();
        return;
      }

      setStatus({
        tone: "success",
        message:
          "Account erstellt. Falls E-Mail-Bestätigung aktiv ist, bestätige kurz deine Adresse und logge dich dann ein."
      });
    } catch {
      setStatus({
        tone: "danger",
        message: "Authentifizierung fehlgeschlagen. Bitte versuche es erneut."
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.32em] text-primary">Auth</p>
      <CardTitle className="mt-4 text-2xl">
        {mode === "login" ? "Login" : "Account erstellen"}
      </CardTitle>
      <CardDescription className="mt-3">
        Sync zwischen iPhone und Mac per Supabase, ohne unnötige Reibung im Alltag.
      </CardDescription>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            E-Mail
          </label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Passwort
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="Mindestens 8 Zeichen"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </div>

        <StatusMessage tone={status.tone} message={status.message} />

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Bitte warten..." : mode === "login" ? "Einloggen" : "Registrieren"}
        </Button>
      </form>

      <div className="mt-5 flex items-center justify-between rounded-2xl border border-border bg-muted px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          {mode === "login" ? "Noch kein Account?" : "Schon registriert?"}
        </span>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="font-medium text-primary"
        >
          {mode === "login" ? "Signup" : "Login"}
        </button>
      </div>
    </Card>
  );
}
