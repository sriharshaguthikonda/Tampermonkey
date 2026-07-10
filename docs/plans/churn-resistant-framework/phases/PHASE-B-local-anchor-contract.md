# Phase B — Local anchor contract (this repo)

Depends: A complete (user confirmed unbroken). Blocks: C, G.
Binding rules: [AGENT-RULES.md](../AGENT-RULES.md) 7–18 (trust model + code rules). Design refs: [00-DESIGN.md](../00-DESIGN.md) — read "anchor-core", "Anchor risk classes", "Locale + accessible-name handling", "Strategy authoring ranking" sections IN FULL before coding. Call-site ground truth: [RECON-codex-2026-07-10.md](../RECON-codex-2026-07-10.md) §2.

## Context you need

- You are building `packages/anchor-core/` — a LOCAL TypeScript package inside THIS repo. NOT a separate repo (that's Phase C part 3). NOT published to npm yet.
- anchor-core is a **pure resolver**: descriptor in → `{state, element?, strategyIndex?, evidence[]}` out. It must contain NO observer, NO SPA-nav patching, NO network, NO storage, NO event construction, NO clicking. If you find yourself importing MutationObserver or fetch inside the package — stop, you're building the wrong thing.
- Consumers keep their lifecycle machinery: this repo's `edge-extension/modules/08-observer-bus.js` decides WHEN to resolve; anchor-core decides WHAT matches.
- Two consumers migrate in this phase, deliberately contrasting: the composer (input+action anchors, strict trust path) and smart-copy (read anchors, recall-oriented). Exit = both use the same API with zero special cases.
- Everything else (auto-read, nav controls, remaining smart-copy) migrates in Phase E — do NOT migrate them now.

## Prerequisites checklist
- [ ] Phase A DONE-gate checked off in Q and A.md.
- [ ] Node ≥18 available; `npm` works in repo.
- [ ] You have read the three design sections named above.

## Package layout (create exactly this)

```
packages/anchor-core/
  package.json          # name "@local/anchor-core", private: true
  tsconfig.json         # strict: true, noUncheckedIndexedAccess: true
  src/
    types.ts            # descriptors, strategies, results, states
    parse.ts            # exact typed parser (unknown-field rejection + caps)
    canonicalize.ts     # name canonicalisation
    predicates.ts       # visible/editable/enabled/interactable
    strategies/
      testid.ts  attrs.ts  css.ts  roleName.ts  semanticRelation.ts
    resolver.ts          # the loop + invariants + ambiguity + evidence
    index.ts
  test/                 # vitest; *.chromium.test.ts run under Playwright
  fixtures/ -> uses repo-root fixtures/ (do not duplicate)
```

Build wiring: `node build.js` gains a step that runs the package build (esbuild/tsup → IIFE `edge-extension/vendor/anchor-core.iife.js`, global `window.AnchorCore`) and injects it into the content-script order BEFORE feature modules. Keep build.js plain JS style.

## Core API (freeze this shape; extend only via Q and A.md note)

```ts
type Risk = "read" | "navigate" | "input" | "action" | "destructive";
type ResolutionState =
  | "primary_hit" | "expected_variant_hit" | "fallback_hit"
  | "ambiguous" | "not_present_expected" | "not_present_unexpected"
  | "candidate_repair_suggested" | "failed";

interface AnchorDescriptor {
  risk: Risk;
  cardinality: "one" | "many";
  route?: string[];                    // path globs
  pageState?: Record<string, string>;
  allowedRoot?: string;                // another anchor id; resolution scoped under it
  expectedAbsentWhen?: Record<string, string>;
  strategies: Strategy[];              // parser REJECTS positional/fuzzy on action-class
  require: PredicateName[];            // e.g. ["visible","editable"]
}

interface ResolveResult {
  state: ResolutionState;
  element?: Element;                   // fresh every call — never cache across ticks
  strategyIndex?: number;
  evidence: EvidenceEntry[];           // one entry per strategy tried: what matched, what failed, why
}

const core = createAnchorCore(anchorMap, { locale: () => document.documentElement.lang, logger });
core.resolve("composer-input", { root: document });
```

## Tasks (TDD; one commit per task = green vertical slice)

### Task 1 — Scaffold + dependency review
Package skeleton as above; vitest configured; one placeholder test green; build.js step wired (IIFE lands in vendor/, extension still loads). Record the `dom-accessibility-api` review line in Q and A.md (pre-approved: MIT, zero runtime deps, testing-library's accname engine — AGENT-RULES 12). Commit: `feat(anchor-core): package scaffold + build wiring`.

### Task 2 — Types + exact typed parser
Write `types.ts` per the API block. `parse.ts` validates raw JSON into typed descriptors:
- Unknown field anywhere → throw with field path.
- Caps: ≤64 anchors/map, ≤8 strategies/anchor, css selector length ≤256, no css combinator depth >6.
- Risk-vocabulary enforcement: `structural`/`heuristic`/index-based strategy on `input|action|destructive` anchor → throw. Name matcher other than exact/oneOf on action-class → throw.
Tests: table-driven — every rejection path + happy path. Commit: `feat(anchor-core): types + exact typed parser with caps and risk vocabulary`.

### Task 3 — Canonicalisation
`canonicalize.ts`: NFC Unicode normalisation, whitespace collapse+trim, optional configured case-fold. NO punctuation stripping. Required test: `canon("Send") !== canon("Send later")`; `canon(" Send prompt ") === canon("Send prompt")`. Commit: `feat(anchor-core): name canonicalisation`.

### Task 4 — Predicates
`visible`, `editable`, `enabled` testable in vitest DOM. `interactable` (center-point `elementFromPoint` not occluded) ONLY in `*.chromium.test.ts` under Playwright — happy-dom lies about layout (TESTING.md §1). Commit: `feat(anchor-core): validation predicates (+chromium tests for interactable)`.

### Task 5 — Strategies
One file each, uniform signature `(desc, strat, root) => Element[]`:
- `testid`: `[data-testid="v"]` exact.
- `attrs`: exact attribute-equality sets.
- `css`: querySelectorAll scoped to root. Nothing clever.
- `roleName`: role match + accessible name via `dom-accessibility-api`, names from `accessibleName.byLocale[currentLocale]` (locale from the injected code-owned signal, NEVER from the candidate's own label); unknown locale → strategy skipped with evidence entry `unsupported_locale` (action anchors then fail closed if nothing else matches).
- `semanticRelation`: v1 vocabulary = `associated-form-submit-control` (submit-capable button whose `.form` === resolved input anchor's `.form`). Code-implemented; packs may only NAME relations, never define them.
Tests per strategy: hit / miss / multiple / wrong-locale (roleName) / oneOf names. Commit per strategy file or one commit: `feat(anchor-core): five strategy implementations`.

### Task 6 — Resolver core
`resolver.ts`:
1. Resolve `allowedRoot` first (recursion guard: max depth 2, cycle → throw at parse time).
2. Try strategies in order; each candidate list filtered by `require` predicates + code-owned invariants for the risk class.
3. Cardinality "one" + >1 surviving candidate → `state: "ambiguous"` (NEVER first-wins — AGENT-RULES 27).
4. States: index 0 hit → `primary_hit`; later index → `fallback_hit`; none + `expectedAbsentWhen` satisfied → `not_present_expected`; none otherwise → `not_present_unexpected`.
5. Evidence entry per strategy tried (strategy id, candidates found, filtered-out count + reasons).
6. Strategy-index memo: remember last winning index per anchor as a HINT (try it first next resolve) — but the returned element is always freshly queried. No element ever stored on the core between calls.
Fault-injection tests: class renames, testid strip, aria strip, duplicate candidates → ambiguous, root missing → not_present_unexpected. Commit: `feat(anchor-core): resolver with ambiguity rejection + evidence + strategy-index memo`.

### Task 7 — Identity-oracle harness
Runner (vitest) that loads every `fixtures/chatgpt.com/*/composer.html`-style fixture, resolves every anchor in a test anchor-map, asserts:
- resolved element carries the matching `data-oracle` marker;
- cardinality respected;
- NO strategy in an action anchor's chain matches any `data-oracle-negative` node (loop all strategies, not just winner).
Seed adversarial fixtures (hand-write minimal HTML, no capture needed): `dual-composers.html`, `send-vs-dictate-adjacent.html`, `disabled-send.html`. Phase A's real fixture joins the corpus. Commit: `test(anchor-core): identity-oracle harness + adversarial fixtures`.

### Task 8 — Composer capability adapter
New module `edge-extension/modules/04-composer-capability.js` (plain JS, loads after vendor IIFE, before features):
```js
ns.composer = {
  state(),                // "ready" | "waiting" | "degraded" — from resolve states
  setText(text),          // resolves composer-input fresh, ProseMirror/textarea insertion (reuse existing logic from 25-*)
  submit()                // THE trust path — see below
};
```
`submit()` sequence (00-DESIGN "positive intent checks" — implement ALL):
1. Fresh-resolve `composer-input` and `send-button` in the same tick (per-tick memo OK).
2. Verify same-form relationship (`button.form === input.form` or shared trusted composer root).
3. Verify button is submit-capable, enabled, unique, NOT matching any negative exclusion (dictation forbid lives HERE in code).
4. Verify composer has the expected content (non-empty; equals what setText just set when called in the paste-send flow).
5. All checks pass → click. Any check fails → return `{ok:false, reason}` + diagnostics event; feature shows degraded state; bounded retry via observer-bus, never throw outward.
`25-prompt-send-part1.js` migrates to `ns.composer.*`; its selector chains become the anchor map entries (baked, in-code for now — packs come in Phase D). Gates: oracle test still green, existing suites green. Commit: `feat(extension): composer capability over anchor-core; 25-prompt-send migrated`.

### Task 9 — Smart-copy read consumer
Conversation capability (same module or `04b-`): `getTurns()`, `getNewestCompletedAssistantTurn()` over read-class anchors (`conversation-turn`, `assistant-message`, `user-message` descriptors sourced from `20-smart-copy-part1.js:38-134` selectors). `20-smart-copy-part1.js` consumes the capability; observer-bus (`08-observer-bus.js`) keeps firing relevance events, its predicate now calls `core.resolve` instead of inline querySelector chains. Read anchors: `ambiguous`/`fallback_hit` are acceptable-with-log (recall over precision), unlike action path. Commit: `feat(extension): smart-copy via conversation capability (read anchors)`.

### Task 10 — Userscript parity
`node build.js` inlines the IIFE + anchor map + capability modules into the monolith (same mechanism the build already uses for modules — check before inventing one). Extend the existing parity test to cover composer + smart-copy paths. Commit: `feat(userscript): anchor-core parity`.

## Acceptance gates
- `npx vitest run` (package) green incl. chromium tests; branch coverage on `resolver.ts` reported (evidence linked in Q and A.md).
- **Oracle corpus: 100% action-anchor precision** — zero wrong-element resolutions, zero negative-marker matches by any action-chain strategy.
- Repo suites green: the five commands from Phase A Task 5.4.
- Live smoke: paste→send + smart-copy on chatgpt.com through the new path (evidence).
- Exit review posted to Q and A.md: composer (action) + smart-copy (read) share the core API — list any special case you were tempted to add and how you avoided it; unresolved needs deferred with note.

## Do NOT (scope fence)
- No pack loader, no remote anything (Phase D/E). Anchor map is in-code data this phase.
- No heuristic/fuzzy strategy tier (Phase F diagnostics only).
- No migration of auto-read/nav/other features (Phase E).
- No separate repo, no npm publish (Phase C part 3).
