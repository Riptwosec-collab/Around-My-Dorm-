"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogOut, Mail, ShieldCheck } from "lucide-react";
import {
  getAdminAccessState,
  requestAdminMagicLink,
  signOutAdmin,
  type AdminAccessState,
} from "@/lib/admin-auth";

const EMPTY: AdminAccessState = { authenticated: false, admin: false, anonymous: false, email: null };

export function AdminGoogleAccess({
  language,
  onStateChange,
}: {
  language: "th" | "en";
  onStateChange?: (state: AdminAccessState) => void;
}) {
  const [state, setState] = useState<AdminAccessState>(EMPTY);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const next = await getAdminAccessState();
    setState(next);
    onStateChange?.(next);
    return next;
  }

  useEffect(() => {
    let alive = true;
    void getAdminAccessState()
      .then((next) => {
        if (!alive) return;
        setState(next);
        onStateChange?.(next);
      })
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : "Admin access unavailable");
      });
    return () => { alive = false; };
  }, [onStateChange]);

  async function sendLink() {
    setBusy(true);
    setMessage(null);
    try {
      await requestAdminMagicLink(email);
      setMessage(language === "en" ? "Admin sign-in link sent. Open it in this browser, then return here." : "ส่งลิงก์เข้าสู่ระบบ Admin แล้ว • เปิดลิงก์ในเบราว์เซอร์นี้แล้วกลับมาหน้านี้");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send admin sign-in link");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOutAdmin();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign out failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="amd-glass amd-card mt-4 p-4" data-testid="admin-google-access">
      <div className="flex items-start gap-3">
        <ShieldCheck className={`mt-0.5 h-5 w-5 ${state.admin ? "text-emerald-300" : "text-amber-200"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold">GOOGLE MAINTENANCE ADMIN</p>
          <p className="mt-1 text-[9px] leading-5 text-white/48">
            {state.admin
              ? language === "en" ? `Authorized admin${state.email ? ` • ${state.email}` : ""}` : `ยืนยันสิทธิ์ Admin แล้ว${state.email ? ` • ${state.email}` : ""}`
              : language === "en" ? "Bulk Google enrichment and Routes refresh require a real authorized admin session." : "Bulk Google และ Routes ต้องใช้บัญชี Admin จริง • Anonymous session ใช้สิทธิ์นี้ไม่ได้"}
          </p>
        </div>
      </div>

      {!state.admin && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={language === "en" ? "Admin email" : "อีเมล Admin"}
              className="amd-input h-11 w-full rounded-xl pl-10 pr-3 text-[10px]"
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void sendLink()} className="amd-btn amd-btn-primary min-h-11 rounded-xl px-4 text-[9px] font-bold disabled:opacity-50">
            <span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" />{language === "en" ? "Send sign-in link" : "ส่งลิงก์เข้าสู่ระบบ"}</span>
          </button>
        </div>
      )}

      {state.admin && (
        <button type="button" disabled={busy} onClick={() => void logout()} className="amd-chip mt-3 h-10 min-h-0 px-3 text-[9px]">
          <span className="inline-flex items-center gap-2"><LogOut className="h-4 w-4" />{language === "en" ? "Sign out admin" : "ออกจาก Admin"}</span>
        </button>
      )}

      {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[9px] leading-5 text-white/60">{message}</p>}
    </section>
  );
}
