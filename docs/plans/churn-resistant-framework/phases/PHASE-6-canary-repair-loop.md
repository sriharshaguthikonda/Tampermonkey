# P6 — Canary CI + repair loop

Depends: P2 (packs live). Ongoing forever after.
Design refs: 00-DESIGN.md "Diagnostics & repair loop". Rules: AGENT-RULES.md 5, 6, 14, 17, 19.

## Goal
Breakage is detected within a day (usually before users notice), produces a snapshot automatically, and repair = codex-assisted pack bump validated against the whole corpus. Humans only review the diff.

## Tasks
1. **Snapshot capturer** — CLI (`node tools/capture-snapshot.mjs`): Playwright, persistent logged-in profile (path from local config, never committed), opens chatgpt.com + a seeded conversation, saves sanitized `page.html` + key-region outerHTML + a11y tree dump into fixture-corpus format. Sanitizer strips conversation text nodes > N chars and known PII patterns; sanitizer has its own test (TESTING.md §7).
2. **Canary runner** — nightly Windows scheduled task: capture → run resolution matrix (current pack vs fresh DOM) → append row to `canary-log.jsonl`. On any FAIL or new heal: save snapshot to corpus + push notification to user + write entry to Q and A.md-style log in packs repo.
3. **Breakage bundle exporter (user-side)** — one-click in extension diagnostics panel + `GM_registerMenuCommand` in userscripts: dumps failing element ids + pack version + sanitized region HTML to a local file for the repair CLI. (No auto-upload — explicit user action, D4/privacy.)
4. **Repair CLI** — `node tools/repair-pack.mjs <bundle-or-snapshot>`: builds a codex exec prompt containing failing descriptors + relevant sanitized DOM region → codex proposes updated strategy chains → CLI applies to pack copy → runs full fixture-regression matrix → if green (incl. all historical snapshots), emits ready-to-commit pack diff + PR body with matrix table. Human merges. (LLM strictly offline-tooling — D4.)
5. **Corpus lifecycle** — every canary failure/heal snapshot auto-added to corpus; corpus pruning rule (keep: first + last of each month + every breakage snapshot).
6. **Metrics** — `tools/metrics.mjs` computes S1 (corpus resolve rate) and S2 (time-to-repair from canary-fail timestamp → pack-merge timestamp) from canary-log + git history; writes MEASUREMENTS.md. M4 exit review uses this.

## Acceptance gates
- Canary dry-run: 3 consecutive nightly runs with log rows (paste).
- Simulated breakage drill: hand-mutate a local snapshot (rename prompt-box classes) → canary flags it → repair CLI produces a green pack diff WITHOUT human selector-writing → merge → consumer harness resolves. Full drill transcript in Q and A.md. This drill passing = the whole framework works end-to-end.
- Sanitizer test green; visual check of one sanitized snapshot pasted for user sign-off.
