# P3 — Integrate anchorlib + packs into this repo

Depends: P2. Blocks: M2.
Design refs: 00-DESIGN.md architecture, D7. Recon refs: RECON-codex-2026-07-10.md §2, §3 "Tampermonkey Insertion Points". Rules: AGENT-RULES.md 10, 12, 13.

## Goal
Extension + userscripts resolve every chatgpt element through anchorlib + remote pack. P0's shim retired. One simulated selector break = one json edit (M2 demo).

## Tasks
1. **Bundle lib** — build.js gains a step copying `anchorlib.iife.js` into `edge-extension/vendor/` and injecting it into manifest content-script order before `modules/03-selectors.js`. Userscript: build step (extend build.js) that prepends the IIFE into a generated `.user.js` header section, or `@require` a pinned copy — pick `@require file` for dev / inlined for release; document choice.
2. **Descriptor table → baked pack** — convert `03-selectors.js` table to `packs/chatgpt.com.json` (baked copy, generated from selector-packs repo at build time; build.js downloads pinned version or reads a git submodule/plain copy — simplest: committed copy + `npm run update-packs` script that curls latest + runs schema check).
3. **Loader wiring** — `03-selectors.js` becomes thin: `ns.anchors = Anchorlib.createResolver(bakedPack)` + async remote overlay via loader (GM_xmlhttpRequest path for userscript, fetch in extension background→message to content script if CSP blocks direct fetch — decide from actual chatgpt.com CSP during implementation, record decision).
4. **Feature migration (per-feature isolation)** — module by module, one commit each (recon seam list): `25-prompt-send-*` → `anchors.get('prompt-box')/get('send-button')`; `20-smart-copy-*` → message/turn descriptors; `70-auto-read.js` → `anchors.observe('assistant-message', ...)` wired through existing `08-observer-bus.js` (bus stays; resolver plugs in as subscriber relevance predicate). Each feature acquires elements via try/degrade wrapper: on resolve fail → feature-level disable + diagnostics event, never throw outward.
5. **Diagnostics wiring** — `05-diagnostics.js` consumes `anchors.onBreakage/onHeal` → existing diagnostics panel shows per-element health + pack version; breakage bundle export button stub (full exporter is P6).
6. **Userscript parity** — port loader + resolver usage into the monolith's config section (same descriptors via baked pack JSON inlined at build). Parity test extended.
7. **Feature flag** — `USE_ANCHORLIB` (default on) falling back to P0 shim path; keep for one release, then delete flag + shim (record removal task).
8. **Fault injection CI** — port TESTING.md §5 harness into repo tests: mutate fixture (class renames, testid strip, aria strip) → assert per-feature degradation only (S3 gate).

## Acceptance gates
- All existing + new tests green (paste): VM harness suites, descriptor regression vs full fixture corpus, fault-injection.
- M2 demo recorded in Q and A.md: simulated break → health event visible in diagnostics → fix by editing local pack json only → feature recovers on pack reload. No js edits.
- Live smoke on chatgpt.com: paste, send, TTS auto-read, smart-copy all working through anchorlib (diagnostics panel screenshot/log).
- Grep gate: zero chatgpt selector literals outside packs (`03-selectors.js` contains no selector strings anymore).
