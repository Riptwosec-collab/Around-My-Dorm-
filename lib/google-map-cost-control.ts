export const GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET = 10_000;
export const GOOGLE_DYNAMIC_MAP_WARNING = 8_000;
export const GOOGLE_DYNAMIC_MAP_HIGH = 9_000;
export const GOOGLE_DYNAMIC_MAP_CRITICAL = 9_500;
export const DEFAULT_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT = 9_500;

export type GoogleDynamicMapSafetyLevel = "safe" | "warning" | "high" | "critical" | "reached";

export function googleMapsMonthlySoftLimit(raw = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT) {
  const parsed = Math.round(Number(raw));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_GOOGLE_MAPS_MONTHLY_SOFT_LIMIT;
  return Math.min(parsed, GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET);
}

export function googleDynamicMapSafetyState(monthlyLoads: number, softLimit = googleMapsMonthlySoftLimit()) {
  const used = Math.max(0, Math.round(Number(monthlyLoads) || 0));
  const target = GOOGLE_DYNAMIC_MAP_MONTHLY_TARGET;
  const percent = Math.min(100, Math.round((used / target) * 100));
  const level: GoogleDynamicMapSafetyLevel = used >= target ? "reached" : used >= GOOGLE_DYNAMIC_MAP_CRITICAL ? "critical" : used >= GOOGLE_DYNAMIC_MAP_HIGH ? "high" : used >= GOOGLE_DYNAMIC_MAP_WARNING ? "warning" : "safe";
  const blockedBySoftLimit = used >= Math.max(1, softLimit);
  const requiresConfirmation = used >= GOOGLE_DYNAMIC_MAP_CRITICAL || used >= softLimit;
  const message = level === "reached"
    ? "MONTHLY FREE CAP TARGET REACHED"
    : level === "critical"
      ? "CRITICAL — approximately 95% of the monthly target is used."
      : level === "high"
        ? "HIGH — approximately 90% of the monthly target is used."
        : level === "warning"
          ? "WARNING — approximately 80% of the monthly Dynamic Maps free usage target is used."
          : "SAFE";
  return { used, target, percent, level, message, softLimit, blockedBySoftLimit, requiresConfirmation };
}

export function googleExternalMapsUrl(input: { lat: number; lng: number; label?: string }) {
  const query = input.label?.trim() || `${input.lat},${input.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
