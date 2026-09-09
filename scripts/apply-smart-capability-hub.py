from pathlib import Path

p = Path('components/AroundMyDormApp.tsx')
text = p.read_text(encoding='utf-8')

import_marker = 'import { PageHeader, Toggle, SettingRow, MiniMapArtwork, LoadingCards } from "@/components/AppShellPrimitives";\n'
if 'SmartCapabilityHub' not in text:
    if import_marker not in text:
        raise SystemExit('AppShell import marker missing')
    text = text.replace(import_marker, import_marker + 'import { SmartCapabilityHub } from "@/components/SmartCapabilityHub";\n')

needle = '''              <div className="mt-7 flex items-center justify-between">\n                <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#149CFF]" /><h2 className="text-[20px] font-semibold">{copy.localPick}</h2></div>'''
if '<SmartCapabilityHub' not in text:
    if needle not in text:
        raise SystemExit('Local Pick marker missing')
    hub = '''              <SmartCapabilityHub\n                places={allPlaces}\n                origin={origin}\n                language={settings.language}\n                recommendationContext={recommendationContext}\n                query={query}\n                onQuery={setQuery}\n                onOpenPlace={openDetail}\n                onMapPlace={openMap}\n              />\n\n'''
    text = text.replace(needle, hub + needle, 1)

p.write_text(text, encoding='utf-8')
print('Smart capability hub integration staged.')
