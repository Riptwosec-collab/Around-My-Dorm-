import type { FilterState } from "@/components/FilterSheet";
import type { CategoryId } from "@/types/place";
import type { DiscoveryIntent } from "@/lib/discovery/query-intent";

export type DiscoveryConflict =
  | { type: "category"; messageKey: "category_conflict" }
  | { type: "budget"; messageKey: "budget_conflict" }
  | { type: "walking"; messageKey: "walking_conflict" };

const BOOLEAN_FILTER_KEYS = [
  "onlyOpen",
  "only24Hours",
  "openLate",
  "parking",
  "wifi",
  "powerOutlet",
  "airConditioned",
  "delivery",
  "takeaway",
  "goodForWorking",
  "studentFriendly",
  "verifiedOnly",
  "localOnly",
] as const satisfies readonly (keyof FilterState)[];

function stricterCeiling(a: number | null, b: number | null | undefined) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

export function mergeIntentFilters(
  explicit: FilterState,
  intent: DiscoveryIntent,
): FilterState {
  const next: FilterState = {
    ...explicit,
    priceLevels: [...explicit.priceLevels],
  };

  for (const key of BOOLEAN_FILTER_KEYS) {
    const queryValue = intent.filterPatch[key];
    if (queryValue === true) next[key] = true;
  }

  next.maxPrice = stricterCeiling(explicit.maxPrice, intent.filterPatch.maxPrice);
  next.maxWalkingMinutes = stricterCeiling(
    explicit.maxWalkingMinutes,
    intent.filterPatch.maxWalkingMinutes,
  );

  // priceLevels and area intentionally remain explicit UI state. Query parsing
  // does not synthesize either because mapping text to these fields would invent
  // semantics that are not present in canonical data.
  next.priceLevels = [...explicit.priceLevels];
  next.area = explicit.area;

  return next;
}

export function effectiveIntentCategories(
  explicitCategory: "all" | CategoryId,
  intent: DiscoveryIntent,
): CategoryId[] | null {
  if (explicitCategory !== "all") return [explicitCategory];
  return intent.categoryIds.length ? [...intent.categoryIds] : null;
}

export function detectDiscoveryConflicts(
  explicitCategory: "all" | CategoryId,
  _explicitFilters: FilterState,
  intent: DiscoveryIntent,
): DiscoveryConflict[] {
  const conflicts: DiscoveryConflict[] = [];

  if (
    explicitCategory !== "all"
    && intent.categoryIds.length > 0
    && !intent.categoryIds.includes(explicitCategory)
  ) {
    conflicts.push({ type: "category", messageKey: "category_conflict" });
  }

  // Budget and walking constraints are both upper bounds. Different ceilings
  // can be combined deterministically by choosing the stricter known value, so
  // they are not treated as user-facing conflicts. The union keeps these types
  // available if a future UI adds lower-bound/range constraints that can truly
  // conflict.
  return conflicts;
}
