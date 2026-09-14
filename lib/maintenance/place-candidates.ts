import { CATEGORIES } from "@/data/categories";
import { scorePlaceDataQuality } from "@/lib/data-quality";
import { PROVIDER_CAPABILITIES } from "@/lib/data-governance";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";
import type { ImportCandidate } from "@/lib/maintenance/import-plan";
import { resolveCandidateMatch } from "@/lib/maintenance/candidate-matching";
import { normalizeText } from "@/lib/place-utils";
import type { CategoryId, OpeningHours, Place } from "@/types/place";

export type PlaceCandidateStatus = "new" | "needs_review" | "approved" | "rejected" | "merged";

export type CandidateValidationIssue = {
  code: "missing_name" | "missing_category" | "invalid_coordinates" | "possible_duplicate" | "source_conflict";
  severity: "p0" | "p1" | "p2" | "p3";
  message: string;
};

export type PlaceCandidate = {
  id: string;
  candidateKey: string;
  sourceProvider: string;
  sourceId: string | null;
  proposedPlace: Partial<Place> & { name: string };
  possibleMatchIds: string[];
  matchScore: number;
  validationIssues: CandidateValidationIssue[];
  completenessScore: number;
  status: PlaceCandidateStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

const CATEGORY_IDS = new Set(
  CATEGORIES.map((category) => category.id).filter((id): id is CategoryId => id !== "all"),
);

const EMPTY_HOURS: OpeningHours = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

function validCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  return (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function hasAnyCoordinate(latitude: number | null | undefined, longitude: number | null | undefined) {
  return latitude != null || longitude != null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("th-TH")
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "") || "place";
}

function compactKeyPart(value: string) {
  return normalizeText(value).replace(/[^a-z0-9ก-๙]+/g, "").slice(0, 80) || "unknown";
}

export function buildCandidateKey(
  sourceProvider: string,
  sourceId: string | null,
  name: string,
  latitude?: number | null,
  longitude?: number | null,
): string {
  const provider = compactKeyPart(sourceProvider);
  if (sourceId?.trim()) return `${provider}:${compactKeyPart(sourceId)}`;
  const lat = latitude != null && Number.isFinite(latitude) ? latitude.toFixed(5) : "na";
  const lng = longitude != null && Number.isFinite(longitude) ? longitude.toFixed(5) : "na";
  return `${provider}:${compactKeyPart(name)}:${lat}:${lng}`;
}

function createMaterializablePlace(
  candidateKey: string,
  sourceProvider: string,
  proposed: Partial<Place> & { name: string },
  now: string,
): Place {
  const category = proposed.category && CATEGORY_IDS.has(proposed.category) ? proposed.category : "other";
  const categories = proposed.categories?.filter((item) => CATEGORY_IDS.has(item)) ?? [];
  const source = Array.from(new Set([...(proposed.source ?? []), sourceProvider].filter(Boolean)));
  const policy = PROVIDER_CAPABILITIES[sourceProvider];

  const place: Place = {
    id: proposed.id || `candidate-${candidateKey.replace(/[^a-z0-9ก-๙]+/gi, "-")}`,
    googlePlaceId: proposed.googlePlaceId ?? null,
    name: proposed.name.trim(),
    nameEn: proposed.nameEn ?? null,
    slug: proposed.slug || slugify(proposed.name),
    category,
    categories: Array.from(new Set<CategoryId>([category, ...categories])),
    subcategory: proposed.subcategory ?? null,
    shortDescription: proposed.shortDescription ?? "",
    description: proposed.description ?? "",
    address: proposed.address ?? null,
    area: proposed.area ?? "",
    soi: proposed.soi ?? null,
    latitude: proposed.latitude ?? null,
    longitude: proposed.longitude ?? null,
    distanceKm: null,
    walkingMinutes: null,
    drivingMinutes: null,
    openingHours: policy?.canPersistHours ? proposed.openingHours ?? EMPTY_HOURS : EMPTY_HOURS,
    structuredOpeningHours: policy?.canPersistHours ? proposed.structuredOpeningHours : undefined,
    openingHoursText: policy?.canPersistHours ? proposed.openingHoursText ?? null : null,
    is24Hours: policy?.canPersistHours ? proposed.is24Hours ?? false : false,
    liveOpenNow: undefined,
    priceLevel: proposed.priceLevel ?? null,
    priceText: proposed.priceText ?? null,
    averagePricePerPerson: proposed.averagePricePerPerson ?? null,
    minPrice: proposed.minPrice ?? null,
    maxPrice: proposed.maxPrice ?? null,
    pricing: proposed.pricing,
    popularMenus: proposed.popularMenus ?? [],
    recommendedItems: proposed.recommendedItems ?? [],
    menuItems: proposed.menuItems,
    tags: proposed.tags ?? [],
    rating: policy?.canPersistRatings ? proposed.rating ?? null : null,
    reviewCount: policy?.canPersistRatings ? proposed.reviewCount ?? null : null,
    localScore: proposed.localScore ?? null,
    placeType: proposed.placeType,
    phone: proposed.phone ?? null,
    line: proposed.line ?? null,
    facebook: proposed.facebook ?? null,
    instagram: proposed.instagram ?? null,
    website: proposed.website ?? null,
    googleMapsUrl: proposed.googleMapsUrl ?? null,
    googleMaps: proposed.googleMaps,
    googleDetails: undefined,
    image: policy?.canPersistPhotos ? proposed.image ?? null : null,
    images: policy?.canPersistPhotos ? proposed.images ?? [] : [],
    coverImage: policy?.canPersistPhotos ? proposed.coverImage ?? null : null,
    galleryImages: policy?.canPersistPhotos ? proposed.galleryImages ?? [] : [],
    menuImages: policy?.canPersistPhotos ? proposed.menuImages ?? [] : [],
    parkingImages: policy?.canPersistPhotos ? proposed.parkingImages ?? [] : [],
    imageSource: policy?.canPersistPhotos ? proposed.imageSource ?? null : null,
    imageAttribution: policy?.canPersistPhotos ? proposed.imageAttribution ?? null : null,
    imageMetadata: policy?.canPersistPhotos ? proposed.imageMetadata ?? [] : [],
    paymentMethods: proposed.paymentMethods ?? [],
    delivery: proposed.delivery ?? null,
    deliveryApps: proposed.deliveryApps ?? [],
    deliveryPlatforms: proposed.deliveryPlatforms,
    dineIn: proposed.dineIn ?? null,
    takeaway: proposed.takeaway ?? null,
    parking: proposed.parking ?? { available: null, type: null, price: null, note: null },
    parkingDetails: proposed.parkingDetails,
    airConditioned: proposed.airConditioned ?? null,
    wifi: proposed.wifi ?? null,
    powerOutlet: proposed.powerOutlet ?? null,
    toilet: proposed.toilet ?? null,
    petFriendly: proposed.petFriendly ?? null,
    wheelchairAccessible: proposed.wheelchairAccessible ?? null,
    openLate: proposed.openLate ?? null,
    studentFriendly: proposed.studentFriendly ?? null,
    goodForWorking: proposed.goodForWorking ?? null,
    recommended: proposed.recommended ?? false,
    localFavorite: proposed.localFavorite ?? false,
    hiddenGem: proposed.hiddenGem ?? false,
    verified: false,
    dataStatus: "unverified",
    lastVerified: null,
    source,
    sourceId: proposed.sourceId ?? null,
    sourceUrl: proposed.sourceUrl ?? null,
    lastChecked: proposed.lastChecked ?? now,
    lastUpdated: now,
    dataSources: proposed.dataSources,
    openingHoursVerifiedAt: proposed.openingHoursVerifiedAt ?? null,
    priceVerifiedAt: proposed.priceVerifiedAt ?? null,
    locationVerifiedAt: proposed.locationVerifiedAt ?? null,
    phoneVerifiedAt: proposed.phoneVerifiedAt ?? null,
    imageVerifiedAt: proposed.imageVerifiedAt ?? null,
    deliveryVerifiedAt: proposed.deliveryVerifiedAt ?? null,
    parkingVerifiedAt: proposed.parkingVerifiedAt ?? null,
    fieldProvenance: proposed.fieldProvenance,
    notes: proposed.notes ?? null,
  };

  return place;
}

export function createPlaceCandidate(input: {
  places: Place[];
  sourceProvider: string;
  sourceId?: string | null;
  proposedPlace: Partial<Place> & { name: string };
  now?: string;
}): PlaceCandidate {
  const now = input.now ?? new Date().toISOString();
  const sourceId = input.sourceId ?? input.proposedPlace.sourceId ?? null;
  const candidateKey = buildCandidateKey(
    input.sourceProvider,
    sourceId,
    input.proposedPlace.name,
    input.proposedPlace.latitude,
    input.proposedPlace.longitude,
  );
  const validationIssues: CandidateValidationIssue[] = [];
  const name = input.proposedPlace.name.trim();
  const category = input.proposedPlace.category;

  if (!name) {
    validationIssues.push({ code: "missing_name", severity: "p0", message: "Candidate name is required." });
  }
  if (!category || !CATEGORY_IDS.has(category)) {
    validationIssues.push({ code: "missing_category", severity: "p0", message: "A valid primary category is required." });
  }
  if (
    !validCoordinates(input.proposedPlace.latitude, input.proposedPlace.longitude)
  ) {
    validationIssues.push({
      code: "invalid_coordinates",
      severity: "p0",
      message: hasAnyCoordinate(input.proposedPlace.latitude, input.proposedPlace.longitude)
        ? "Candidate coordinates are invalid."
        : "Candidate coordinates are required for Phase 2A publication.",
    });
  }
  if (!input.sourceProvider.trim()) {
    validationIssues.push({ code: "source_conflict", severity: "p0", message: "Candidate source provider is required." });
  }

  const resolution = resolveCandidateMatch(input.places, {
    name,
    sourceId,
    googlePlaceId: input.proposedPlace.googlePlaceId,
    latitude: input.proposedPlace.latitude,
    longitude: input.proposedPlace.longitude,
    address: input.proposedPlace.address,
    phone: input.proposedPlace.phone,
    website: input.proposedPlace.website,
  });
  const possibleMatchIds = resolution.matchedPlaceId
    ? [resolution.matchedPlaceId]
    : resolution.possibleMatchIds;
  if (possibleMatchIds.length > 0) {
    validationIssues.push({
      code: "possible_duplicate",
      severity: "p1",
      message: "Candidate has a possible canonical identity match and requires review.",
    });
  }

  const proposedPlace: Partial<Place> & { name: string } = {
    ...input.proposedPlace,
    name,
    source: Array.from(new Set([...(input.proposedPlace.source ?? []), input.sourceProvider].filter(Boolean))),
    sourceId,
  };
  const temporary = createMaterializablePlace(candidateKey, input.sourceProvider, proposedPlace, now);
  const completenessScore = scorePlaceDataQuality(temporary).score;
  const status: PlaceCandidateStatus = validationIssues.length > 0 ? "needs_review" : "new";

  return {
    id: candidateKey,
    candidateKey,
    sourceProvider: input.sourceProvider,
    sourceId,
    proposedPlace,
    possibleMatchIds,
    matchScore: resolution.topScore,
    validationIssues,
    completenessScore,
    status,
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
  };
}

export function candidateFromGoogle(
  result: GoogleDiscoveryCandidate,
  places: Place[],
  category?: CategoryId | null,
): PlaceCandidate {
  const proposedPlace: Partial<Place> & { name: string } = {
    name: result.name,
    googlePlaceId: result.googlePlaceId,
    sourceId: result.googlePlaceId,
    sourceUrl: result.googleMapsUrl,
    googleMapsUrl: result.googleMapsUrl,
    address: result.address,
    latitude: result.latitude,
    longitude: result.longitude,
    rating: result.rating,
    reviewCount: result.reviewCount,
    liveOpenNow: result.openNow,
    category: category ?? undefined,
    categories: category ? [category] : undefined,
    subcategory: result.primaryTypeLabel ?? result.primaryType,
    source: ["google_places_admin"],
    lastChecked: result.fetchedAt,
  };
  return createPlaceCandidate({
    places,
    sourceProvider: "google_places_admin",
    sourceId: result.googlePlaceId,
    proposedPlace,
    now: result.fetchedAt,
  });
}

export function candidateFromImport(result: ImportCandidate, places: Place[]): PlaceCandidate {
  const proposedPlace: Partial<Place> & { name: string } = {
    ...result,
    name: result.name,
    source: Array.from(new Set([...(result.source ?? []), result.sourceProvider])),
    sourceId: result.sourceId ?? null,
    sourceUrl: result.sourceUrl ?? null,
  };
  delete (proposedPlace as Record<string, unknown>).sourceProvider;
  return createPlaceCandidate({
    places,
    sourceProvider: result.sourceProvider,
    sourceId: result.sourceId ?? null,
    proposedPlace,
  });
}

export function canPublishCandidate(candidate: PlaceCandidate): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const proposed = candidate.proposedPlace;
  if (!proposed.name.trim()) blockers.push("missing_name");
  if (!proposed.category || !CATEGORY_IDS.has(proposed.category)) blockers.push("missing_category");
  if (!validCoordinates(proposed.latitude, proposed.longitude)) blockers.push("invalid_coordinates");
  if (!candidate.sourceProvider.trim() || !(proposed.source ?? []).length) blockers.push("missing_source");
  if (candidate.validationIssues.some((issue) => issue.severity === "p0")) blockers.push("p0_issue");
  if (
    candidate.possibleMatchIds.length > 0 ||
    candidate.validationIssues.some((issue) => issue.code === "possible_duplicate")
  ) {
    blockers.push("possible_duplicate");
  }
  return { allowed: blockers.length === 0, blockers: Array.from(new Set(blockers)) };
}

export function materializeReviewedPlace(candidate: PlaceCandidate): Place {
  return createMaterializablePlace(
    candidate.candidateKey,
    candidate.sourceProvider,
    candidate.proposedPlace,
    candidate.reviewedAt ?? candidate.updatedAt,
  );
}
