"use client";

import type { ReactNode } from "react";
import { Car, Coffee, Home, Utensils } from "lucide-react";

export function PageHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: ReactNode }) {
  return (
    <header className="amd-page-header amd-safe-top flex min-w-0 items-start justify-between gap-3 pb-5">
      <div className="min-w-0 flex-1">
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em] text-[var(--amd-text)] sm:text-[38px]">{title}</h1>
        <p className="mt-2 text-[14px] text-[var(--amd-text-2)]">{subtitle}</p>
      </div>
      {right && <div className="amd-page-header-action min-w-0 shrink-0">{right}</div>}
    </header>
  );
}

export function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onChange}
      className={`relative h-8 w-[52px] shrink-0 rounded-full border transition duration-200 ${active ? "border-[rgba(0,140,255,.72)] bg-[#007AFF] shadow-[0_0_16px_rgba(0,122,255,.28)]" : "border-[rgba(120,160,210,.18)] bg-white/[0.08]"}`}
    >
      <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition duration-200 ${active ? "left-[23px]" : "left-[3px]"}`} />
    </button>
  );
}

export function SettingRow({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle?: string; action: ReactNode }) {
  return (
    <div className="amd-setting-row flex min-h-[66px] min-w-0 items-center gap-3 border-b border-[rgba(120,160,210,.11)] py-3 last:border-b-0">
      <div className="amd-setting-icon grid h-10 w-10 shrink-0 place-items-center text-[#00D9FF]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[var(--amd-text)]">{title}</p>
        {subtitle && <p className="mt-0.5 text-[11px] text-[var(--amd-text-3)]">{subtitle}</p>}
      </div>
      <div className="amd-setting-row-action min-w-0 max-w-[55%] shrink-0">{action}</div>
    </div>
  );
}

export function MiniMapArtwork() {
  return (
    <div className="absolute inset-y-0 right-0 w-[48%] overflow-hidden opacity-95">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_42%,rgba(0,140,255,.12)_42%_44%,transparent_44%_100%)]" />
      <div className="amd-radar-home absolute right-[26%] top-[29%] grid h-14 w-14 place-items-center rounded-full border border-[#149CFF] bg-[rgba(0,122,255,.2)] shadow-[0_0_28px_rgba(0,122,255,.52)]"><Home className="h-6 w-6 text-white" /></div>
      <div className="amd-map-dot amd-radar-dot left-[21%] top-[32%]" />
      <div className="amd-map-dot amd-radar-dot bottom-[25%] left-[44%]" />
      <div className="amd-map-dot amd-radar-dot right-[18%] top-[18%]" />
      <div className="absolute left-[12%] top-[18%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(232,238,248,.22)] bg-[#061424]/90 text-[#e8eef8]"><Coffee className="h-4 w-4" /></div>
      <div className="absolute bottom-[17%] left-[38%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(255,157,60,.24)] bg-[#07111f]/90 text-[#ff9d3c]"><Utensils className="h-4 w-4" /></div>
      <div className="absolute bottom-[15%] right-[15%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(0,122,255,.3)] bg-[#07111f]/90 text-[#149CFF]"><Car className="h-4 w-4" /></div>
    </div>
  );
}

export function LoadingCards() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="amd-glass amd-card flex h-[154px] overflow-hidden">
          <div className="amd-skeleton w-[35%]" />
          <div className="flex-1 p-4">
            <div className="amd-skeleton h-5 w-2/3 rounded-lg" />
            <div className="amd-skeleton mt-3 h-3 w-1/2 rounded-lg" />
            <div className="amd-skeleton mt-5 h-3 w-3/4 rounded-lg" />
            <div className="amd-skeleton mt-5 h-9 w-28 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
