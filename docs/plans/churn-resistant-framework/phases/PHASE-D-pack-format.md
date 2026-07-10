# Phase D — Pack format + overlays

Depends: C (anchor-core extracted, API proven). Blocks: E. Parallel-allowed: G (the only declared parallelism).
Binding rules: [AGENT-RULES.md](../AGENT-RULES.md) 13–15, 19–20. Design refs: [00-DESIGN.md](../00-DESIGN.md) "Selector pack", "Locale", D2/D3/D12/D13/D15/D16.

## Context you need

- Until now, anchor maps are in-code data in each consumer. This phase moves them to remote JSON: **base pack** per site + **per-consumer overlays**, fetched from a public repo, validated by the exact typed parser (already built in Phase B — extend, don't rewrite), activated only after state-aware preflight.
- `critical` does NOT exist in packs. Each consumer publishes a **contract file** (`required`/`optional` anchor ids); CI cross-checks coverage.
- Two NEW repos this phase. They are SEPARATE on purpose (D16):
  - `selector-packs` — PUBLIC: schema, packs, overlays, contracts, docs. MIT.
  - `selector-corpus` — PRIVATE: sanitised fixtures + oracles. Single source of truth for the corpus from now on; consumer repos keep pinned copies only.
- Trust model recap (D12/D15): a hostile pack can at worst mis-target read anchors. Action-class anchors: exact vocabulary enforced at parse, code-owned invariants at resolve, **explicit local user approval** before an action-anchor pack change activates.

## Prerequisites checklist
- [ ] Phase C exit posted (both consumers on extracted anchor-core).
- [ ] GitHub access for creating both repos (corpus repo PRIVATE — verify visibility after creation).

## Tasks

### Task 1 — Schema v2 frozen
In `selector-packs/schema/`: formalize the 00-DESIGN sketch — top level `{schema:2, site, version (date-serial regex), minCore, anchors{}}`; anchor fields `risk, cardinality, route, pageState, allowedRoot, expectedAbsentWhen, strategies[], require[]`, roleName strategies carry `accessibleName.byLocale / verifiedLocales / unknownLocalePolicy`. Overlay format: same shape + `extends: "<base version range>"`, may add anchors and append strategies, may NOT weaken `require` or change `risk`. Validation = the exact typed parser (imported from anchor-core), NOT ajv (AGENT-RULES 14). Commit with valid + invalid example fixtures; parser tests extended for v2 fields + overlay merge rules.

### Task 2 — Repos + CI
- `selector-packs` CI: typed-parser validation of every pack/overlay; version monotonicity vs previous commit; contract coverage cross-check; risk-vocabulary enforcement (positional/fuzzy on action anchor = CI fail).
- `selector-corpus` (PRIVATE) CI: secret/PII scanner (the Phase A grep set, automated + extended) on every fixture add; oracle files schema-checked. Move corpus fixtures here from consumer repos; consumers keep pinned copies via an update script (`npm run update-corpus` with explicit pin).

### Task 3 — Author chatgpt.com base pack + overlays
Base pack generated FROM the Phase B/C in-code anchor maps (they are already descriptor-shaped — write a one-off export script rather than retyping). Overlays: `tampermonkey-extension`, `tampermonkey-userscript`, `ophel-fork` (TOC rail, model menu, sidebar anchors), `prompt-queue` (D8b — its needed anchors; inventory the Prompt-queue repo first). Contract files per consumer. CI green = coverage proven.

### Task 4 — Loader (consumer-side companion module, NOT inside anchor-core)
anchor-core stays network-free. New small module (lives in the anchor-core repo as a second entry point, or its own package — pick one, note in Q and A.md):
```
fetchPack(siteId, {bakedPack, overlayId, storage, fetcher, pin}) →
  remote fetch (raw.githubusercontent; SHA-pinned jsdelivr when pin mode)
  → ETag/TTL ~6h stale-while-revalidate (serve current, refresh in background)
  → exact typed parse (reject → keep current, log)
  → version-gate (must be > current)
  → PREFLIGHT (below)
  → atomic activation (single swap; resolver keeps strategy-index memos only for unchanged anchors)
  → persist last TWO good packs (rollback = swap back one)
```
Preflight: resolve every contract-`required` anchor against the live page in diagnostic mode; classify `valid_present / valid_expected_absent / invalid_candidate / ambiguous / unexpected_absent`; activation fails only on the last three **where the current page state expects the anchor** (Stop button absent while idle ≠ rejection). Injectable `fetcher`/`storage`: GM_xmlhttpRequest + GM storage (userscript), fetch + chrome.storage (MV3). Unit tests: every failure path (offline first-run → baked, corrupt remote, downgrade attempt, schema-invalid, TTL refresh, preflight rejection, rollback to previous good).

### Task 5 — Rollout asymmetry (D15)
Diff the incoming pack vs active: read/navigate-only changes → auto-activate post-preflight. Any change touching an `input|action|destructive` anchor's strategies → hold + prompt the user (diff shown: anchor id, old vs new strategies, preflight result) → explicit approve → activate; deny → stay on current, remember denial for that version. Approval state persisted per pack version. Tests: both paths, mixed pack (read changes activate only after the action part is approved — atomic, no partial).

### Task 6 — Kill switch / pin
Consumer setting `packPin: "<version>" | "baked"` honored by loader (skips fetch entirely on `baked`). Test.

### Task 7 — Docs
`selector-packs/README.md`: bump playbook (capture → sanitise via projector → edit pack → oracle matrix in corpus CI → merge), schema reference, security model (risk classes, what code refuses regardless of pack content, why action changes prompt). Written for a stranger.

## Acceptance gates
- Both new repos' CI green (links). Corpus repo verified PRIVATE.
- Oracle matrix: base+overlay resolves 100% of contract-required anchors on newest fixture; **100% action-anchor precision across full corpus**.
- Loader fault matrix green (all Task 4 + 5 + 6 cases; evidence linked).
- **M2 demo recorded in Q and A.md**: simulated break (mutate local fixture) → feature degrades + resolution-state event → fix by editing ONE json → recovery on pack reload. No js edits.
- Exit (may trail into E): first REAL selector-only breakage repaired by pack bump alone.

## Do NOT
- No telemetry, no server, no signing (deferred — D15; SHA-pin is the strict mode).
- No heuristic strategies in any pack (parser must reject; that's the test).
- Never commit a fixture to the PUBLIC packs repo — fixtures live in the private corpus only.
