"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  createClientSupabaseClient,
  getLatestAppDataMutationTimestamp,
  subscribeToAppDataMutations
} from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function isSafeLiveRefreshPath(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/weekly-review") ||
    pathname.startsWith("/review")
  );
}

function isSafeFocusRefreshPath(pathname: string) {
  return isSafeLiveRefreshPath(pathname);
}

export function SupabaseAuthListener() {
  const router = useRouter();
  const pathname = usePathname();
  const handledMutationTimestampRef = useRef(0);

  const maybeRefreshForDataMutation = useCallback(
    (reason: "navigation" | "focus" | "external") => {
      const latestMutationTimestamp = getLatestAppDataMutationTimestamp();

      if (
        latestMutationTimestamp <= handledMutationTimestampRef.current ||
        latestMutationTimestamp === 0
      ) {
        return;
      }

      if (reason === "external" && !isSafeLiveRefreshPath(pathname)) {
        return;
      }

      if ((reason === "focus" || reason === "navigation") && !isSafeFocusRefreshPath(pathname)) {
        return;
      }

      handledMutationTimestampRef.current = latestMutationTimestamp;
      router.refresh();
    },
    [pathname, router]
  );

  useEffect(() => {
    if (!hasSupabaseEnv()) {
      return;
    }

    const supabase = createClientSupabaseClient();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    return subscribeToAppDataMutations(() => {
      maybeRefreshForDataMutation("external");
    });
  }, [maybeRefreshForDataMutation]);

  useEffect(() => {
    maybeRefreshForDataMutation("navigation");
  }, [maybeRefreshForDataMutation, pathname]);

  useEffect(() => {
    const handleFocus = () => {
      maybeRefreshForDataMutation("focus");
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeRefreshForDataMutation("focus");
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [maybeRefreshForDataMutation]);

  return null;
}
