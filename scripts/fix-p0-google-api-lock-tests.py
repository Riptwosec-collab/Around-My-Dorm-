from pathlib import Path

path = Path('tests/google-api-control.test.ts')
text = path.read_text(encoding='utf-8')
old = 'expect(getGoogleApiControlSettings()).toEqual({ batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });'
new = 'expect(getGoogleApiControlSettings()).toEqual({ locked: false, batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });'
if old not in text and new not in text:
    raise SystemExit('Expected API Control Center persistence assertion not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('P0 Google API lock test compatibility fix applied')
