export type CategoryId =
  | "food"
  | "local_food"
  | "noodle"
  | "thai_food"
  | "isan_food"
  | "mookata"
  | "japanese"
  | "korean_food"
  | "vietnamese_food"
  | "hotpot"
  | "bbq"
  | "chinese_food"
  | "shopping"
  | "night_food"
  | "cafe"
  | "bar"
  | "convenience"
  | "supermarket"
  | "market"
  | "pharmacy"
  | "clinic"
  | "hospital"
  | "laundry"
  | "barber"
  | "salon"
  | "fitness"
  | "hardware"
  | "mobile_repair"
  | "computer_repair"
  | "auto_repair"
  | "tire_shop"
  | "gas_station"
  | "ev_charger"
  | "atm"
  | "bank"
  | "topup"
  | "parcel"
  | "post_office"
  | "copy_print"
  | "motorcycle_rental"
  | "parking"
  | "monthly_parking"
  | "pet_shop"
  | "vet"
  | "water"
  | "dorm_supplies"
  | "service"
  | "other";

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Legacy dataset format kept for backward compatibility. */
export type OpeningHours = Record<DayKey, string | null>;

export type OpeningPeriod = {
  open: string;
  close: string;
};

export type StructuredOpeningHours = Partial<Record<DayKey, OpeningPeriod[] | null>>;

export type SpecialHours = {
  date: string;
  periods: OpeningPeriod[] | null;
  closed?: boolean;
};

export type PlaceDataSource = {
  provider: string;
  url?: string | null;
  checkedAt: string;
};

export type Pricing = {
  type: "range" | "fixed" | "per_person" | "per_hour" | "per_day" | "per_month" | "free" | "unknown";
  min: number | null;
  max: number | null;
  fixed: number | null;
  unit: string | null;
  currency: "THB";
  displayText: string | null;
  verifiedAt: string | null;
};

export type PlaceType = "local" | "chain" | "independent" | "community" | "franchise" | "unknown";
export type DataStatus = "verified" | "partial" | "stale" | "unverified";

export type PlaceDistance = {
  straightLineMeters: number | null;
  walkingDistanceMeters: number | null;
  walkingMinutes: number | null;
  motorcycleDistanceMeters: number | null;
  motorcycleMinutes: number | null;
  drivingDistanceMeters: number | null;
  drivingMinutes: number | null;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number | null;
  image?: string | null;
  isRecommended?: boolean;
  isPopular?: boolean;
  availability?: string | null;
  source?: string | null;
  verifiedAt?: string | null;
};

export type DeliveryPlatform = {
  provider: string;
  url: string;
  verifiedAt: string | null;
};

export type ParkingAvailabilityStatus = "available" | "call_to_confirm" | "full" | "unknown";

export type ParkingDetails = {
  parkingType: "hourly" | "daily" | "monthly" | "mixed" | "unknown";
  hourlyPrice: number | null;
  dailyPrice: number | null;
  monthlyPrice: number | null;
  deposit: number | null;
  accessHours: string | null;
  access24Hours: boolean | null;
  coveredParking: boolean | null;
  cctv: boolean | null;
  securityGuard: boolean | null;
  gateAccess: string | null;
  overnightAllowed: boolean | null;
  evCharging: boolean | null;
  estimatedCapacity: number | null;
  availabilityStatus: ParkingAvailabilityStatus;
  availabilityVerifiedAt: string | null;
};

export type Place = {
  id: string;
  googlePlaceId: string | null;
  name: string;
  nameEn: string | null;
  slug: string;
  category: CategoryId;
  categories: CategoryId[];
  subcategory: string | null;
  shortDescription: string;
  description: string;
  address: string | null;
  area: string;
  soi: string | null;
  latitude: number | null;
  longitude: number | null;

  /** Legacy distance fields retained so existing UI/data continue to work. */
  distanceKm: number | null;
  straightLineDistanceKm?: number | null;
  walkingMinutes: number | null;
  drivingMinutes: number | null;
  walkingDistanceKm?: number | null;
  drivingDistanceKm?: number | null;
  distance?: PlaceDistance;

  openingHours: OpeningHours;
  structuredOpeningHours?: StructuredOpeningHours;
  openingHoursText?: string | null;
  specialHours?: SpecialHours[];
  is24Hours: boolean;
  liveOpenNow?: boolean | null;
  temporaryClosed?: boolean;
  permanentlyClosed?: boolean;

  priceLevel: 1 | 2 | 3 | 4 | null;
  priceText: string | null;
  averagePricePerPerson: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  pricing?: Pricing;

  popularMenus: string[];
  recommendedItems: string[];
  menuItems?: MenuItem[];
  tags: string[];
  rating: number | null;
  reviewCount: number | null;
  localScore?: number | null;
  placeType?: PlaceType;

  phone: string | null;
  line: string | null;
  facebook: string | null;
  instagram: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  googleMaps?: {
    placeId: string | null;
    url: string | null;
    latitude: number | null;
    longitude: number | null;
  };

  image: string | null;
  images: string[];
  coverImage?: string | null;
  galleryImages?: string[];
  menuImages?: string[];
  parkingImages?: string[];
  imageSource?: string | null;

  paymentMethods: string[];
  delivery: boolean | null;
  deliveryApps: string[];
  deliveryPlatforms?: DeliveryPlatform[];
  dineIn: boolean | null;
  takeaway: boolean | null;

  parking: {
    available: boolean | null;
    type: string | null;
    price: string | null;
    note: string | null;
  };
  parkingDetails?: ParkingDetails;

  airConditioned: boolean | null;
  wifi: boolean | null;
  powerOutlet: boolean | null;
  toilet: boolean | null;
  petFriendly: boolean | null;
  wheelchairAccessible: boolean | null;
  openLate: boolean | null;
  studentFriendly: boolean | null;
  goodForWorking: boolean | null;

  recommended: boolean;
  localFavorite: boolean;
  verified: boolean;
  dataStatus?: DataStatus;
  lastVerified: string | null;
  source: string[];
  dataSources?: PlaceDataSource[];
  openingHoursVerifiedAt?: string | null;
  priceVerifiedAt?: string | null;
  locationVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
  imageVerifiedAt?: string | null;
  deliveryVerifiedAt?: string | null;
  parkingVerifiedAt?: string | null;
  notes: string | null;
};

export type SortMode =
  | "recommended"
  | "distanceAsc"
  | "distanceDesc"
  | "rating"
  | "reviews"
  | "price"
  | "openNow"
  | "local"
  | "localScore"
  | "late";
