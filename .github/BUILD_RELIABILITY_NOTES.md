# Build reliability fix

This file intentionally records the root causes addressed by the build-reliability PR so future CI changes do not reintroduce them.

- CI project runtime: Node.js 22+
- Dependency install: `npm ci --no-audit --no-fund`
- Superseded branch runs: cancelled via workflow concurrency
- Google cloud enrichment cancel test: waits for the in-flight async task to settle before jsdom teardown
