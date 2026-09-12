from pathlib import Path

path = Path("components/PlaceDetail.tsx")
text = path.read_text()

def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    text = text.replace(old, new, 1)

replace_once(
    'import { GoogleLiveEnrichment } from "@/components/GoogleLiveEnrichment";\n',
    'import { GoogleLiveEnrichment } from "@/components/GoogleLiveEnrichment";\nimport { PlaceGoogleDataPanel } from "@/components/PlaceGoogleDataPanel";\n',
    "detail panel import",
)
replace_once(
    'import { dataAgeLabel, scorePlaceDataQuality } from "@/lib/data-quality";\n',
    'import { dataAgeLabel, scorePlaceDataQuality } from "@/lib/data-quality";\nimport { googleMapsDirectionsFallbackUrl, googleMapsPlaceUrl } from "@/lib/google-maps-links";\n',
    "map links import",
)
replace_once(
    '    const url = place.googleMapsUrl || googleMapsDirectionsUrl(place);',
    '    const url = googleMapsPlaceUrl(place);',
    "share maps fallback",
)
# Every remaining legacy directions helper in this detail must use the stronger
# Place ID/coordinate/text fallback helper before the old import is removed.
text = text.replace('googleMapsDirectionsUrl(place)', 'googleMapsDirectionsFallbackUrl(place)')
replace_once(
    '            <GoogleLiveEnrichment place={place} language={language} />\n',
    '            <GoogleLiveEnrichment place={place} language={language} />\n\n            <PlaceGoogleDataPanel place={place} language={language} />\n',
    "detail panel render",
)
# Old helper no longer needed by this detail component.
text = text.replace('  googleMapsDirectionsUrl,\n', '', 1)
path.write_text(text)
