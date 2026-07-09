# Roadmap: Churn-Resistant Selector Framework

Phases are strictly ordered by dependency; each is independently shippable and reversible. Every phase has its own plan file in [phases/](phases/) with agent-executable tasks, acceptance criteria, and test gates. Implementing agents MUST read [AGENT-RULES.md](AGENT-RULES.md) first. Repo ground truth (selector inventories, seams, file:line): [RECON-codex-2026-07-10.md](RECON-codex-2026-07-10.md).

Sequencing rationale (codex recon concurrence): P0 standardizes the descriptor shape locally on a real breakage; P1 extracts the lib from that proven shape instead of designing in a vacuum. Ophel and this repo differ in stack (Plasmo/TS vs plain JS), so the lib ships framework-free dual bundles (ESM + IIFE).

```
P0 hotfix (this repo)          [now, unblocks users]
P1 anchorlib core (new repo)   [foundation]
P2 selector packs + loader     [depends P1]
P3 integrate this repo         [depends P2]
P4 chatgpt data layer          [depends P1, parallel w/ P3]
P5 ophel fork + upstream seam  [depends P2; P4 nice-to-have]
P6 canary CI + repair loop     [depends P2; grows forever]
```

| Phase | Deliverable | Effort | Rollback |
|---|---|---|---|
| **P0 — Hotfix current breakage** | #19 paste-anywhere + any other 2026-07-10 breakage re-fixed in this repo, but selectors expressed as ordered fallback chains in ONE module (`selectors.js`) shaped like the future pack schema. Proves descriptor format on real breakage. | hours | revert commit |
| **P1 — anchorlib (new repo)** | Repo `anchorlib` (name final at kickoff): resolver engine (5 strategy tiers), validation predicates, churn-tolerant observer, handle cache + revalidation, health events. TS, zero deps, vitest + fixture corpus, builds: ESM + single-file IIFE. CI green. | days | nothing depends on it yet |
| **P2 — Selector packs** | Pack JSON schema v1 + validator; `selector-packs` repo with `chatgpt.com.json` authored against current DOM + historical snapshots; loader (remote fetch, ETag, TTL, version gate, last-good rollback, baked fallback). | days | loader off = baked pack only |
| **P3 — Integrate this repo** | edge-extension + Tampermonkey userscripts consume anchorlib+pack via build.js bundling; all hardcoded selectors deleted; per-feature isolation wrappers; diagnostics v2 wired to health events. | days | feature flag `USE_ANCHORLIB=0` falls back to P0 module |
| **P4 — ChatGPT data layer** | fetch/SSE intercept module (page-realm) emitting conversation events; TTS auto-read + future TOC/export consume events instead of DOM scraping where possible. | days | module is additive; DOM path stays as fallback |
| **P5 — Ophel fork + upstream** | Fork's ChatGPT adapter resolves elements through anchorlib+pack; upstream PR = minimal seam only (selector-config injection point), sized to their review culture. | days | fork branch; upstream PR independent |
| **P6 — Canary + repair loop** | Nightly local canary (Playwright, logged-in profile) + snapshot archiver; breakage bundle exporter; offline codex-assisted pack-repair CLI; selector-regression corpus grows with every breakage. | days, then ongoing | all tooling, zero runtime risk |

## Milestones / exit criteria

- **M1 (after P0):** users unbroken today.
- **M2 (after P3):** a simulated selector break (fault injection) causes: feature-level degradation only + health event + fix by editing ONE json file. Demo recorded in Q and A.md.
- **M3 (after P5):** ophel fork survives the same simulated break; upstream seam PR open.
- **M4 (after P6):** next REAL ChatGPT UI change repaired by pack bump alone within 1 day → success criteria S1/S2 measured and logged.

## Standing decisions

See [00-DESIGN.md](00-DESIGN.md) Decisions table (D1–D8). Success criteria S1–S6 measured at M2/M4.

## Out of scope (explicit)

- Other sites' packs (gemini, claude.ai …) — tracked in [#20](https://github.com/sriharshaguthikonda/Tampermonkey/issues/20), trivial after P2.
- Store distribution changes, telemetry backends, any server component. Everything stays client-side.
