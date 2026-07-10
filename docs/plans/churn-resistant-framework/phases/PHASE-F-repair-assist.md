# Phase F — Repair assistance

Depends: E. Ongoing after (the loop runs forever).
Binding rules: [AGENT-RULES.md](../AGENT-RULES.md) 19–21 (privacy), 4–5 (evidence). Design refs: [00-DESIGN.md](../00-DESIGN.md) "Diagnostics & repair loop", D4/D4b.

## Context you need

- Everything upstream of this phase DETECTS breakage (canary, oracle corpus, user reports). This phase makes REPAIR cheap: breakage → bundle → generated candidates → proposed pack diff → human approves. Assisted, never automatic — the human reviews a diff, they don't hand-write selectors under pressure.
- Privacy chain (D4b): the repair bundle is created by explicit user action; the user may then feed it to codex/cloud. Nothing is ever sent ambiently. The bundle passes the SAME allowlist projector as fixtures — a bundle is just an unsaved fixture.
- These are Node CLI tools living in the `selector-corpus` repo (`tools/`), because they read/write fixtures + oracles there. They are NEVER shipped inside extensions.

## Prerequisites checklist
- [ ] Phase E live (canary + health panel shipping).
- [ ] Allowlist projector exists as a reusable module (built across A→D; if it's still Phase-A-era manual steps, building the projector proper is Task 0 of this phase).

## Tasks

### Task 0 (conditional) — Projector as code
If sanitisation is still manual: `tools/project-fixture.mjs` — input raw HTML subtree, output sanitised fixture per the Phase A allowlist (scripts/styles stripped, text placeholder'd except UI labels, URLs stripped, random ids rewritten, token-pattern attributes dropped). MUST fail loudly if an unknown attribute pattern survives (allowlist, not blocklist). Seeded-secret test: plant fake `Bearer x`, email, `sk-…` in input → assert absent in output.

### Task 1 — Repair bundle exporter (user-side)
Extension diagnostics panel button + `GM_registerMenuCommand` in userscript: collect failing anchor ids + their resolution states + evidence entries + pack version + projector-sanitised subtree of each failing anchor's search root → single JSON file via download. Explicit user gesture only. The projector runs IN the export path (test: seeded secret in DOM never reaches the file).

### Task 2 — Candidate-report generator
`tools/candidate-report.mjs <bundle|fixture>`: for each failing anchor, load the subtree, enumerate plausible candidates (all elements passing the anchor's `require` predicates within the allowed root), and for each print: tag, attributes, role, accessible name per available locale, form relations, testids, which code-owned invariants pass/fail, and WHY each existing strategy missed it (attribute renamed? node moved? gone?). Output: human-readable Markdown + machine JSON. This report alone usually makes the fix obvious to a human — build it before any LLM anything.

### Task 3 — Selector-generator (deterministic)
`tools/propose-strategies.mjs <bundle> <anchorId> <candidateIndex>`: given the confirmed target (human picks from Task 2's report), emit ranked strategy candidates strictly following the authoring ranking (00-DESIGN): meaningful testid → native/form semantics → role + locale-scoped name → exact attr combos. Refuse to emit positional/fuzzy for action-class anchors (same enforcement as the parser). Output = ready-to-paste pack JSON snippet.

### Task 4 — Optional LLM ranking (D4b)
`tools/repair-pack.mjs <bundle>` orchestrates: candidate report → codex exec prompt (report + failing descriptors; NO raw DOM beyond the sanitised subtree already in the bundle) → codex proposes/ranks chains → apply to a pack working copy → run FULL oracle matrix (every historical fixture in corpus) → if green: emit pack diff + PR body containing the matrix table + an **explained diff** (per anchor: what changed, why, evidence cited). Any red: print failures, no diff emitted. Human merges the PR; the tool never pushes (AGENT-RULES: no auto-merge, ever).

### Task 5 — Corpus lifecycle
Every real breakage adds its projector-sanitised fixture + oracle markers to the corpus (the bundle format is designed to convert 1:1). Pruning rule implemented in `tools/prune-corpus.mjs`: keep first + last fixture of each month + EVERY breakage fixture; dry-run mode default.

### Task 6 — Metrics
`tools/metrics.mjs`: S1 (action-anchor precision + read-anchor recall across corpus, from oracle runs) and S2 (time-to-repair: canary/report first-detect timestamp → pack-merge commit timestamp, from local canary history + git log). Writes `MEASUREMENTS.md` in the corpus repo. M4 review reads this file.

## Acceptance gates
- Projector seeded-secret tests green on BOTH paths (fixture creation + bundle export).
- **End-to-end drill (the framework's final exam)**: hand-mutate a local fixture (rename composer classes + strip the send testid) → oracle/canary flags → export bundle → `repair-pack.mjs` produces a green pack diff WITHOUT any human writing a selector → human approves → consumer harness resolves via the new pack. Full transcript linked in Q and A.md.
- **M4 (real-world, whenever it happens)**: next REAL ChatGPT churn repaired by pack bump alone within 1 day; S1/S2 logged in MEASUREMENTS.md.

## Do NOT
- No auto-merge, no auto-push, no scheduled auto-repair.
- No raw (unprojected) DOM in any bundle, prompt, or fixture.
- LLM output is never trusted directly — it only enters a pack through the full oracle matrix + human approval.
