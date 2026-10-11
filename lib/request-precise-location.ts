// Called only after the user taps the location control. Never monkey-patch
// Geolocation.prototype or start a GPS watch during app hydration.
export function requestPreciseLocation(
  targetAccuracyMeters = 80,
  acceptableAccuracyMeters = 250,
  maxWaitMs = 15000,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location unavailable on this device"));
      return;
    }
    const geo = navigator.geolocation;
    let watchId: number | null = null;
    let settled = false;
    let best: GeolocationPosition | null = null;
    const startedAt = Date.now();
    const cleanup = () => {
      window.clearTimeout(timer);
      if (watchId !== null) geo.clearWatch(watchId);
    };
    const complete = (result: GeolocationPosition | Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timer = window.setTimeout(() => {
      if (best && best.coords.accuracy <= acceptableAccuracyMeters) complete(best);
      else complete(new Error("Precise Location unavailable. Enable Precise Location and retry."));
    }, maxWaitMs);
    try {
      watchId = geo.watchPosition((position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy].every(Number.isFinite)) return;
        if (!best || accuracy < best.coords.accuracy) best = position;
        if (accuracy <= targetAccuracyMeters || (Date.now() - startedAt >= 5000 && accuracy <= acceptableAccuracyMeters)) complete(position);
      }, (error) => {
        if (best && best.coords.accuracy <= acceptableAccuracyMeters) complete(best);
        else complete(new Error(error.message || "Unable to access location"));
      }, { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 });
    } catch (error) {
      complete(error instanceof Error ? error : new Error("Location unavailable"));
    }
  });
}
