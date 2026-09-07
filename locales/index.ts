import en from "./en";
import th from "./th";
import type { Language } from "@/types/app";

export function getCopy(language: Language): Record<string, string> {
  return language === "en" ? en : th;
}
