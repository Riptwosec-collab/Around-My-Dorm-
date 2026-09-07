import type { CategoryId, Place } from "@/types/place";

export type Language = "th" | "en";
export type ThemeMode = "light" | "dark" | "system";
export type HomeMode = "dorm" | "me" | "custom";

export type CustomHomeLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

export type AppSettings = {
  theme: ThemeMode;
  language: Language;
  notifications: boolean;
  newPlaceAlerts: boolean;
  promoAlerts: boolean;
  parkingAlerts: boolean;
  verifiedOnly: boolean;
  defaultRadius: number;
  preferredCategories: CategoryId[];
  homeMode: HomeMode;
  customHomeLocation: CustomHomeLocation | null;
};

export type SavedCollection = {
  id: string;
  title: string;
  icon: string;
  placeIds: string[];
};

export type RecentView = {
  placeId: string;
  viewedAt: string;
  source?: "seed" | "google" | "unknown";
  snapshot?: Place;
};
