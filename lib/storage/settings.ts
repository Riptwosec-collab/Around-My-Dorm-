import type { AppSettings } from "@/types/app";
import { saveSettingsCloud } from "@/lib/cloud/store";
export const SETTINGS_KEY = "cloud-only";
export function saveSettings(settings: AppSettings) { return saveSettingsCloud(settings); }
