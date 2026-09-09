import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import { savePushSubscriptionCloud } from "@/lib/cloud/store";

export type CrowdSignal = { placeId: string; level: "quiet" | "normal" | "busy"; samples: number };

export async function loadCrowdSignalsCloud(placeIds: string[]): Promise<CrowdSignal[]> {
  if (!placeIds.length) return [];
  await ensureCloudUser();
  const { data, error } = await supabase.rpc("amd_get_crowd_signals", { place_ids: placeIds.slice(0, 50) });
  if (error) throw error;
  return (data || []).map((row: any) => ({ placeId: row.place_id, level: row.crowd_level, samples: Number(row.samples || 0) }));
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export async function enablePushNotificationsCloud(vapidPublicKey: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this device");
  }
  if (!vapidPublicKey.trim()) throw new Error("Push notifications are not configured");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  await savePushSubscriptionCloud(subscription.toJSON());
  return subscription;
}
