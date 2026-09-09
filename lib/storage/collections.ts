import type { SavedCollection } from "@/types/app";
import { saveCollectionsCloud } from "@/lib/cloud/store";
export const COLLECTIONS_KEY = "cloud-only";
export function saveCollections(collections: SavedCollection[]) { return saveCollectionsCloud(collections); }
