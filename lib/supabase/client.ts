"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let client: BrowserSupabaseClient | undefined;

export function createClientSupabaseClient(): BrowserSupabaseClient {
  if (client) {
    return client;
  }

  const { url, anonKey } = getSupabaseEnv();
  const nextClient = createBrowserClient<Database>(url, anonKey);
  client = nextClient;
  return nextClient;
}

export async function getAuthenticatedClientContext() {
  const supabase = createClientSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return {
    supabase,
    userId: user?.id ?? null
  };
}

export function isBrowserOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function getOfflineMessage(action = "Bitte nach dem Reconnect erneut speichern.") {
  return `Offline. ${action}`;
}
