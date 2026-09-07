"use client";

import { useEffect } from "react";
import { CheckCircle2, Info, MapPin, XCircle } from "lucide-react";

export type ToastTone = "success" | "info" | "location" | "removed";

export function Toast({
  message,
  tone = "success",
  onDone,
  duration = 2200,
}: {
  message: string;
  tone?: ToastTone;
  onDone: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDone, message]);

  const Icon = tone === "location" ? MapPin : tone === "info" ? Info : tone === "removed" ? XCircle : CheckCircle2;
  const iconClass = tone === "removed" ? "text-[var(--amd-text-2)]" : tone === "info" ? "text-[#149CFF]" : "text-[#00E5C3]";

  return (
    <div className="amd-toast" role="status" aria-live="polite">
      <div className="amd-glass-strong mx-auto flex min-h-12 items-center gap-3 rounded-[16px] px-4 py-3 shadow-[0_16px_44px_rgba(0,0,0,.38)]">
        <Icon className={`h-[18px] w-[18px] shrink-0 ${iconClass}`} />
        <p className="min-w-0 flex-1 text-[12px] font-semibold leading-5 text-[var(--amd-text)]">{message}</p>
      </div>
    </div>
  );
}
