# P1 — anchorlib: resolver engine (new repo)

Depends: P0 shipped (users unbroken). Blocks: P2+.
Design refs: 00-DESIGN.md "Resolver engine", "Architecture". Rules: AGENT-RULES.md (esp. 3, 7, 11, 12).

## Goal
Standalone library that turns a semantic element descriptor (ordered strategy chain + validation predicates) into a live, cached, revalidating DOM handle — with health events. Zero deps, dual build (ESM + single-file IIFE), CI green.

## Repo bootstrap
1. Create repo `anchorlib` (final name: check npm availability at kickoff; fallbacks `dom-anchorlib`, `selector-anchor`). MIT. Location: `C:/Windows_software/anchorlib` (no spaces — codex sandbox constraint).
2. Scaffold: strict TS, vitest + happy-dom, tsup (or esbuild) producing `dist/anchorlib.esm.js` + `dist/anchorlib.iife.js`, eslint, GitHub Actions (lint/typecheck/test/build).
3. Vendor reference material into `reference/` (git-ignored): google/semantic-locators JS source (Apache-2.0 — keep license headers if code is copied into src, with NOTICE).

## Tasks (TDD order; commit per task)
1. **Types + pack schema types** — `src/types.ts`: `ElementDescriptor`, `Strategy` (css | role | attrs | structural | heuristic), `Predicate` enum, `ResolveResult {el, tier, ms}`. Test: schema fixtures typecheck.
2. **Predicates** — `src/predicates.ts`: visible, editable, clickable, inViewport, enabled, interactable (not covered by overlay — `elementFromPoint` center check). Table-driven unit tests against synthetic DOM.
3. **Strategy: css** — trivial querySelector wrapper w/ root scoping. Tests: hit/miss/multiple.
4. **Strategy: role+name** — ARIA role + accessible-name matching (exact/substring/glob). Implement minimal accessible-name computation (aria-label > aria-labelledby > text content > placeholder/title) — port logic from semantic-locators rather than reinventing; do NOT import the whole lib. Tests: native button, role= div, aria-labelledby chain, name glob.
5. **Strategy: attrs** — match on attribute set (`data-testid`, stable attrs), partial-match scoring when multiple. Tests incl. tie-break determinism.
6. **Strategy: structural** — anchored relative queries: `{anchor: "<elementId>", relation: "descendant|sibling|closest", selector, index: "first|last|n"}`. Resolves anchor via the same resolver (recursion guard). Tests incl. cycle detection.
7. **Strategy: heuristic** — fathom-lite scorer: each rule = predicate + weight over a candidate set (`candidates: "editable|buttons|articles"` etc.); highest score above threshold wins. Keep rule vocab small (≤10 rules v1). Tests: prompt-box lookalike wins over hidden textarea etc.
8. **Resolver core** — `src/resolver.ts`: strategy loop, validation, scoring, `ResolveResult` w/ tier + timing; health counters; `onBreakage`/`onHeal` events; heuristic tier only at resolve time with per-element time budget (D10); optional open-shadow-root piercing (`pierceShadow: true` per strategy). Fault-injection tests (rename classes, strip testids, remove aria, wrap in open shadow root) per TESTING.md §5.
9. **Handle cache + revalidation** — cache per `cache:` policy; `isConnected` check + re-resolve on stale; SPA navigation hook (history patching + URL poll fallback). Virtualized-DOM tests (remove/reinsert).
10. **Churn-tolerant observer** — `observe(elementId, cb, opts)`: MutationObserver wrapper that survives container remount (re-attaches via resolver), debounced, disconnect-safe. Tests: remount, rapid churn, disconnect.
11. **Pack loader (lib half)** — `loadPack(json)` validate + version-gate + freeze; runtime pack swap (`resolver.updatePack`) preserving caches where element unchanged. (Remote fetching itself is P2 — consumers own network.) Tests: invalid pack rejected, swap keeps healthy handles.
12. **Builds + smoke** — both bundles build; IIFE exposes `window.Anchorlib`; size budget: IIFE ≤ 30KB min+gz (heuristic tier included). Smoke test loads IIFE in happy-dom.
13. **Fixture corpus harness** — `fixtures/` + regression runner producing the resolution matrix (TESTING.md §2). Seed with snapshots copied from Tampermonkey repo (list in P2 plan). Gate wired into CI.
14. **Docs** — README: API, strategy vocab table, pack schema v1, "adding a strategy = code+schema bump" note. CHANGELOG started.

## Acceptance gates
- All unit + fault-injection + fixture-regression suites green in CI (paste output).
- Coverage ≥95% on resolver + loader.
- Both bundles built; IIFE size within budget; loads under Tampermonkey (manual smoke on any page via console — evidence screenshot/log).
- API reviewed against P3/P5 call-site inventory (codex recon report) — every consumer need covered or explicitly deferred with note.
