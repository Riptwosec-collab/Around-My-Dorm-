import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";

const outDir = path.join(process.cwd(), "supabase", "seed", "amd_places");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function q(value: string | null | undefined) {
  if (value == null) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function n(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "null" : String(value);
}
function b(value: boolean | null | undefined) {
  return value ? "true" : "false";
}
function j(value: unknown) {
  return `${q(JSON.stringify(value))}::jsonb`;
}
function row(place: Place) {
  return `(${q(place.id)},${q(place.slug)},${q(place.name)},${q(place.category)},${q(place.area)},${n(place.latitude)},${n(place.longitude)},${q(place.googlePlaceId ?? null)},${b(place.verified)},${q(place.lastChecked ?? null)},${q(place.lastUpdated ?? new Date(0).toISOString())},${j(place)})`;
}

const batchSize = 10;
const files: string[] = [];
for (let start = 0; start < PLACES.length; start += batchSize) {
  const batch = PLACES.slice(start, start + batchSize);
  const sql = `-- Around My Dorm canonical seed ${start + 1}-${start + batch.length}\ninsert into public.amd_places (id,slug,name,category,area,latitude,longitude,google_place_id,verified,last_checked,last_updated,record) values\n${batch.map(row).join(",\n")}\non conflict (id) do update set\n  slug=excluded.slug, name=excluded.name, category=excluded.category, area=excluded.area,\n  latitude=excluded.latitude, longitude=excluded.longitude, google_place_id=excluded.google_place_id,\n  verified=excluded.verified, last_checked=excluded.last_checked, last_updated=excluded.last_updated, record=excluded.record;\n`;
  const file = `batch-${String(files.length + 1).padStart(2, "0")}.sql`;
  fs.writeFileSync(path.join(outDir, file), sql, "utf8");
  files.push(file);
}
const canonical = JSON.stringify(PLACES);
const manifest = {
  schema: "amd_places-v1",
  places: PLACES.length,
  batches: files,
  sha256: crypto.createHash("sha256").update(canonical).digest("hex"),
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
if (PLACES.length !== 91) throw new Error(`Expected 91 places; got ${PLACES.length}`);
console.log(`Exported ${PLACES.length} canonical places in ${files.length} batches. sha256=${manifest.sha256}`);
