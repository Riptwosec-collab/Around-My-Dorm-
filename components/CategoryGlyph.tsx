"use client";

import {
  Banknote, Bike, BriefcaseBusiness, Car, CircleParking, Coffee,
  CreditCard, Droplets, Dumbbell, Flame, Fuel, HeartPulse, Hospital,
  Landmark, Laptop, Mail, MapPin, Package, PawPrint, Pill, Printer,
  Scissors, ShoppingBag, ShoppingCart, Smartphone, Soup, Store, Utensils,
  WashingMachine, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import type { CategoryId } from "@/types/place";

// Real semantic icons for place categories. Existing emoji fields in
// data/categories.ts remain intact for backwards compatibility.
const icons: Partial<Record<CategoryId, LucideIcon>> = {
  food: Utensils, local_food: Utensils, noodle: Soup, thai_food: Utensils,
  isan_food: Flame, mookata: Flame, japanese: Soup, korean_food: Soup,
  vietnamese_food: Soup, hotpot: Soup, bbq: Flame, chinese_food: Soup,
  night_food: Utensils, cafe: Coffee, bar: Coffee,
  convenience: Store, supermarket: ShoppingCart, shopping: ShoppingBag,
  market: ShoppingCart, pharmacy: Pill, clinic: HeartPulse, hospital: Hospital,
  laundry: WashingMachine, barber: Scissors, salon: Scissors, fitness: Dumbbell,
  hardware: Wrench, mobile_repair: Smartphone, computer_repair: Laptop,
  auto_repair: Wrench, tire_shop: Car, gas_station: Fuel, ev_charger: Zap,
  atm: Banknote, bank: Landmark, topup: CreditCard, parcel: Package,
  post_office: Mail, copy_print: Printer, motorcycle_rental: Bike,
  parking: CircleParking, monthly_parking: CircleParking, pet_shop: PawPrint,
  vet: PawPrint, water: Droplets, dorm_supplies: Store, service: BriefcaseBusiness,
  other: MapPin,
};

export function CategoryGlyph({ category, className = "h-4 w-4" }: { category: CategoryId; className?: string }) {
  const Icon = icons[category] ?? Store;
  return <Icon aria-hidden="true" className={className} strokeWidth={1.9} />;
}
