from pathlib import Path

path = Path('lib/google-place-id-manager.ts')
text = path.read_text(encoding='utf-8')
old_start = '  const factorsArray: MatchFactor[] = [\n'
old_end = '  ].map((factor) => ({ ...factor, label: scoreLabel(factor.score) }));\n  const available = factorsArray.filter'
if old_start not in text or old_end not in text:
    raise SystemExit('Expected factor block not found')
text = text.replace(old_start, '  const rawFactors: MatchFactor[] = [\n', 1)
text = text.replace(old_end, '  ];\n  const factorsArray: MatchFactor[] = rawFactors.map((factor) => ({ ...factor, label: scoreLabel(factor.score) }));\n  const available = factorsArray.filter', 1)
path.write_text(text, encoding='utf-8')
print('P0 Place ID type inference fix applied')
