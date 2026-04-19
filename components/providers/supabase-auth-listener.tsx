"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClientSupabaseClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export function SupabaseAuthListener() {
  const router = useRouter();

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

  return null;
}
