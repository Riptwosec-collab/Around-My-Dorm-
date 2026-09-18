import type { SmartOpenStatus } from "@/lib/place-utils";

export type OpeningIntelligence = {
  primary: string;
  secondary: string | null;
  minutesUntilClose: number | null;
  minutesUntilOpen: number | null;
};

function bangkokMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function clockMinutes(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return (hour % 24) * 60 + minute;
}

function forwardMinutes(target: string | null, now: Date) {
  const targetMinutes = clockMinutes(target);
  if (targetMinutes == null || Number.isNaN(now.getTime())) return null;
  const current = bangkokMinutes(now);
  const delta = targetMinutes - current;
  return delta >= 0 ? delta : delta + 24 * 60;
}

export function buildOpeningIntelligence(status: SmartOpenStatus, now = new Date(), language: "th" | "en" = "th"): OpeningIntelligence {
  const minutesUntilClose = status.isOpen ? forwardMinutes(status.closesAt, now) : null;
  const minutesUntilOpen = status.isOpen === false ? forwardMinutes(status.opensAt ?? status.nextOpenAt, now) : null;

  if (status.status === "CLOSING_SOON" && minutesUntilClose != null) {
    return {
      primary: language === "en" ? "Closing soon" : "ใกล้ปิด",
      secondary: language === "en" ? `${minutesUntilClose} min` : `อีก ${minutesUntilClose} นาที`,
      minutesUntilClose,
      minutesUntilOpen: null,
    };
  }

  if (status.status === "OPENING_SOON" && minutesUntilOpen != null) {
    return {
      primary: language === "en" ? "Opening soon" : "ใกล้เปิด",
      secondary: language === "en" ? `${minutesUntilOpen} min` : `อีก ${minutesUntilOpen} นาที`,
      minutesUntilClose: null,
      minutesUntilOpen,
    };
  }

  const primary = language === "en"
    ? status.status === "OPEN" ? "Open"
      : status.status === "CLOSED" ? "Closed"
        : status.status === "OPEN_24_HOURS" ? "Open 24 hours"
          : status.status === "PERMANENTLY_CLOSED" ? "Permanently closed"
            : status.status === "TEMPORARILY_CLOSED" ? "Temporarily closed"
              : "Hours unavailable"
    : status.label;

  let secondary: string | null = status.secondaryText;
  if (language === "en") {
    if (status.status === "OPEN" && status.closesAt) secondary = `Closes ${status.closesAt}`;
    else if (status.status === "CLOSED" && (status.opensAt || status.nextOpenAt)) secondary = `Opens ${status.opensAt || status.nextOpenAt}`;
    else if (status.status === "OPEN_24_HOURS") secondary = "Open all day";
    else if (["UNKNOWN", "PERMANENTLY_CLOSED", "TEMPORARILY_CLOSED"].includes(status.status)) secondary = null;
  }

  return { primary, secondary, minutesUntilClose, minutesUntilOpen };
}
