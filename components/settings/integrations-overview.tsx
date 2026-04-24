"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Dumbbell, Moon, Salad } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { FatSecretConnectionStatus } from "@/lib/fatsecret/types";
import type { HevySyncStatus } from "@/lib/hevy/types";

type IntegrationCardProps = {
  badgeLabel: string;
  badgeTone: "default" | "success" | "warning" | "danger" | "muted";
  description: string;
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
  meta: string;
  title: string;
};

function formatSyncDate(value: string | null) {
  if (!value) {
    return "Noch kein Sync";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return "Noch kein Sync";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
}

function IntegrationCard({
  badgeLabel,
  badgeTone,
  description,
  href,
  icon: Icon,
  meta,
  title
}: IntegrationCardProps) {
  return (
    <Card className="space-y-4 p-5 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Icon className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.32em]">{title}</p>
          </div>
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="mt-1.5">{description}</CardDescription>
          </div>
        </div>
        <Badge tone={badgeTone}>{badgeLabel}</Badge>
      </div>

      <div className="rounded-2xl border border-border bg-muted px-4 py-4">
        <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Status</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{meta}</p>
      </div>

      <Link
        href={href}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-border bg-card px-5 text-sm font-medium transition hover:border-primary/40 hover:bg-muted md:w-auto"
      >
        Bereich öffnen
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </Card>
  );
}

export function IntegrationsOverview() {
  const [fatSecretStatus, setFatSecretStatus] = useState<FatSecretConnectionStatus | null>(null);
  const [hevyStatus, setHevyStatus] = useState<HevySyncStatus | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStatuses() {
      const [fatSecretResponse, hevyResponse] = await Promise.allSettled([
        fetch("/api/fatsecret/sync", { method: "GET" }),
        fetch("/api/hevy/sync", { method: "GET" })
      ]);

      if (
        active &&
        fatSecretResponse.status === "fulfilled" &&
        fatSecretResponse.value.ok
      ) {
        const payload = (await fatSecretResponse.value.json().catch(() => null)) as
          | FatSecretConnectionStatus
          | null;

        if (payload) {
          setFatSecretStatus(payload);
        }
      }

      if (active && hevyResponse.status === "fulfilled" && hevyResponse.value.ok) {
        const payload = (await hevyResponse.value.json().catch(() => null)) as HevySyncStatus | null;

        if (payload) {
          setHevyStatus(payload);
        }
      }
    }

    void loadStatuses();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <IntegrationCard
        title="FatSecret"
        icon={Salad}
        href="/meals"
        description="Integration und Verbindungsstatus fuer Meals und synced Tagesmakros."
        badgeLabel={fatSecretStatus?.connected ? "Verbunden" : "Nicht verbunden"}
        badgeTone={fatSecretStatus?.connected ? "success" : "muted"}
        meta={
          fatSecretStatus?.connected
            ? `Letzter Sync: ${formatSyncDate(fatSecretStatus.lastSyncedAt)}`
            : "Noch keine aktive FatSecret-Verbindung."
        }
      />

      <IntegrationCard
        title="Hevy"
        icon={Dumbbell}
        href="/training"
        description="Integration und Verbindungsstatus fuer API-Sync und CSV-Fallback."
        badgeLabel={hevyStatus?.connected ? "Verbunden" : "Nicht verbunden"}
        badgeTone={hevyStatus?.connected ? "success" : "muted"}
        meta={
          hevyStatus?.connected
            ? `Letzter Sync: ${formatSyncDate(hevyStatus.lastSyncedAt)}`
            : "Noch kein gespeicherter Hevy API Key."
        }
      />

      <IntegrationCard
        title="Fitbit"
        icon={Moon}
        href="/sleep"
        description="Placeholder fuer die spaetere Sleep-Integration."
        badgeLabel="Spaeter"
        badgeTone="warning"
        meta="Fitbit sleep sync will be added later."
      />
    </div>
  );
}
