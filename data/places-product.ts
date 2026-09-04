import { PLACES as EXPANDED_PLACES } from "./places-expanded";
import { enrichPlace } from "./enrichments";
import type { Place } from "@/types/place";

export const PLACES: Place[] = EXPANDED_PLACES.map(enrichPlace);
