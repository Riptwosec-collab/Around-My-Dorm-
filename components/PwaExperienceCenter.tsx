"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Download, Share2, Smartphone, Wifi, WifiOff } from "lucide-react";
import { enablePushNotificationsCloud } from "@/lib/cloud/capabilities";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaExperienceCenter({ language }: { language: "th" | "en" }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [online, setOnline] = useState(true);
  const [pushState, setPushState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setInstalled(isStandalone());
    setOnline(navigator.onLine);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setMessage(language === "en"
        ? "On iPhone: Safari → Share → Add to Home Screen."
        : "บน iPhone: Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  async function shareApp() {
    const payload = {
      title: "Around My Dorm",
      text: language === "en" ? "Places, parking and useful services around the dorm." : "ร้าน ที่จอดรถ และบริการรอบหอ",
      url: window.location.origin,
    };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(payload.url);
        setMessage(language === "en" ? "App link copied" : "คัดลอกลิงก์แอปแล้ว");
      }
    } catch {}
  }

  async function enablePush() {
    setPushState("loading");
    setMessage(null);
    try {
      await enablePushNotificationsCloud(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "");
      setPushState("ready");
      setMessage(language === "en" ? "Push notifications are ready" : "เปิด Push Notification แล้ว");
    } catch {
      setPushState("error");
      setMessage(language === "en" ? "Push is not configured or permission was denied" : "Push ยังไม่ได้ตั้งค่าหรือไม่ได้รับสิทธิ์");
    }
  }

  return (
    <section className="amd-glass amd-card mt-4 overflow-hidden p-4" data-testid="pwa-experience-center">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">PWA EXPERIENCE</p>
          <h3 className="mt-1 text-[15px] font-bold">{language === "en" ? "App mode & offline" : "โหมดแอปและออฟไลน์"}</h3>
          <p className="mt-1 text-[9px] leading-4 text-[var(--amd-text-3)]">
            {language === "en" ? "Install, share, notifications and offline fallback in one place." : "ติดตั้ง แชร์ เปิดแจ้งเตือน และตรวจสถานะออฟไลน์ในที่เดียว"}
          </p>
        </div>
        {installed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" /> : <Smartphone className="h-5 w-5 shrink-0 text-cyan-300" />}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={install} disabled={installed} className="amd-btn min-h-12 rounded-2xl border border-cyan-300/12 bg-cyan-300/[0.055] px-3 text-[9px] font-bold text-cyan-100 disabled:opacity-55">
          <Download className="mr-1.5 inline h-4 w-4" />{installed ? (language === "en" ? "Installed" : "ติดตั้งแล้ว") : (language === "en" ? "Install app" : "ติดตั้งแอป")}
        </button>
        <button type="button" onClick={shareApp} className="amd-btn min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 text-[9px] font-bold">
          <Share2 className="mr-1.5 inline h-4 w-4" />{language === "en" ? "Share app" : "แชร์แอป"}
        </button>
        <button type="button" onClick={enablePush} disabled={pushState === "loading" || pushState === "ready"} className="amd-btn min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 text-[9px] font-bold disabled:opacity-55">
          <BellRing className="mr-1.5 inline h-4 w-4" />{pushState === "ready" ? (language === "en" ? "Push ready" : "Push พร้อม") : (language === "en" ? "Enable push" : "เปิด Push")}
        </button>
        <div className={`flex min-h-12 items-center justify-center rounded-2xl border px-3 text-[9px] font-bold ${online ? "border-emerald-300/12 bg-emerald-300/[0.045] text-emerald-100" : "border-amber-300/12 bg-amber-300/[0.05] text-amber-100"}`}>
          {online ? <Wifi className="mr-1.5 h-4 w-4" /> : <WifiOff className="mr-1.5 h-4 w-4" />}
          {online ? (language === "en" ? "Online + cached" : "ออนไลน์ + มีแคช") : (language === "en" ? "Offline mode" : "โหมดออฟไลน์")}
        </div>
      </div>

      {!installed && isIos() && (
        <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[8px] leading-4 text-white/42">
          {language === "en" ? "iPhone/iPad: open in Safari, tap Share, then Add to Home Screen." : "iPhone/iPad: เปิดด้วย Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม"}
        </p>
      )}
      {message && <p className="mt-3 text-[9px] leading-4 text-cyan-100">{message}</p>}
    </section>
  );
}
