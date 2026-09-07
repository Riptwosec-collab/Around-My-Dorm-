import type { AppSettings } from "@/types/app";

export const SETTINGS_KEY = "around-dorm-settings-v3";
export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "dark",
  language: "th",
  notifications: true,
  newPlaceAlerts: true,
  promoAlerts: true,
  parkingAlerts: true,
  verifiedOnly: false,
  defaultRadius: 500,
  preferredCategories: [],
  homeMode: "dorm",
  customHomeLocation: null,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<AppSettings> | null;
    return { ...DEFAULT_APP_SETTINGS, ...(parsed || {}), preferredCategories: Array.isArray(parsed?.preferredCategories) ? parsed!.preferredCategories! : [] };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
