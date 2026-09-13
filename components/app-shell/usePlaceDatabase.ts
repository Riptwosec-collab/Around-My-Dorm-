"use client";

import { useCallback, useEffect, useState } from "react";
import { loadPlacesFromDatabase, type PlaceDatabaseResult } from "@/lib/database/places";
import type { Place } from "@/types/place";

export type PlaceLoader = () => Promise<PlaceDatabaseResult>;
export type UsePlaceDatabaseOptions = { loader?: PlaceLoader };
export type PlaceDatabaseState = {
  places: Place[];
  databaseSource: string;
  loading: boolean;
  error: string | null;
  warning: string | null;
  reload: () => Promise<void>;
};

export function usePlaceDatabase(options: UsePlaceDatabaseOptions = {}): PlaceDatabaseState {
  const loader = options.loader ?? loadPlacesFromDatabase;
  const [places, setPlaces] = useState<Place[]>([]);
  const [databaseSource, setDatabaseSource] = useState("supabase");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loader();
      setPlaces(result.places);
      setDatabaseSource(result.source);
      setWarning(result.warning);
      setError(null);
    } catch (cause) {
      setPlaces([]);
      setDatabaseSource("supabase");
      setWarning(null);
      setError(cause instanceof Error ? cause.message : "Cloud database unavailable");
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { places, databaseSource, loading, error, warning, reload };
}
