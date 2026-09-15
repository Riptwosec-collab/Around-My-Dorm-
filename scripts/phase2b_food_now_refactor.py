from pathlib import Path

path = Path("components/AroundMyDormApp.tsx")
source = path.read_text()

old_import = 'import { FoodNowSheet, type FoodNowOptions } from "@/components/FoodNowSheet";'
new_import = (
    'import { FoodNowSheet } from "@/components/FoodNowSheet";\n'
    'import { recommendFoodNow as rankFoodNowOptions, type FoodNowOptions } from "@/lib/discovery/food-now";'
)
assert old_import in source, "FoodNowSheet import anchor missing"
source = source.replace(old_import, new_import, 1)

assert "  FOOD_CATEGORIES,\n" in source, "FOOD_CATEGORIES import anchor missing"
assert "  explicitPriceCeiling,\n" in source, "explicitPriceCeiling import anchor missing"
source = source.replace("  FOOD_CATEGORIES,\n", "", 1)
source = source.replace("  explicitPriceCeiling,\n", "", 1)

start_marker = "  function recommendFoodNow(options: FoodNowOptions) {"
end_marker = "  function createCollection()"
start = source.index(start_marker)
end = source.index(end_marker, start)

new_function = '''  function recommendFoodNow(options: FoodNowOptions) {
    const ranked = rankFoodNowOptions(
      allPlaces,
      options,
      recommendationContext,
      settings.language,
      5,
      settings.verifiedOnly,
    );
    setFoodNowOpen(false);
    if (ranked[0]) openDetail(ranked[0].place);
    else showToast(settings.language === "en" ? "No matching places right now" : "ยังไม่พบร้านที่ตรงเงื่อนไข", "removed");
  }

'''

source = source[:start] + new_function + source[end:]
path.write_text(source)
