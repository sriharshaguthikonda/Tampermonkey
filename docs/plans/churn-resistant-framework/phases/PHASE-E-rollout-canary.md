# Phase E — Remote rollout + self-test canary

Depends: D. Blocks: F, M3/M4.
Design refs: 00-DESIGN.md "Passive self-test canary", D7, D12–D15. Rules: AGENT-RULES.md 7–11, 17, 21.

## Goal
All consumers resolve every chatgpt anchor through anchor-core + remote pack (loader live, action-approval gate live). Passive self-test canary detects breakage in-session. Remaining features migrated.

## Tasks
1. **Loader wired into consumers** — this repo: thin selectors module = baked pack + async remote overlay (GM_xmlhttpRequest path for userscript; extension background fetch → message if chatgpt.com CSP blocks direct fetch — decide from actual CSP, record decision). Ophel fork: same loader, their storage. Prompt-queue: onboard as consumer (contract file + loader; small — it follows the pattern).
2. **Migrate remaining features (this repo)** — module by module, one commit each: `70-auto-read.js:18-60` → conversation capability events through `08-observer-bus.js` relevance predicates; nav controls; remaining `20-smart-copy-part2` bits; per-feature try/degrade wrappers everywhere (states + bounded retry). Grep gate at end: zero external-site selector literals outside pack/baked-pack (AGENT-RULES 15 scope).
3. **Userscript parity** — monolith build inlines baked pack + loader; parity test extended.
4. **Self-test canary** — per design envelope: state-class triggers (`applicableWhen`), probeKey dedup, 4–8ms cancellable idle slices (~50ms session cap), fresh diagnostic resolution, absence taxonomy (verified_present / verified_expected_absent / unobserved_applicable_state / unexpected_absent + ambiguous/candidate_failed_invariants/probe_interrupted/unsupported_locale), opportunistic probing on natural state entry. NEVER clicks/focuses/mutates.
5. **Health panel** — extension diagnostics panel (existing diagnostics v2) shows: current health vs state coverage vs last positive verification vs pack-version coverage; fixture-verified vs live-verified labelled separately. Local history = result codes + strategy id + coarse date only. Notify only on meaningful transitions.
6. **Fault injection in CI** — TESTING.md §5 harness in this repo: mutated fixtures → per-feature degradation only (S3 gate).
7. **Cleanup** — Phase A's transitional selector chains deleted once all features route through anchors; removal recorded.

## Acceptance gates
- All suites green in all three consumer repos + oracle corpus + fault injection (links).
- Canary tests green: trigger matrix, budget respected, cancellation, taxonomy correctness (`unobserved_applicable_state` ≠ healthy), no production-cache reuse.
- Live smoke: paste, send, TTS auto-read, smart-copy, outline (ophel) all through packs; health panel screenshot.
- **M3 drill**: same simulated break as M2 → ophel fork recovers via pack edit only.
- Action-approval gate exercised live once (pack bump with action change → prompt → approve → active). Evidence.
