"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClientSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = createClientSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
    setLoading(false);
  }

  return (
    <Button
      variant="secondary"
      size={compact ? "icon" : "sm"}
      onClick={handleSignOut}
      disabled={loading}
      className="shrink-0"
      aria-label="Sign out"
    >
      <LogOut className="h-4 w-4" />
      {compact ? null : <span className="ml-2">Logout</span>}
    </Button>
  );
}
