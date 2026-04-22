"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;
type AppDataMutationPayload = {
  senderId: string;
  timestamp: number;
};

let client: BrowserSupabaseClient | undefined;
const APP_DATA_MUTATION_STORAGE_KEY = "app-data-mutation";
const APP_DATA_MUTATION_CHANNEL = "app-data-mutation";
let appDataMutationChannel: BroadcastChannel | null = null;
let appDataMutationSenderId: string | null = null;

function getAppDataMutationSenderId() {
  if (appDataMutationSenderId) {
    return appDataMutationSenderId;
  }

  appDataMutationSenderId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `app-data-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return appDataMutationSenderId;
}

function getAppDataMutationChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (appDataMutationChannel) {
    return appDataMutationChannel;
  }

  appDataMutationChannel = new BroadcastChannel(APP_DATA_MUTATION_CHANNEL);
  return appDataMutationChannel;
}

function parseAppDataMutationPayload(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<AppDataMutationPayload>;

    if (
      typeof parsed !== "object" ||
      !parsed ||
      typeof parsed.senderId !== "string" ||
      typeof parsed.timestamp !== "number" ||
      !Number.isFinite(parsed.timestamp)
    ) {
      return null;
    }

    return {
      senderId: parsed.senderId,
      timestamp: parsed.timestamp
    } satisfies AppDataMutationPayload;
  } catch {
    return null;
  }
}

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

export function notifyAppDataMutation() {
  if (typeof window === "undefined") {
    return null;
  }

  const payload: AppDataMutationPayload = {
    senderId: getAppDataMutationSenderId(),
    timestamp: Date.now()
  };
  const serializedPayload = JSON.stringify(payload);

  try {
    window.localStorage.setItem(APP_DATA_MUTATION_STORAGE_KEY, serializedPayload);
  } catch {
    // ignore local storage write errors
  }

  try {
    getAppDataMutationChannel()?.postMessage(payload);
  } catch {
    // ignore broadcast channel errors
  }

  return payload.timestamp;
}

export function getLatestAppDataMutationTimestamp() {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    return (
      parseAppDataMutationPayload(
        window.localStorage.getItem(APP_DATA_MUTATION_STORAGE_KEY)
      )?.timestamp ?? 0
    );
  } catch {
    return 0;
  }
}

export function subscribeToAppDataMutations(
  onMutation: (timestamp: number) => void
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const senderId = getAppDataMutationSenderId();
  const handlePayload = (payload: AppDataMutationPayload | null) => {
    if (!payload || payload.senderId === senderId) {
      return;
    }

    onMutation(payload.timestamp);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== APP_DATA_MUTATION_STORAGE_KEY) {
      return;
    }

    handlePayload(parseAppDataMutationPayload(event.newValue));
  };

  const channel = getAppDataMutationChannel();
  const handleChannelMessage = (event: MessageEvent<AppDataMutationPayload>) => {
    const payload =
      typeof event.data === "object" && event.data
        ? event.data
        : null;

    if (
      !payload ||
      typeof payload.senderId !== "string" ||
      typeof payload.timestamp !== "number"
    ) {
      return;
    }

    handlePayload(payload);
  };

  window.addEventListener("storage", handleStorage);
  channel?.addEventListener("message", handleChannelMessage);

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleChannelMessage);
  };
}
