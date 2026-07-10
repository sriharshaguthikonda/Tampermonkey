# Phase B — Local anchor contract (this repo)

Depends: A (users unbroken). Blocks: C, G.
Design refs: 00-DESIGN.md "anchor-core", "Anchor risk classes", "Locale", "Strategy authoring ranking". Recon: RECON-codex-2026-07-10.md §2. Rules: AGENT-RULES.md 7–18.

## Goal
`packages/anchor-core/` as a LOCAL package in this repo (strict TS, built into the extension by build.js; NOT a separate repo yet — D1). Pure deterministic resolver: descriptor → candidates → invariants → result + evidence. Two contrasting consumers prove the API: composer capability (input/action anchors) + smart-copy (read anchors). Exit: both share the core without special cases.

## Tasks (TDD; commit per task = green vertical slice)
1. **Package scaffold** — `packages/anchor-core/`: strict TS, vitest, build wired into `node build.js` (IIFE output copied into `edge-extension/vendor/`). `dom-accessibility-api` added after recording the dependency review in Q and A.md (pre-approved, AGENT-RULES 12).
2. **Types** — `AnchorDescriptor` (risk, cardinality, route, pageState, allowedRoot, expectedAbsentWhen, strategies, require/forbid), `Strategy` (testid | attrs | role-name | css | semantic-relation), `ResolveResult {state, element?, strategyIndex?, evidence[]}`, resolution-state enum (8 states per design).
3. **Exact typed parser** — descriptor/pack parsing with unknown-field rejection + caps. Tests: every failure path, risk-vocabulary enforcement (positional/fuzzy on action anchor = parse error).
4. **Predicates** — visible, editable, enabled, interactable. Parser/logic tests in vitest; layout-dependent predicates (`interactable`, elementFromPoint) get Playwright-Chromium tests (TESTING.md §1 — happy-dom lies).
5. **Strategies** — testid, attr-equals, css (root-scoped), role + accessible name via dom-accessibility-api with locale-scoped name data + canonicalisation ("Send" ≠ "Send later" test), semantic relations (`associated-form-submit-control`: `button.form === input.form`, `type=submit`). NO heuristic tier (diagnostics-only, comes with Phase F repair tooling).
6. **Resolver core** — strategy loop honoring risk class rules, invariant checks, strict ambiguity rejection (multiple passing candidates = `ambiguous`), evidence trail, strategy-index memo (per-tick memo only — no cross-tick node cache). Fault-injection tests (class renames, testid strip, aria strip, duplicate candidates).
7. **Identity-oracle harness** — `fixtures/` runner asserting node identity + cardinality + negative exclusions per TESTING.md §2; seed with Phase A fixture + at least 3 adversarial fixtures (Send-vs-Dictate adjacency, dual composers, disabled send).
8. **Composer capability adapter** — `edge-extension/modules/` module exposing `composer.setText()`, `composer.submit()` (positive intent checks: same-form relationship, ready-to-submit state, content present, invariants rerun on fresh nodes immediately before click), `composer.state()`. `25-prompt-send-*` migrates to it. Feature states (waiting/degraded) + bounded retry, never throw outward.
9. **Smart-copy read consumer** — `20-smart-copy-part1.js:38-134` message/turn selectors migrate to read-class anchors through a conversation capability (`getTurns()`, `getNewestCompletedAssistantTurn()`), resolver plugged into existing `08-observer-bus.js` relevance predicates (bus keeps lifecycle ownership).
10. **Userscript parity** — port the two migrated features' resolution path into the monolith at build time; parity test extended.

## Acceptance gates
- All unit + oracle + fault-injection suites green; branch coverage on resolver logic reported (evidence linked).
- **100% precision on action anchors across oracle corpus** (zero wrong-element resolutions; negative exclusions hold).
- Existing test_*.js suites green; live smoke: paste/send + smart-copy work through the new path.
- Exit review: composer (action) and smart-copy (read) consume the same core API with zero special cases — reviewed against RECON call-site inventory; gaps deferred with note in Q and A.md.
