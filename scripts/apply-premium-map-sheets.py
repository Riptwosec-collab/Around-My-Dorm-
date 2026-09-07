from pathlib import Path

path = Path("components/AroundMyDormApp.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        'className="relative mt-4 h-[58dvh] min-h-[450px] max-h-[720px] overflow-hidden rounded-[28px] border border-[rgba(0,140,255,.28)] bg-[#030812] shadow-[0_0_28px_rgba(0,122,255,.12)]"',
        'className="amd-map-frame relative mt-4 h-[58dvh] min-h-[450px] max-h-[720px] overflow-hidden rounded-[28px] border border-[rgba(0,140,255,.28)] bg-[#030812] shadow-[0_0_28px_rgba(0,122,255,.12)]"',
    ),
    (
        'className="amd-chip h-11 appearance-none bg-[#07111f]/90 px-5 pr-9 text-[12px] font-semibold text-white outline-none"',
        'className="amd-map-control amd-map-radius-control amd-chip h-11 appearance-none bg-[#07111f]/90 px-5 pr-9 text-[12px] font-semibold text-white outline-none"',
    ),
    (
        'className="amd-btn amd-btn-primary absolute left-1/2 top-[64px] z-20 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-bold shadow-xl"',
        'className="amd-map-control amd-map-search-area amd-btn amd-btn-primary absolute left-1/2 top-[64px] z-20 min-h-11 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-bold shadow-xl"',
    ),
    (
        'className="amd-glass absolute left-1/2 top-[108px] z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-[9px] font-semibold text-[#8ecbff]"',
        'className="amd-map-control amd-map-discovery-control amd-btn amd-btn-glass absolute left-1/2 top-[112px] z-20 min-h-11 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-[9px] font-semibold text-[#8ecbff]"',
    ),
    (
        'className={`amd-glass absolute right-4 z-20 grid h-12 w-12 place-items-center rounded-full text-[#149CFF] transition-[bottom] duration-[var(--motion-normal)] ${selectedPlace ? "bottom-[340px]" : "bottom-5"}`}',
        'className={`amd-map-control amd-location-control amd-btn amd-icon-btn absolute right-4 z-20 grid h-12 w-12 place-items-center rounded-full text-[#149CFF] transition-[bottom,transform,background-color,border-color,box-shadow] duration-[var(--motion-normal)] ${selectedPlace ? "bottom-[340px]" : "bottom-5"}`}',
    ),
]

changed = False
for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"Expected map UI pattern not found: {old[:110]}")
    text = text.replace(old, new, 1)
    changed = True

if changed:
    path.write_text(text, encoding="utf-8")
    print("Premium map control classes applied")
else:
    print("Premium map control classes already present")
