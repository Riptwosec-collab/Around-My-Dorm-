from pathlib import Path

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected patch anchor not found in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


# Database runtime: Supabase canonical/user data first, then user-scoped Google cloud cache.
replace_once(
    'lib/database/places.ts',
    'import { prepareProvenancePatch } from "@/lib/field-provenance";\n',
    'import { prepareProvenancePatch } from "@/lib/field-provenance";\nimport { applyGoogleCloudPlaceLayer } from "@/lib/google-cloud-enrichment";\n',
)
replace_once(
    'lib/database/places.ts',
    '  return [...base, ...additions];\n',
    '  return applyGoogleCloudPlaceLayer([...base, ...additions]);\n',
)

# Data Management: expose one explicit bulk action. Mounting this component performs cloud reads only.
replace_once(
    'components/DataManagement.tsx',
    'import { GoogleMapsUsageDashboard } from "@/components/GoogleMapsUsageDashboard";\n',
    'import { GoogleMapsUsageDashboard } from "@/components/GoogleMapsUsageDashboard";\nimport { GoogleCloudAutoEnrichment } from "@/components/GoogleCloudAutoEnrichment";\n',
)
replace_once(
    'components/DataManagement.tsx',
    '        <GoogleMapsUsageDashboard language={language} />\n\n        <GooglePlaceIdManager places={places} language={language} onReload={onReload} />\n',
    '        <GoogleMapsUsageDashboard language={language} />\n\n        <GoogleCloudAutoEnrichment places={places} language={language} onReload={onReload} />\n\n        <GooglePlaceIdManager places={places} language={language} onReload={onReload} />\n',
)

# Manual Place ID decisions: Google candidate content is transient; durable Place IDs remain.
path = ROOT / 'lib/storage/google-place-matches.ts'
text = path.read_text()
text = text.replace(
    'supabase.from("amd_google_place_matches").select("place_id,google_place_id,status,confidence,candidate,updated_at")',
    'supabase.from("amd_google_place_matches").select("place_id,google_place_id,status,confidence,candidate,candidate_expires_at,updated_at")',
)
old = '  recordsCache = (matches.data || []).filter((row: any) => row.google_place_id).map((row: any) => ({ id: `${row.place_id}:${row.google_place_id}`, localPlaceId: row.place_id, googlePlaceId: row.google_place_id, candidateName: row.candidate?.name || "", decision: row.status === "rejected" ? "rejected" : row.status === "linked" ? "linked" : "review", confidence: row.confidence || 0, distanceMeters: row.candidate?.distanceMeters ?? null, chainSafetyPassed: row.candidate?.chainSafetyPassed !== false, createdAt: row.updated_at }));\n'
new = '  recordsCache = (matches.data || []).filter((row: any) => row.google_place_id).map((row: any) => { const candidateFresh = !row.candidate_expires_at || new Date(row.candidate_expires_at).getTime() > Date.now(); const candidate = candidateFresh ? row.candidate : null; return { id: `${row.place_id}:${row.google_place_id}`, localPlaceId: row.place_id, googlePlaceId: row.google_place_id, candidateName: candidate?.name || "", decision: row.status === "rejected" ? "rejected" : row.status === "linked" ? "linked" : "review", confidence: row.confidence || 0, distanceMeters: candidate?.distanceMeters ?? null, chainSafetyPassed: candidate?.chainSafetyPassed !== false, createdAt: row.updated_at }; });\n'
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('Expected Google match record mapping anchor not found')

old = '  const candidate = { name: record.candidateName, distanceMeters: record.distanceMeters, chainSafetyPassed: record.chainSafetyPassed };\n  const { error } = await supabase.from("amd_google_place_matches").upsert({ user_id: user.id, place_id: record.localPlaceId, google_place_id: record.googlePlaceId, status: record.decision, confidence: record.confidence, candidate, reviewed_at: now, updated_at: now }, { onConflict: "user_id,place_id" });\n'
new = '  const candidate = record.decision === "review" ? { name: record.candidateName, distanceMeters: record.distanceMeters, chainSafetyPassed: record.chainSafetyPassed } : null;\n  const candidateExpiresAt = record.decision === "review" ? new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString() : null;\n  const { error } = await supabase.from("amd_google_place_matches").upsert({ user_id: user.id, place_id: record.localPlaceId, google_place_id: record.googlePlaceId, status: record.decision, confidence: record.confidence, candidate, candidate_expires_at: candidateExpiresAt, reviewed_at: now, updated_at: now }, { onConflict: "user_id,place_id" });\n'
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('Expected Google match save anchor not found')
path.write_text(text)

print('Google cloud auto enrichment integration applied.')
