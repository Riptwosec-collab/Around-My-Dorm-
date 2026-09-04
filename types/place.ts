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
  | "pharmacy"
  | "laundry"
  | "salon"
  | "fitness"
  | "service"
  | "parking"
  | "other";

export type OpeningHours = {
  monday: string | null;
  tuesday: string | null;
  wednesday: string | null;
  thursday: string | null;
  friday: string | null;
  saturday: string | null;
  sunday: string | null;
};

export type PlaceDataSource = {
  provider: string;
  checkedAt: string;
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
  distanceKm: number | null;
  straightLineDistanceKm?: number | null;
  walkingMinutes: number | null;
  drivingMinutes: number | null;
  walkingDistanceKm?: number | null;
  drivingDistanceKm?: number | null;
  openingHours: OpeningHours;
  openingHoursText?: string | null;
  is24Hours: boolean;
  liveOpenNow?: boolean | null;
  priceLevel: 1 | 2 | 3 | 4 | null;
  priceText: string | null;
  averagePricePerPerson: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  popularMenus: string[];
  recommendedItems: string[];
  tags: string[];
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  line: string | null;
  facebook: string | null;
  instagram: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  image: string | null;
  images: string[];
  paymentMethods: string[];
  delivery: boolean | null;
  deliveryApps: string[];
  dineIn: boolean | null;
  takeaway: boolean | null;
  parking: {
    available: boolean | null;
    type: string | null;
    price: string | null;
    note: string | null;
  };
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
  lastVerified: string | null;
  source: string[];
  dataSources?: PlaceDataSource[];
  openingHoursVerifiedAt?: string | null;
  priceVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
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
  | "late";
