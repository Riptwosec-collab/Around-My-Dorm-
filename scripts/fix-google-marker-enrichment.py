from pathlib import Path

path = Path('lib/google-place-id-manager.ts')
text = path.read_text()

old = '''  if (!left || !right) return null;\n  if (left === right) return 1;\n  const maxLength = Math.max(left.length, right.length);'''
new = '''  if (!left || !right) return null;\n  if (left === right) return 1;\n  // Google fallback queries often include the local name/area plus Bangkok.\n  // Treat normalized containment as a strong match instead of penalising the\n  // extra location tokens.\n  if (left.includes(right) || right.includes(left)) return 0.95;\n  const maxLength = Math.max(left.length, right.length);'''
if old not in text:
    raise SystemExit('textSimilarity patch target not found')
text = text.replace(old, new, 1)

old = '''  const chain = isChainPlace(place);\n  const chainAddressScore = factorMap.address.score;\n  const chainSafetyPassed = !chain || (\n    distanceMeters != null && distanceMeters <= 150 &&\n    chainAddressScore != null && chainAddressScore >= 0.45 &&\n    !linkedElsewhere\n  );\n  const blockReasons: string[] = [];\n  if (linkedElsewhere) blockReasons.push("Google Place ID is already linked to another local record");\n  if (chain && distanceMeters == null) blockReasons.push("Chain location requires coordinate proximity");\n  if (chain && distanceMeters != null && distanceMeters > 150) blockReasons.push("Chain candidate is too far from this branch");\n  if (chain && (chainAddressScore == null || chainAddressScore < 0.45)) blockReasons.push("Chain candidate requires address agreement");'''
new = '''  const chain = isChainPlace(place);\n  const chainAddressScore = factorMap.address.score;\n  const geocodeFallback = candidate.primaryType === "geocode_fallback";\n  // Existing records currently have no local coordinates. For normal Places\n  // candidates, keep the strict coordinate guard. For the explicit Google\n  // Geocoding fallback, require strong area/address agreement instead so chain\n  // branches can still be positioned on the map without inventing coordinates.\n  const chainSafetyPassed = !chain || (\n    !linkedElsewhere &&\n    chainAddressScore != null && chainAddressScore >= (geocodeFallback ? 0.55 : 0.45) &&\n    (geocodeFallback || (distanceMeters != null && distanceMeters <= 150))\n  );\n  const blockReasons: string[] = [];\n  if (linkedElsewhere) blockReasons.push("Google Place ID is already linked to another local record");\n  if (chain && !geocodeFallback && distanceMeters == null) blockReasons.push("Chain location requires coordinate proximity");\n  if (chain && !geocodeFallback && distanceMeters != null && distanceMeters > 150) blockReasons.push("Chain candidate is too far from this branch");\n  if (chain && (chainAddressScore == null || chainAddressScore < (geocodeFallback ? 0.55 : 0.45))) blockReasons.push("Chain candidate requires address agreement");'''
if old not in text:
    raise SystemExit('chain matching patch target not found')
text = text.replace(old, new, 1)

path.write_text(text)

# Ensure the matching tests cover the no-coordinate geocode fallback that is
# required by the current 91-record seed.
test_path = Path('tests/google-place-id-manager.test.ts')
test = test_path.read_text()
needle = '''  it("blocks linking a Google Place ID already used by another local record", () => {'''
case = '''  it("allows a geocoded chain branch with strong area agreement when local coordinates are missing", () => {\n    const local = place({ name: "7-Eleven ลาดพร้าว 35", placeType: "chain", area: "ลาดพร้าว 35", soi: "ลาดพร้าว 35", address: null, latitude: null, longitude: null });\n    const fallback = candidate({ name: "7-Eleven ลาดพร้าว 35 Bangkok Thailand", address: "ซอยลาดพร้าว 35 แขวงจันทรเกษม เขตจตุจักร กรุงเทพมหานคร", latitude: 13.81, longitude: 100.58, primaryType: "geocode_fallback" });\n    const result = assessGooglePlaceMatch(local, fallback, [local]);\n    expect(result.factors.name.score).toBeGreaterThanOrEqual(0.9);\n    expect(result.factors.address.score).toBeGreaterThanOrEqual(0.55);\n    expect(result.chainSafetyPassed).toBe(true);\n    expect(result.hardBlocked).toBe(false);\n  });\n\n'''
if case not in test:
    if needle not in test:
        raise SystemExit('test insertion target not found')
    test = test.replace(needle, case + needle, 1)
    test_path.write_text(test)
