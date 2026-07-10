# Phase F — Repair assistance

Depends: E. Ongoing after.
Design refs: 00-DESIGN.md "Diagnostics & repair loop", D4/D4b. Rules: AGENT-RULES.md 19–21.

## Goal
Breakage → repair bundle → proposed pack diff → human approves. Repair is assisted, never automatic. Humans only review diffs; nobody hand-writes selectors under pressure.

## Tasks
1. **Repair bundle exporter (user-side)** — one click in diagnostics panel + `GM_registerMenuCommand`: failing anchor ids + resolution states + pack version + allowlist-sanitised region subtree → local file. Explicit action only (D4b: user may then feed it to codex/cloud). Sanitiser = the same projector as fixtures; its secret tests must pass on the bundle path too.
2. **Candidate-report generator** — CLI: bundle/fixture + pack → for each failing anchor, enumerate live candidates with evidence (attrs, role, accessible name per locale, form relations, position) + which invariants each passes/fails. Output = human-readable report + machine JSON. This alone often makes the fix obvious.
3. **Selector-generator** — deterministic proposer: from a confirmed target node (user clicks it in a picker or marks it in the report), emit ranked strategy candidates following the authoring ranking (testid → form semantics → role+locale-name → attr combos). No LLM needed for the common case.
4. **Optional LLM ranking** — `repair-pack` CLI mode: candidate report → codex exec proposes/ranks strategy chains → applies to pack copy → runs full oracle matrix (all historical fixtures) → if green, emits ready-to-commit pack diff + PR body with matrix table + **explained diff** (what changed, why, evidence). Gate = correctness + explained diff + human approval. No auto-merge, ever.
5. **Corpus lifecycle** — every real breakage adds its sanitised fixture + oracle to the private corpus; pruning rule (keep first+last per month + every breakage fixture).
6. **Metrics** — `tools/metrics.mjs`: S1 (precision/recall on corpus) + S2 (time-to-repair: breakage detected → pack merged) from canary history + git. Writes MEASUREMENTS.md; M4 review uses it.

## Acceptance gates
- Sanitiser secret tests green on bundle path (seeded fake tokens stripped).
- **End-to-end drill**: hand-mutate a local fixture (rename composer classes) → canary/oracle flags → bundle → repair CLI produces green pack diff WITHOUT human selector-writing → human approves → consumer harness resolves. Full drill transcript linked in Q and A.md. This drill passing = framework works end-to-end.
- **M4 (real-world)**: next REAL ChatGPT churn repaired by pack bump alone within 1 day; S1/S2 logged.
