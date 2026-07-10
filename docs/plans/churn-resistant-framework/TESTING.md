# Testing Framework (v2)

Applies to anchor-core (Phase B+), packs (D+), integrations (B/C/E+), spike (G). A phase is DONE only when its gates pass with evidence linked (CI artifact / log file path) in Q and A.md — links, not pasted walls of logs.

Headline reframe (v2): the gate that matters is **precision on action anchors** — never resolve the wrong element — not line coverage. 95%-line-coverage target dropped; gates = branch coverage on resolver logic + the oracle corpus below.

## Test pyramid

### 1. Unit (vitest) — anchor-core
- happy-dom is allowed ONLY for pure parsers (pack parser, schema/type tests, canonicalisation). Anything touching layout, visibility, `elementFromPoint`, or `interactable`-class predicates runs in **real Chromium** (Playwright) — happy-dom lies about all of those.
- Resolver: every strategy type × (hit, miss, multiple-candidates→`ambiguous`, invalid-candidate) — table-driven.
- Typed pack parser: unknown-field rejection, size caps, strategy-count caps, selector-complexity caps, version-gate, locale-schema validation. All failure paths.
- Canonicalisation: Unicode norm, whitespace collapse, case-fold config; asserts "Send" ≠ "Send later" (no punctuation stripping).
- Mutation testing: optional nice-to-have on resolver logic only — NOT a gate.

### 2. Fixture corpus + identity oracles (the heart)
- Fixtures = **allowlist-sanitised subtrees** (scripts stripped, text replaced except UI labels, URLs stripped, IDs rewritten, hydration state removed) + secret/PII scanner in CI. Raw captures live in a git-ignored local dir and are NEVER committed anywhere (D16). Corpus lives in a **separate private repo** from the public packs repo (from Phase D; before that, sanitised fixtures in this repo's `fixtures/`).
- **Identity oracles** per fixture × anchor: expected node identity (data-oracle marker), cardinality, order, root relationship, and **negative exclusions** (nodes that must NOT match — e.g. Dictate button for `send-button`).
- **Adversarial fixture list** (grow it, never shrink): Send-vs-Dictate adjacency, dual composers, modal textbox, disabled send, locale variant, A/B layout, streaming state, custom GPT, mobile width, portal menu, virtualised turns, overlay occlusion, duplicate accessible names.
- Structural-JSON fixtures complement HTML subtrees for cheap adversarial permutations (they cannot test CSS/layout predicates — those need Chromium fixtures).
- Output = resolution matrix per snapshot date × anchor, recording resolution STATE (`primary_hit`/`expected_variant_hit`/`fallback_hit`/...). Gate: **zero wrong-element resolutions on action anchors (100% precision)**; no `failed`/`ambiguous` on the newest snapshot for contract-required anchors; fallback_hits allowed but listed in PR description → triggers pack primary bump.

### 3. Integration (Playwright, real Chromium, offline)
- Serve fixtures via local static server; load real built artifacts (userscript harness page; extension via `--load-extension`).
- Scenarios: resolve all contract anchors; capability adapters (composer.setText/submit preflight logic against fixtures — submit itself only in fault-injection harness pages, never live); per-feature degradation on induced failure; locale-variant fixture → name strategy skipped → fallback or fail-closed as declared.

### 4. Self-test canary (Phase E — primary live signal)
- The passive in-session probe IS the live canary (00-DESIGN.md "Passive self-test canary"). Tests for the canary itself: probeKey dedup, state-class trigger matrix, idle-slice budget respected (fake timers), cancellation on user input, absence taxonomy correctness (`unobserved_applicable_state` ≠ healthy), no production-cache reuse.
- Secondary: Playwright matrix over synthetic fixtures in CI. Persistent-logged-in-profile automation is NOT built; optional CDP-attach to the user's own browser is a later convenience.

### 5. Fault injection (S3 gate)
- Harness mutates fixture DOM (rename classes, strip testids, wrap elements, remove aria-labels — the 4 observed churn patterns) → assert: per-feature degradation states only, no uncaught exceptions, correct resolution-state events, other features unaffected.

### 6. Contract/schema tests
- Typed parser (not ajv) validates packs in packs-repo CI; version monotonicity; every consumer contract file's `required` anchors exist in base pack + overlay; risk-class vocabulary enforcement (positional strategy on an action anchor = CI reject; non-exact name matcher on action anchor = CI reject).

### 7. Privacy + security guards
- Sanitiser test: known PII/token strings seeded in a raw capture must be stripped by the allowlist projector; projector FAILS on unknown surviving fields.
- Zero DOM writes during a full resolve pass (MutationObserver watch).
- No network egress to non-allowlisted hosts (pack fetch host only) — Playwright network log.
- Phase G additionally: bootstrap projector secret tests (`__reactRouterContext` fixtures seeded with fake tokens → projector output must not contain them).

### 8. Phase G conformance protocol (spike-only)
- Two independently derived models: RawTurn (traffic/bootstrap only) vs RenderedTurn (DOM only) — no cross-consultation. Turn alignment: id > branch+role > sequence > text-assisted, with recorded confidence.
- Per-dimension gates: turn-set precision/recall — **hard gate: ZERO hidden/system/internal turns exposed as visible (one leak fails the spike for TTS/export)**; text fidelity via narrow canonicalisation with every diff CLASSIFIED (presentation_whitespace vs content_missing vs hidden_content_exposed …); structured content (code blocks/tables/citations/attachments) compared separately; completion-event correctness vs a DOM ground-truth window (indicator gone + actions appear + quiet interval).
- Numeric gates: 0 premature completions, 0 duplicates, 100% visible completed-turn recall in core scenarios, p95 completion latency ≤ ~1s, interrupted/error classification 100%.
- Scenario corpus: ordinary / long-stream / code / citations / stop / error / regenerate / edit-branch / switch-during-generation / multi-tool / refresh-into-conversation.
- Failed comparisons emit reviewable classified diffs, not similarity scores.

## CI matrix

| Repo | Gates |
|---|---|
| this repo (anchor-core lives here until Phase C) | lint/typecheck, unit, oracle corpus, fault-injection, existing test_*.js, build.js |
| anchor-core (own repo, after C) | same + both bundle builds + branch coverage on resolver logic |
| selector-packs (public) | typed-parser validation, version monotonicity, contract cross-check, risk-vocabulary enforcement |
| corpus (private) | sanitiser/secret-scanner on every fixture add |
| ophel fork | upstream's checks (format/lint/typecheck/build) stay green + our adapter oracle tests |

## Evidence discipline

Every phase-completion claim in Q and A.md: command run + result summary + LINK to full output (CI artifact URL or repo-local log file). No green claim without evidence; no pasted 500-line logs either.
