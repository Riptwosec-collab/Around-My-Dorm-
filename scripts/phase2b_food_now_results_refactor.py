from pathlib import Path

path = Path("components/AroundMyDormApp.tsx")
source = path.read_text()

if "const [foodNowResults, setFoodNowResults]" in source:
    raise SystemExit(0)

old_import = 'import { recommendFoodNow as rankFoodNowOptions, type FoodNowOptions } from "@/lib/discovery/food-now";'
new_import = 'import { recommendFoodNow as rankFoodNowOptions, type FoodNowOptions, type FoodNowResult } from "@/lib/discovery/food-now";'
assert old_import in source, "Food Now engine import anchor missing"
source = source.replace(old_import, new_import, 1)

state_anchor = '  const [foodNowOpen, setFoodNowOpen] = useState(false);'
state_replacement = state_anchor + '\n  const [foodNowResults, setFoodNowResults] = useState<FoodNowResult[]>([]);'
assert state_anchor in source, "Food Now state anchor missing"
source = source.replace(state_anchor, state_replacement, 1)

pick_anchor = '  function pickFoodNow() { setFoodNowOpen(true); }'
pick_replacement = '  function pickFoodNow() { setFoodNowResults([]); setFoodNowOpen(true); }'
assert pick_anchor in source, "pickFoodNow anchor missing"
source = source.replace(pick_anchor, pick_replacement, 1)

start_marker = '  function recommendFoodNow(options: FoodNowOptions) {'
end_marker = '  function createCollection()'
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
    setFoodNowResults(ranked);
  }

'''
source = source[:start] + new_function + source[end:]

sheet_anchor = '{foodNowOpen && <FoodNowSheet language={settings.language} defaultRadius={radiusMeters} onClose={() => setFoodNowOpen(false)} onSubmit={recommendFoodNow} />}'
sheet_replacement = '{foodNowOpen && <FoodNowSheet language={settings.language} defaultRadius={radiusMeters} results={foodNowResults} onClose={() => setFoodNowOpen(false)} onSubmit={recommendFoodNow} onOpenPlace={openDetail} />}'
assert sheet_anchor in source, "FoodNowSheet render anchor missing"
source = source.replace(sheet_anchor, sheet_replacement, 1)

path.write_text(source)
