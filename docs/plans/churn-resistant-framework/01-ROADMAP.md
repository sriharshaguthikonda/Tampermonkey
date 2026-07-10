# Roadmap: Churn-Resistant Selector Framework (v2)

Phases exit on **acceptance gates, not calendar** — no day estimates, no delivery-date claims. Each phase has a plan file in [phases/](phases/) with agent-executable tasks and test gates. Implementing agents MUST read [AGENT-RULES.md](AGENT-RULES.md) first. Repo ground truth (selector inventories, seams, file:line): [RECON-codex-2026-07-10.md](RECON-codex-2026-07-10.md). Rationale for this shape: [RESPONSE-to-first-critique.md](RESPONSE-to-first-critique.md) §4.

Parallelism rule: **one phase per repo at a time**; cross-repo parallelism only where declared below (G ∥ D/E is the only declared case).

```
A  repair + evidence (this repo)        [NOW — users are broken]
B  local anchor contract (this repo)    [depends A]
C  ophel proof + extract repo           [depends B]
D  pack format + overlays               [depends C]
E  remote rollout + self-test canary    [depends D]
F  repair assistance                    [depends E]
G  data-layer spike                     [depends B; runs PARALLEL to D/E; D/E never depend on G]
```

| Phase | Deliverable | Rollback |
|---|---|---|
| **A — Repair + evidence** | 2026-07-10 breakage (#19 paste/send at minimum) re-fixed. Sanitised composer fixture captured FIRST (raw stays git-ignored), exact regression oracle, live smoke. NO framework work during an outage. | revert commit |
| **B — Local anchor contract** | `packages/anchor-core/` in THIS repo: css + attr-equals + role/name (via dom-accessibility-api), root scoping, cardinality, risk classes, invariants, evidence, strict ambiguity rejection. Composer capability adapter + one contrasting read consumer (smart-copy). Exit: two features share the core without special cases. | nothing external depends on it |
| **C — Ophel proof, then extract** | Ophel fork: ChatGPT selectors centralised into adapter-local config (this refactor = upstream PR-1), targeted fixture tests, anchor-core integrated (DOMToolkit keeps lifecycle). Exit: same API in both repos → ONLY NOW extract anchor-core to its own repo (D1 fulfilled). | fork branch |
| **D — Pack format + overlays** | Public schema + packs repo; private sanitised corpus repo; base+overlay; exact typed parser + caps; preflight + atomic activation; last-two retention; pin/kill switch; consumer contract files. Exit: a real selector-only breakage fixed by pack change. | loader off = baked pack |
| **E — Remote rollout + canary** | Stale-while-revalidate loader in consumers; passive self-test canary (state-class probes, absence taxonomy, idle-slice budget); action-anchor restrictions + local approval gate live. | pack pin / canary flag off |
| **F — Repair assistance** | Candidate-report generator, selector-generator, optional codex/LLM ranking (D4b), human-approved pack patch flow. No auto-merge. | tooling only, zero runtime risk |
| **G — Data-layer spike** | Go/no-go spike per [PHASE-G](phases/PHASE-G-data-layer-spike.md): recorder, layered bootstrap capture, raw-vs-rendered conformance protocol, **GO / LIMITED-GO / NO-GO per consumer**. Export-first if GO; TTS stays on rendered DOM. | experimental branch, additive |

## Milestones / exit criteria

- **M1 (after A):** users unbroken; regression oracle green; live smoke evidence in Q and A.md.
- **M2 (after D):** a simulated selector break causes feature-level degradation only + resolution-state event + fix by editing ONE json file; demo recorded. Metrics use precision/recall framing (S1: 100% action-anchor precision on corpus).
- **M3 (after C→E on ophel):** ophel fork survives the same simulated break; upstream PR-1 (data refactor) opened.
- **M4 (after E/F):** next REAL ChatGPT UI change repaired by pack bump alone within 1 day → S1/S2 measured and logged.

## Standing decisions

[00-DESIGN.md](00-DESIGN.md) Decisions D1–D17. Success criteria S1–S6 measured at M2/M4.

## Out of scope (explicit)

- Other sites' packs (gemini, claude.ai …) — tracked in [#20](https://github.com/sriharshaguthikonda/Tampermonkey/issues/20). Cheaper after D — new pack + new capability adapter — but adapters are real work, NOT trivial.
- Store distribution changes, telemetry backends (Tier-2 failure reports are a later opt-in decision), any server component. Everything stays client-side.
- Pack signing (deferred; D15).
