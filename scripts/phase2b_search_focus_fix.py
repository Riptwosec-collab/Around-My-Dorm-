from pathlib import Path

path = Path("components/AroundMyDormApp.tsx")
source = path.read_text()

old = 'onChange={(event) => { setQuery(event.target.value); setQueryIntentOverride(null); }}'
new = 'onChange={(event) => { setQuery(event.target.value); setQueryIntentOverride(null); setSearchFocused(true); }}'

if new in source:
    raise SystemExit(0)

assert source.count(old) == 1, f"expected one Explore search onChange anchor, found {source.count(old)}"
path.write_text(source.replace(old, new, 1))
