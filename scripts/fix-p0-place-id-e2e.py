from pathlib import Path

path = Path('e2e/p0-place-id-manager.spec.ts')
text = path.read_text(encoding='utf-8')
old = 'await page.getByRole("button", { name: /จัดการ/ }).click();'
new = 'await page.getByRole("button", { name: "จัดการ", exact: true }).click();'
if old not in text:
    raise SystemExit('Expected Data Management selector not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('P0 Place ID mobile selector fix applied')
