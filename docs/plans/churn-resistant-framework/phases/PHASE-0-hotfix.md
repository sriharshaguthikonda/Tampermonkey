# P0 — Hotfix today's breakage + descriptor-shape pilot (this repo)

Depends: nothing. Blocks: M1. Unblocks users NOW.
Design refs: 00-DESIGN.md pack schema sketch. Recon refs: RECON-codex-2026-07-10.md §2. Rules: AGENT-RULES.md 13, 18, 19.

## Goal
Re-fix what the 2026-07-10 ChatGPT update broke (at minimum [#19](https://github.com/sriharshaguthikonda/Tampermonkey/issues/19) paste-anywhere, re-broken per user console report) AND, while doing it, move ALL chatgpt selectors in the extension into one descriptor table shaped like the future pack schema. This is the pilot that P1's lib API is extracted from (codex recon recommendation: standardize descriptor shape locally first, extract lib after it stabilizes).

## Tasks
1. **Snapshot first** — capture current chatgpt.com DOM (logged in, one conversation, composer visible): save full `page.html` + composer region + one assistant turn into `fixtures/chatgpt.com/2026-07-10/`. User's saved HTML files in repo root are corpus too — copy (don't move) into `fixtures/chatgpt.com/<dated dirs>/`. (AGENT-RULES 19.)
2. **Diagnose #19 against snapshot** — systematic-debugging: compare failing selectors in `edge-extension/modules/25-prompt-send-part1.js:16-49` (prompt chain) and `:38-49` (send chain) against fresh snapshot; identify what churned. Record finding in issue comment.
3. **Descriptor table** — new module `edge-extension/modules/03-selectors.js` (loads after namespace, before features): `ns.selectorDescriptors` = every chatgpt element currently used across modules, as `{strategies:[...], validate:[...], critical}` objects following 00-DESIGN.md schema vocabulary (strategy types: `testid|role|css|structural` — heuristic tier comes with the lib in P3). Sources to consolidate (from recon): `00-namespace.js:256-292` (CANDIDATE/IGNORE/USER_MESSAGE/REFERENCE selectors), `25-prompt-send-part1.js:16-49`, `20-smart-copy-part1.js:38-134`, `70-auto-read.js:18-60` inline selectors.
4. **Minimal resolver shim** — `ns.selectorResolver = { one(key, opts), all(key, opts), matches(key, el), closest(key, el) }` (~100 lines, no cache beyond per-call, ordered-chain + validate predicates visible/editable + "not dictation/voice button" exclusion for send). Feature modules switch to `ns.selectorResolver.one('chatgpt.promptArea')` etc. NO new behavior beyond fixed selectors.
5. **Fix #19** — updated prompt/send strategies in the descriptor table (new primary from snapshot diff, old selectors retained as fallbacks). Userscript monolith: port ONLY the broken selector fixes + a copy of the descriptor table section (parity port of shim happens in P3; don't gold-plate now).
6. **Tests** — extend existing VM harness (`test_auto_read_navigation_controls.js` pattern) with `test_selector_descriptors.js`: loads `03-selectors.js` + shim, runs every descriptor against the 2026-07-10 fixture DOM, asserts resolution + which strategy won (mini resolution-matrix). This test IS the selector-regression seed.
7. **Verify live** — `node build.js`, load dev extension, on chatgpt.com: paste-anywhere populates composer, auto-send works, dictation button NOT clicked, TTS auto-read still reads new messages. Evidence (console log excerpt) into Q and A.md + close-comment on #19 pending user confirm.

## Acceptance gates
- `node test_selector_descriptors.js` green against fixture (paste output).
- Existing tests still green: `node test_auto_read_navigation_controls.js`, `node test_userscript_navigation_skip_parity.js`.
- Live smoke evidence posted. No selector string literals left inside feature modules (grep gate: `grep -n "querySelector" edge-extension/modules/{2*-*,70-auto-read}.js` returns only resolver-internal / descriptor-table lines).
- Diff small: no bundler, no lib, no pack loader — those are P1–P3.
