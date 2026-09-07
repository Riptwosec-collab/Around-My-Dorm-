import { notFound } from "next/navigation";
import { PLACES } from "@/data/places";
import { PlaceRouteClient } from "@/components/PlaceRouteClient";
export const dynamic = "force-static";
export function generateStaticParams() { return PLACES.map((place) => ({ slug: place.slug })); }
export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const place = PLACES.find((item) => item.slug === slug); if (!place) notFound(); return <PlaceRouteClient place={place} />; }
