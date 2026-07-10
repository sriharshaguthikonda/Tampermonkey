# Phase D — Pack format + overlays

Depends: C (anchor-core extracted, API churn-proven). Blocks: E. Parallel-allowed: G (declared).
Design refs: 00-DESIGN.md "Selector pack", "Locale", D2/D3/D12/D13/D15/D16. Rules: AGENT-RULES.md 13–15, 19–20.

## Goal
Anchors live as versioned remote JSON: base pack + per-consumer overlays, validated by the exact typed parser, activated only after state-aware preflight. Corrupt/malicious pack cannot brick consumers or retarget action anchors. Exit gate: a REAL selector-only breakage fixed by pack change alone.

## Tasks
1. **Schema v2 frozen** — formalize 00-DESIGN.md sketch (risk, cardinality, route, pageState, allowedRoot, expectedAbsentWhen, strategies, require, accessibleName.byLocale/verifiedLocales/unknownLocalePolicy). Committed with valid + invalid example fixtures; parser tests already exist (Phase B) — extend for schema-v2 fields.
2. **Repos** — public `selector-packs` (packs + schema + docs; MIT). Private `selector-corpus` (sanitised fixtures + oracles move here from consumer repos; single source of truth, consumers reference pinned copies). CI per TESTING.md matrix; corpus CI runs secret/PII scanner on every fixture.
3. **Author `chatgpt.com` base pack** — from Phase B/C descriptors (they're already the right shape). Consumer overlays: `tampermonkey-extension`, `tampermonkey-userscript`, `ophel-fork`, `prompt-queue` (D8b). Contract files per consumer (`required`/`optional` anchor lists) — CI cross-checks coverage.
4. **Loader** — consumer-side module (small companion, not inside anchor-core — core stays network-free): remote raw.githubusercontent / SHA-pinned jsdelivr (opt-in strict mode) → ETag/TTL ~6h stale-while-revalidate → typed parser → version-gate → **preflight** (state-aware: `valid_present/valid_expected_absent/invalid_candidate/ambiguous/unexpected_absent`; fail activation only on bad states where tested state expects the anchor) → atomic activation → persist **last two good**. Injectable fetcher/storage (GM_xmlhttpRequest/GM storage vs fetch/chrome.storage). Unit tests: all failure paths.
5. **Rollout asymmetry** — read-anchor changes auto-activate post-preflight; **action-anchor strategy changes prompt for explicit local approval** (diff shown; one click). Approval state persisted per pack version. Tests for both paths + downgrade attempt + pin honored.
6. **Kill switch / pin** — `packPin: "<version>|baked"` honored by loader. Test.
7. **Docs** — packs repo README: bump playbook (capture → sanitise → edit → oracle matrix → merge), schema reference, security model (risk classes, what code refuses, why action packs prompt).

## Acceptance gates
- Public + private repo CI green (links).
- Oracle matrix: base pack + each overlay resolves 100% of contract-required anchors on newest fixture; 100% action-anchor precision across corpus.
- Loader fault matrix green: offline first-run (baked), corrupt remote, downgrade, schema-invalid, TTL refresh, pin, action-approval flow, last-two rollback.
- **M2 demo**: simulated break → feature degrades + resolution-state event → fixed by editing ONE json → recovers on pack reload, no js edits. Recorded in Q and A.md.
- Exit (can trail into E): first real selector-only breakage repaired by pack bump alone.
