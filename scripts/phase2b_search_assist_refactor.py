from pathlib import Path

path = Path("components/AroundMyDormApp.tsx")
source = path.read_text()

if "const [searchHistory, setSearchHistory]" in source:
    raise SystemExit(0)

import_anchor = 'import { deriveDiscoveryState } from "@/lib/discovery/derive-visible-places";'
import_replacement = '''import { deriveDiscoveryState } from "@/lib/discovery/derive-visible-places";
import { parseDiscoveryQuery, type DiscoveryIntent } from "@/lib/discovery/query-intent";
import {
  addSearchHistoryEntry,
  applyDiscoveryRelaxation,
  buildRelaxationOptions,
  buildSearchSuggestions,
  type RelaxationId,
} from "@/lib/discovery/search-assist";
import { SearchAssistPanel } from "@/components/SearchAssistPanel";'''
assert import_anchor in source, "discovery import anchor missing"
source = source.replace(import_anchor, import_replacement, 1)

state_anchor = '  const [debouncedQuery, setDebouncedQuery] = useState("");'
state_replacement = '''  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [queryIntentOverride, setQueryIntentOverride] = useState<DiscoveryIntent | null>(null);'''
assert state_anchor in source, "search state anchor missing"
source = source.replace(state_anchor, state_replacement, 1)

debounce_anchor = '''  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
'''
debounce_replacement = debounce_anchor + '''
  const parsedQueryIntent = useMemo(() => parseDiscoveryQuery(debouncedQuery), [debouncedQuery]);
  const queryIntent = queryIntentOverride ?? parsedQueryIntent;
  const searchSuggestions = useMemo(
    () => buildSearchSuggestions(query, searchHistory, settings.language, 6),
    [query, searchHistory, settings.language],
  );

  useEffect(() => {
    setQueryIntentOverride(null);
  }, [debouncedQuery]);
'''
assert debounce_anchor in source, "debounce anchor missing"
source = source.replace(debounce_anchor, debounce_replacement, 1)

object_anchor = '''      category,
      query: debouncedQuery,
      filters,'''
object_replacement = '''      category,
      query: debouncedQuery,
      queryIntent,
      filters,'''
assert object_anchor in source, "discovery query anchor missing"
source = source.replace(object_anchor, object_replacement, 1)

sort_anchor = '      sortMode,\n      verifiedOnly: settings.verifiedOnly,'
sort_replacement = '      sortMode: queryIntent.suggestedSortMode ?? sortMode,\n      verifiedOnly: settings.verifiedOnly,'
assert sort_anchor in source, "sort mode anchor missing"
source = source.replace(sort_anchor, sort_replacement, 1)

deps_anchor = '''      category,
      debouncedQuery,
      filters,'''
deps_replacement = '''      category,
      debouncedQuery,
      queryIntent,
      filters,'''
assert deps_anchor in source, "discovery dependency anchor missing"
source = source.replace(deps_anchor, deps_replacement, 1)

derive_end_anchor = '''  );

  const favoritePlaces = useMemo(() => {'''
relaxation_block = '''  );

  const searchRelaxations = useMemo(
    () => debouncedQuery
      ? buildRelaxationOptions({
          category,
          filters,
          intent: queryIntent,
          resultCount: visiblePlaces.length,
          language: settings.language,
        })
      : [],
    [debouncedQuery, category, filters, queryIntent, visiblePlaces.length, settings.language],
  );

  const favoritePlaces = useMemo(() => {'''
assert derive_end_anchor in source, "discovery memo end anchor missing"
source = source.replace(derive_end_anchor, relaxation_block, 1)

function_anchor = '  function pickFoodNow() { setFoodNowResults([]); setFoodNowOpen(true); }\n'
function_replacement = '''  function onSearchSuggestion(value: string) {
    const clean = value.replace(/\\s+/g, " ").trim();
    if (!clean) return;
    setQuery(clean);
    setDebouncedQuery(clean);
    setQueryIntentOverride(null);
    setSearchHistory((current) => addSearchHistoryEntry(current, clean));
    setSearchFocused(false);
  }

  function commitSearch() {
    const clean = query.replace(/\\s+/g, " ").trim();
    if (!clean) return;
    setDebouncedQuery(clean);
    setQueryIntentOverride(null);
    setSearchHistory((current) => addSearchHistoryEntry(current, clean));
    setSearchFocused(false);
  }

  function onRelaxSearch(relaxationId: RelaxationId) {
    const next = applyDiscoveryRelaxation(
      { category, filters, intent: queryIntent },
      relaxationId,
    );
    setCategory(next.category);
    setFilters(next.filters);
    setQueryIntentOverride(next.intent);
    setQuickFilter(null);
    setSearchFocused(false);
  }

  function pickFoodNow() { setFoodNowResults([]); setFoodNowOpen(true); }
'''
assert function_anchor in source, "Food Now function anchor missing"
source = source.replace(function_anchor, function_replacement, 1)

input_anchor = '''                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-[118px] text-[13px] font-medium text-[var(--amd-text)] outline-none placeholder:text-[var(--amd-text-3)]" />'''
input_replacement = '''                <input
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setQueryIntentOverride(null); }}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                  onKeyDown={(event) => { if (event.key === "Enter") commitSearch(); }}
                  placeholder={copy.search}
                  className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-[118px] text-[13px] font-medium text-[var(--amd-text)] outline-none placeholder:text-[var(--amd-text-3)]"
                />'''
assert input_anchor in source, "Explore search input anchor missing"
source = source.replace(input_anchor, input_replacement, 1)

clear_anchor = '''{query && <button type="button" aria-label={settings.language === "en" ? "Clear search" : "ล้างคำค้นหา"} onClick={() => setQuery("")} className="amd-btn grid h-9 w-9 min-h-0 place-items-center rounded-xl text-[var(--amd-text-3)]"><X className="h-4 w-4" /></button>}'''
clear_replacement = '''{query && <button type="button" aria-label={settings.language === "en" ? "Clear search" : "ล้างคำค้นหา"} onClick={() => { setQuery(""); setDebouncedQuery(""); setQueryIntentOverride(null); }} className="amd-btn grid h-9 w-9 min-h-0 place-items-center rounded-xl text-[var(--amd-text-3)]"><X className="h-4 w-4" /></button>}'''
assert clear_anchor in source, "clear-search anchor missing"
source = source.replace(clear_anchor, clear_replacement, 1)

panel_anchor = '''              </div>

              {locationError && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[10px] text-amber-100">{locationError}</div>}'''
panel_replacement = '''              </div>

              <SearchAssistPanel
                language={settings.language}
                query={query}
                focused={searchFocused}
                suggestions={searchSuggestions}
                recognizedLabels={queryIntent.recognizedLabels}
                relaxations={searchRelaxations}
                resultCount={visiblePlaces.length}
                onSearchSuggestion={onSearchSuggestion}
                onRelaxSearch={onRelaxSearch}
              />

              {locationError && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[10px] text-amber-100">{locationError}</div>}'''
assert panel_anchor in source, "Search Assist panel render anchor missing"
source = source.replace(panel_anchor, panel_replacement, 1)

path.write_text(source)
