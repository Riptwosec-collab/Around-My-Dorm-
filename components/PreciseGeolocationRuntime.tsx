"use client";

import { useEffect } from "react";

type GeoErrorLike = GeolocationPositionError & {
  PERMISSION_DENIED: 1;
  POSITION_UNAVAILABLE: 2;
  TIMEOUT: 3;
};

function makePositionUnavailable(message: string): GeoErrorLike {
  return {
    code: 2,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeoErrorLike;
}

export function PreciseGeolocationRuntime() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const geolocation = navigator.geolocation;
    const prototype = Object.getPrototypeOf(geolocation) as Geolocation;
    const nativeGetCurrentPosition = prototype.getCurrentPosition;
    const nativeWatchPosition = prototype.watchPosition;
    const nativeClearWatch = prototype.clearWatch;

    if (
      typeof nativeGetCurrentPosition !== "function" ||
      typeof nativeWatchPosition !== "function" ||
      typeof nativeClearWatch !== "function"
    ) return;

    const preciseGetCurrentPosition: Geolocation["getCurrentPosition"] = function (
      success,
      error,
      options,
    ) {
      const targetAccuracyMeters = 80;
      const acceptableAccuracyMeters = 250;
      const requestedTimeout = options?.timeout;
      const maxWaitMs = Number.isFinite(requestedTimeout) && (requestedTimeout ?? 0) > 0
        ? Math.max(requestedTimeout as number, 15000)
        : 15000;

      let settled = false;
      let bestPosition: GeolocationPosition | null = null;
      let watchId: number | null = null;
      let timerId: number | null = null;
      const startedAt = Date.now();

      const cleanup = () => {
        if (watchId !== null) nativeClearWatch.call(geolocation, watchId);
        if (timerId !== null) window.clearTimeout(timerId);
      };

      const finishSuccess = (position: GeolocationPosition) => {
        if (settled) return;
        settled = true;
        cleanup();
        success(position);
      };

      const finishError = (geoError: GeolocationPositionError) => {
        if (settled) return;
        settled = true;
        cleanup();
        error?.(geoError);
      };

      timerId = window.setTimeout(() => {
        if (bestPosition && bestPosition.coords.accuracy <= acceptableAccuracyMeters) {
          finishSuccess(bestPosition);
          return;
        }
        const accuracy = bestPosition ? Math.round(bestPosition.coords.accuracy) : null;
        finishError(makePositionUnavailable(
          accuracy
            ? `Location is too approximate (±${accuracy} m). Enable Precise Location and try again.`
            : "Could not acquire a precise location. Enable Precise Location and try again.",
        ));
      }, maxWaitMs);

      watchId = nativeWatchPosition.call(
        geolocation,
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) return;

          if (!bestPosition || accuracy < bestPosition.coords.accuracy) bestPosition = position;

          if (accuracy <= targetAccuracyMeters) {
            finishSuccess(position);
            return;
          }

          if (Date.now() - startedAt >= 5000 && accuracy <= acceptableAccuracyMeters) {
            finishSuccess(position);
          }
        },
        (geoError) => {
          if (bestPosition && bestPosition.coords.accuracy <= acceptableAccuracyMeters) {
            finishSuccess(bestPosition);
            return;
          }
          finishError(geoError);
        },
        {
          ...options,
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: maxWaitMs,
        },
      );
    };

    try {
      Object.defineProperty(prototype, "getCurrentPosition", {
        configurable: true,
        writable: true,
        value: preciseGetCurrentPosition,
      });
    } catch {
      return;
    }

    return () => {
      try {
        Object.defineProperty(prototype, "getCurrentPosition", {
          configurable: true,
          writable: true,
          value: nativeGetCurrentPosition,
        });
      } catch {
        // Browser owns this API; restoration failure is harmless during unload.
      }
    };
  }, []);

  return null;
}
