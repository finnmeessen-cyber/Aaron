"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    setIsOffline(!navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 border-b border-warning/30 bg-warning/10 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm text-warning">
        <WifiOff className="h-4 w-4" />
        <span>Offline: Neue Daten werden gespeichert, sobald die Verbindung wieder da ist.</span>
      </div>
    </div>
  );
}
