"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { HomeOriginManager } from "@/components/HomeOriginManager";
import { supabase } from "@/lib/cloud/supabase";
import {
  ADMIN_EMAIL_ALLOWLIST,
  getAdminAccessState,
  signInAdminWithPassword,
  signOutAdmin,
  type AdminAccessState,
} from "@/lib/admin-auth";

const ADMIN_EMAIL_OPTIONS = ADMIN_EMAIL_ALLOWLIST;
const EMPTY: AdminAccessState = { authenticated: false, admin: false, anonymous: false, email: null };

function friendlyAuthMessage(error: unknown, language: "th" | "en") {
  const message = error instanceof Error ? error.message : "Admin login failed";
  if (/invalid login credentials|invalid credentials/i.test(message)) {
    return language === "en" ? "Invalid admin password." : "รหัสผ่าน Admin ไม่ถูกต้อง";
  }
  if (/email not confirmed/i.test(message)) {
    return language === "en" ? "This admin email has not been confirmed yet." : "อีเมล Admin นี้ยังไม่ได้ยืนยัน";
  }
  return message;
}

export function AdminGoogleAccess({
  language,
  onStateChange,
}: {
  language: "th" | "en";
  onStateChange?: (state: AdminAccessState) => void;
}) {
  const [state, setState] = useState<AdminAccessState>(EMPTY);
  const [email, setEmail] = useState<string>(ADMIN_EMAIL_OPTIONS[0]);
  const [password, setPassword] = useState("");
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
    const sync = () => {
      void getAdminAccessState()
        .then((next) => {
          if (!alive) return;
          setState(next);
          onStateChange?.(next);
        })
        .catch((error) => {
          if (alive) setMessage(error instanceof Error ? error.message : "Admin access unavailable");
        });
    };
    sync();
    const { data } = supabase.auth.onAuthStateChange(() => sync());
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [onStateChange]);

  async function login() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await signInAdminWithPassword(email, password);
      setState(next);
      onStateChange?.(next);
      setPassword("");
      setMessage(language === "en" ? "Supabase admin connected." : "เชื่อม Supabase Admin แล้ว");
    } catch (error) {
      setMessage(friendlyAuthMessage(error, language));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOutAdmin();
      await refresh();
      setPassword("");
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign out failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="amd-glass amd-card mt-4 p-4" data-testid="admin-google-access">
        <div className="flex items-start gap-3">
          <ShieldCheck className={`mt-0.5 h-5 w-5 ${state.admin ? "text-emerald-300" : "text-amber-200"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold">ADMIN DATABASE LOGIN</p>
            <p className="mt-1 text-[9px] leading-5 text-white/48">
              {state.admin
                ? language === "en" ? `Authorized admin${state.email ? ` • ${state.email}` : ""}` : `ยืนยันสิทธิ์ Admin แล้ว${state.email ? ` • ${state.email}` : ""}`
                : language === "en" ? "Choose the admin account and enter its Supabase Auth password." : "เลือกบัญชี Admin และกรอกรหัสผ่าน Supabase Auth"}
            </p>
          </div>
        </div>

        {!state.admin && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              aria-label={language === "en" ? "Admin account" : "บัญชี Admin"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="amd-input h-11 w-full rounded-xl bg-[#07111f] px-3 text-[10px]"
            >
              {ADMIN_EMAIL_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void login(); }}
              placeholder={language === "en" ? "Admin password" : "รหัสผ่าน Admin"}
              autoComplete="current-password"
              className="amd-input h-11 w-full rounded-xl px-3 text-[10px]"
            />
            <button type="button" disabled={busy || !password} onClick={() => void login()} className="amd-btn amd-btn-primary min-h-11 rounded-xl px-4 text-[9px] font-bold disabled:opacity-50">
              <span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" />{busy ? (language === "en" ? "Signing in…" : "กำลังเข้าสู่ระบบ…") : (language === "en" ? "Login" : "เข้าสู่ระบบ")}</span>
            </button>
          </div>
        )}

        {!state.admin && <p className="mt-2 text-[8px] leading-4 text-white/35">{language === "en" ? "Application data is stored in Supabase cloud only. The password is sent directly to Supabase Auth and is never stored in the app or repository." : "ข้อมูลแอปเก็บบน Supabase Cloud เท่านั้น รหัสผ่านส่งตรงไป Supabase Auth และไม่ถูกเก็บในแอปหรือ Repository"}</p>}

        {state.admin && (
          <button type="button" disabled={busy} onClick={() => void logout()} className="amd-chip mt-3 h-10 min-h-0 px-3 text-[9px]">
            <span className="inline-flex items-center gap-2"><LogOut className="h-4 w-4" />{language === "en" ? "Sign out admin" : "ออกจาก Admin"}</span>
          </button>
        )}

        {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[9px] leading-5 text-white/60">{message}</p>}
      </section>

      <HomeOriginManager language={language} adminAllowed={state.admin} />
    </>
  );
}
