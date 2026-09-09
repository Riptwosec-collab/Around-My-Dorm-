"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, WifiOff, X } from "lucide-react";
import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import { getCopy } from "@/locales";

export function PwaRuntime() {
  const [online, setOnline] = useState(true);
  const [language, setLanguage] = useState<"th" | "en">("th");
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const reloadOnControllerChange = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    void (async () => {
      try {
        const user = await ensureCloudUser();
        const { data } = await supabase.from("amd_user_settings").select("settings").eq("user_id", user.id).maybeSingle();
        const next = data?.settings as { language?: "th" | "en" } | null;
        if (next?.language) setLanguage(next.language);
      } catch {}
    })();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    let registration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const onControllerChange = () => {
      if (!reloadOnControllerChange.current) return;
      reloadOnControllerChange.current = false;
      window.location.reload();
    };

    const inspectRegistration = (next: ServiceWorkerRegistration) => {
      registration = next;
      if (next.waiting && navigator.serviceWorker.controller) setWaitingWorker(next.waiting);
      const onUpdateFound = () => {
        installingWorker = next.installing;
        if (!installingWorker) return;
        const onStateChange = () => {
          if (installingWorker?.state === "installed" && navigator.serviceWorker.controller && next.waiting) {
            setWaitingWorker(next.waiting);
          }
        };
        installingWorker.addEventListener("statechange", onStateChange);
      };
      next.addEventListener("updatefound", onUpdateFound);
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.register("/sw.js").then((next) => {
        inspectRegistration(next);
        // One lightweight same-origin update check per app start. This never calls Google Places.
        void next.update().catch(() => undefined);
      }).catch(() => undefined);
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine && registration) void registration.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  function applyUpdate() {
    if (!waitingWorker) return;
    setRefreshing(true);
    reloadOnControllerChange.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    // Safety fallback for browsers that do not emit controllerchange promptly.
    window.setTimeout(() => window.location.reload(), 3000);
  }

  const copy = getCopy(language);
  return <>
    {!online && <div role="status" className="fixed left-1/2 top-[max(8px,env(safe-area-inset-top))] z-[200] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/20 bg-[#0a1424]/95 px-4 py-2 text-[10px] font-semibold text-amber-100 shadow-xl backdrop-blur-xl"><WifiOff className="h-4 w-4 shrink-0" /><span className="truncate">{copy.offline} • {copy.offlineBody}</span></div>}
    {waitingWorker && <div role="status" data-testid="pwa-update-ready" className="fixed bottom-[calc(var(--amd-nav-h)+20px+env(safe-area-inset-bottom))] left-1/2 z-[210] w-[min(390px,calc(100vw-24px))] -translate-x-1/2 rounded-[20px] border border-cyan-300/15 bg-[#07111f]/95 p-3 shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.07]"><RefreshCw className={`h-4 w-4 text-cyan-200 ${refreshing ? "animate-spin" : ""}`} /></div><div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-white">{language === "en" ? "New version available" : "มีเวอร์ชันใหม่พร้อมใช้งาน"}</p><p className="mt-0.5 text-[8px] leading-4 text-white/45">{language === "en" ? "Update now to avoid using an older cached interface." : "อัปเดตเพื่อป้องกันการใช้หน้าแอปเวอร์ชันเก่าจากแคช"}</p></div><button type="button" aria-label={language === "en" ? "Later" : "ไว้ทีหลัง"} onClick={() => setWaitingWorker(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/45"><X className="h-4 w-4" /></button></div>
      <button type="button" onClick={applyUpdate} disabled={refreshing} className="amd-btn amd-btn-primary mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[10px] font-bold"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? (language === "en" ? "Updating…" : "กำลังอัปเดต…") : (language === "en" ? "Update now" : "อัปเดตตอนนี้")}</button>
    </div>}
  </>;
}
