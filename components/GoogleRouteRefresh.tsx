"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Navigation, Route } from "lucide-react";
import { getAdminAccessState } from "@/lib/admin-auth";
import { supabase } from "@/lib/cloud/supabase";
import { isUsableHomeOrigin, loadHomeOrigin } from "@/lib/home-origin";
import { refreshRoutesForPlaces, ROUTE_CACHE_TTL_DAYS, type RouteRefreshProgress } from "@/lib/route-cache";
import type { HomeOrigin, Place } from "@/types/place";

const EMPTY_PROGRESS: RouteRefreshProgress = { mode: null, processed: 0, total: 0, requests: 0, success: 0, skipped: 0, failed: 0, currentBatch: 0, totalBatches: 0 };

export function GoogleRouteRefresh({
  places,
  language,
  adminAllowed,
  onReload,
}: {
  places: Place[];
  language: "th" | "en";
  adminAllowed?: boolean;
  onReload?: () => void;
}) {
  const [origin, setOrigin] = useState<HomeOrigin | null>(null);
  const [sessionAdmin, setSessionAdmin] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<RouteRefreshProgress>(EMPTY_PROGRESS);
  const [message, setMessage] = useState<string | null>(null);
  const eligible = useMemo(() => places.filter((place) => place.latitude != null && place.longitude != null), [places]);
  const verifiedHome = Boolean(origin && isUsableHomeOrigin(origin));
  const effectiveAdmin = adminAllowed ?? sessionAdmin;
  const estimatedRequests = Math.ceil(eligible.length / 25) * 3;

  useEffect(() => {
    let alive = true;
    void Promise.all([loadHomeOrigin(), getAdminAccessState()])
      .then(([nextOrigin, access]) => {
        if (!alive) return;
        setOrigin(nextOrigin);
        setSessionAdmin(access.admin);
      })
      .catch((error) => { if (alive) setMessage(error instanceof Error ? error.message : "Routes prerequisites unavailable"); });

    const { data } = supabase.auth.onAuthStateChange(() => {
      void getAdminAccessState().then((access) => { if (alive) setSessionAdmin(access.admin); }).catch(() => { if (alive) setSessionAdmin(false); });
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  async function refreshRoutes() {
    if (!effectiveAdmin || !origin || !isUsableHomeOrigin(origin) || running) return;
    setConfirmOpen(false);
    setRunning(true);
    setProgress({ ...EMPTY_PROGRESS, total: eligible.length * 3 });
    setMessage(null);
    try {
      const result = await refreshRoutesForPlaces({ origin, places, onProgress: setProgress });
      setProgress(result);
      setMessage(language === "en"
        ? `Route refresh complete: ${result.success} route results, ${result.skipped} unavailable/skipped, ${result.failed} failed.`
        : `อัปเดต Routes เสร็จแล้ว • สำเร็จ ${result.success} • ไม่มีเส้นทาง/ข้าม ${result.skipped} • ล้มเหลว ${result.failed}`);
      onReload?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Route refresh failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="amd-glass amd-card mt-4 p-4" data-testid="google-route-refresh">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold">GOOGLE ROUTES CACHE</p>
            <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.06] px-2 py-1 text-[8px] font-bold text-violet-100">MANUAL • SERVER KEY</span>
          </div>
          <p className="mt-1 text-[9px] leading-5 text-white/48">
            {language === "en"
              ? `GOOGLE_MAPS_SERVER_API_KEY is used only after this button is confirmed. Walking, driving and two-wheel results are cached for ${ROUTE_CACHE_TTL_DAYS} days.`
              : `GOOGLE_MAPS_SERVER_API_KEY จะถูกใช้เฉพาะหลังจากกดปุ่มและยืนยันเท่านั้น • เวลาเดิน / รถยนต์ / มอเตอร์ไซค์ Cache ${ROUTE_CACHE_TTL_DAYS} วัน`}
          </p>
        </div>
        <Route className="h-5 w-5 shrink-0 text-violet-200" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">{language === "en" ? "Eligible shops" : "ร้านมีพิกัด"}</p><strong className="text-[18px]">{eligible.length}</strong></div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">{language === "en" ? "Modes" : "โหมด"}</p><strong className="text-[18px]">3</strong></div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[8px] text-white/35">API batches</p><strong className="text-[18px]">{estimatedRequests}</strong></div>
      </div>

      {!effectiveAdmin && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-[9px] text-amber-100">{language === "en" ? "Sign in as the authorized maintenance admin above before sending Routes requests." : "เข้าสู่ระบบ Maintenance Admin ด้านบนก่อนจึงจะยิง Routes ได้"}</div>}
      {!verifiedHome && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-[9px] leading-5 text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{language === "en" ? "Verify บ้านสุภาอพาร์ทเม้นต์ first. Routes will never run from an unverified fallback coordinate." : "ต้องยืนยันพิกัดบ้านสุภาอพาร์ทเม้นต์ก่อน • Routes จะไม่ใช้พิกัด fallback ที่ยังไม่ยืนยัน"}</span>
        </div>
      )}

      {running && (
        <div className="mt-3 rounded-xl border border-violet-300/10 bg-violet-300/[0.04] p-3 text-[9px]">
          <div className="flex justify-between"><span>{progress.mode || (language === "en" ? "Preparing" : "กำลังเตรียม")}</span><strong>{progress.processed}/{progress.total}</strong></div>
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[8px] text-white/45"><div>API<br/><strong>{progress.requests}</strong></div><div>OK<br/><strong className="text-emerald-200">{progress.success}</strong></div><div>Skip<br/><strong className="text-amber-100">{progress.skipped}</strong></div><div>Fail<br/><strong className="text-rose-200">{progress.failed}</strong></div></div>
        </div>
      )}
      {!running && progress.success > 0 && <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] p-3 text-[9px] text-emerald-100"><CheckCircle2 className="h-4 w-4 shrink-0"/><span>{progress.success} route results cached.</span></div>}
      {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[9px] leading-5 text-white/60">{message}</p>}

      <button type="button" disabled={!effectiveAdmin || !verifiedHome || !eligible.length || running} onClick={() => setConfirmOpen(true)} className="amd-btn amd-btn-primary mt-4 min-h-11 w-full rounded-xl px-4 text-[9px] font-bold disabled:opacity-40">
        <span className="inline-flex items-center gap-2"><Navigation className="h-4 w-4"/>{language === "en" ? `Refresh routes for ${eligible.length} shops` : `อัปเดต Routes ${eligible.length} ร้าน`}</span>
      </button>

      {confirmOpen && (
        <div className="mt-3 rounded-2xl border border-violet-300/15 bg-black/20 p-4">
          <p className="text-[10px] font-bold">{language === "en" ? "Confirm Google Routes request" : "ยืนยันการยิง Google Routes"}</p>
          <p className="mt-2 text-[9px] leading-5 text-white/50">{language === "en" ? `${eligible.length} destinations × 3 modes, approximately ${estimatedRequests} matrix requests.` : `${eligible.length} ปลายทาง × 3 โหมด • ประมาณ ${estimatedRequests} Route Matrix requests`}</p>
          <p className="mt-2 text-[8px] leading-4 text-amber-100/80">{language === "en" ? "Walking and two-wheel routes can omit suitable paths; the app shows unavailable instead of inventing results." : "ถ้า Google ไม่คืนเส้นทางเดินหรือสองล้อ ระบบจะแสดงไม่มีข้อมูลและไม่สร้างเวลาขึ้นเอง"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="amd-chip min-h-10 text-[9px]">{language === "en" ? "Cancel" : "ยกเลิก"}</button><button type="button" onClick={() => void refreshRoutes()} className="amd-btn amd-btn-primary min-h-10 rounded-xl text-[9px] font-bold">{language === "en" ? "Confirm" : "ยืนยัน"}</button></div>
        </div>
      )}
    </section>
  );
}
