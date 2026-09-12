from pathlib import Path

path = Path('lib/google-cloud-enrichment.ts')
text = path.read_text()

# New metadata is optional at the type boundary so old 29-day cache rows and
# legacy tests remain valid. safePayload() normalizes missing values.
for old, new in [
    ('  shortAddress: string | null;', '  shortAddress?: string | null;'),
    ('  internationalPhone: string | null;', '  internationalPhone?: string | null;'),
    ('  types: string[];', '  types?: string[];'),
    ('  primaryType: string | null;', '  primaryType?: string | null;'),
    ('  hasDelivery: boolean | null;', '  hasDelivery?: boolean | null;'),
    ('  hasDineIn: boolean | null;', '  hasDineIn?: boolean | null;'),
    ('  hasTakeout: boolean | null;', '  hasTakeout?: boolean | null;'),
    ('  isReservable: boolean | null;', '  isReservable?: boolean | null;'),
    ('  hasCurbsidePickup: boolean | null;', '  hasCurbsidePickup?: boolean | null;'),
    ('  accessibility: GoogleAccessibility;', '  accessibility?: GoogleAccessibility;'),
    ('  parkingOptions: GoogleParkingOptions;', '  parkingOptions?: GoogleParkingOptions;'),
    ('  paymentOptions: GooglePaymentOptions;', '  paymentOptions?: GooglePaymentOptions;'),
]:
    text = text.replace(old, new, 1)

text = text.replace(
    'payload.accessibility.wheelchairAccessibleEntrance',
    'payload.accessibility?.wheelchairAccessibleEntrance',
)
text = text.replace(
    'Object.values(payload.parkingOptions)',
    'Object.values(payload.parkingOptions || {})',
)

# Normalize the metadata object written onto Place so consumers never need to
# distinguish between old and new cache payload versions.
text = text.replace(
'''    types: payload.types,\n    primaryType: payload.primaryType,\n    businessStatus: payload.businessStatus,\n    reservable: payload.isReservable,\n    curbsidePickup: payload.hasCurbsidePickup,\n    accessibility: payload.accessibility,\n    parkingOptions: payload.parkingOptions,\n    paymentOptions: payload.paymentOptions,''',
'''    types: payload.types ?? [],\n    primaryType: payload.primaryType ?? null,\n    businessStatus: payload.businessStatus,\n    reservable: payload.isReservable ?? null,\n    curbsidePickup: payload.hasCurbsidePickup ?? null,\n    accessibility: payload.accessibility ?? { wheelchairAccessibleEntrance: null, wheelchairAccessibleParking: null, wheelchairAccessibleRestroom: null, wheelchairAccessibleSeating: null },\n    parkingOptions: payload.parkingOptions ?? { freeParkingLot: null, paidParkingLot: null, freeStreetParking: null, paidStreetParking: null, freeGarageParking: null, paidGarageParking: null, valetParking: null },\n    paymentOptions: payload.paymentOptions ?? { cashOnly: null, creditCards: null, debitCards: null, nfc: null },''',
1,
)
text = text.replace(
'''    shortAddress: payload.shortAddress, internationalPhone: payload.internationalPhone, types: payload.types, primaryType: payload.primaryType,\n    businessStatus: payload.businessStatus, reservable: payload.isReservable, curbsidePickup: payload.hasCurbsidePickup,\n    accessibility: payload.accessibility, parkingOptions: payload.parkingOptions, paymentOptions: payload.paymentOptions, lastUpdatedAt: payload.fetchedAt,''',
'''    shortAddress: payload.shortAddress ?? null, internationalPhone: payload.internationalPhone ?? null, types: payload.types ?? [], primaryType: payload.primaryType ?? null,\n    businessStatus: payload.businessStatus, reservable: payload.isReservable ?? null, curbsidePickup: payload.hasCurbsidePickup ?? null,\n    accessibility: payload.accessibility ?? { wheelchairAccessibleEntrance: null, wheelchairAccessibleParking: null, wheelchairAccessibleRestroom: null, wheelchairAccessibleSeating: null },\n    parkingOptions: payload.parkingOptions ?? { freeParkingLot: null, paidParkingLot: null, freeStreetParking: null, paidStreetParking: null, freeGarageParking: null, paidGarageParking: null, valetParking: null },\n    paymentOptions: payload.paymentOptions ?? { cashOnly: null, creditCards: null, debitCards: null, nfc: null }, lastUpdatedAt: payload.fetchedAt,''',
1,
)

# Optional payment metadata needs null-safe access for legacy rows.
for key in ['creditCards', 'debitCards', 'nfc', 'cashOnly']:
    text = text.replace(f'payload.paymentOptions.{key}', f'payload.paymentOptions?.{key}')

path.write_text(text)
