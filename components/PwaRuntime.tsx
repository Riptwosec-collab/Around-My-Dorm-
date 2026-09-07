"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { loadSettings } from "@/lib/storage/settings";
import { getCopy } from "@/locales";
export function PwaRuntime() {
  const [online, setOnline] = useState(true);
  const [language, setLanguage] = useState<"th" | "en">("th");
  useEffect(() => {
    setOnline(navigator.onLine); setLanguage(loadSettings().language);
    const onOnline = () => setOnline(true); const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const storage = (event: StorageEvent) => { if (event.key === "around-dorm-settings-v3") setLanguage(loadSettings().language); };
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); window.removeEventListener("storage", storage); };
  }, []);
  if (online) return null; const copy = getCopy(language);
  return <div role="status" className="fixed left-1/2 top-[max(8px,env(safe-area-inset-top))] z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/20 bg-[#0a1424]/95 px-4 py-2 text-[10px] font-semibold text-amber-100 shadow-xl backdrop-blur-xl"><WifiOff className="h-4 w-4" /><span>{copy.offline} • {copy.offlineBody}</span></div>;
}
