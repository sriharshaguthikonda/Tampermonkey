# Phase E — Remote rollout + self-test canary

Depends: D. Blocks: F. Milestones: M3 drill lives here.
Binding rules: [AGENT-RULES.md](../AGENT-RULES.md) 7–11, 17, 21. Design refs: [00-DESIGN.md](../00-DESIGN.md) "Passive self-test canary" (read IN FULL — the envelope is contractual), D7, D12–D15.

## Context you need

- After Phase D the loader exists and packs are authored; consumers still mostly run baked in-code maps. This phase turns the remote path ON everywhere, migrates the REMAINING features, and ships the canary.
- The canary is a **passive diagnostic resolver**. It never clicks, never focuses, never mutates, never touches action anchors' act paths. It answers one question: "would our anchors still resolve, in the states this session actually visited?"
- Key taxonomy rule (round-2's central correction): absence of an anchor in a state where it's not expected proves the STATE MODEL works, not that the anchor resolves. `unobserved_applicable_state` must surface as "not verified", never as green.

## Prerequisites checklist
- [ ] M2 demo recorded (Phase D gate).
- [ ] All three consumer repos on pinned anchor-core + loader.

## Tasks

### Task 1 — Loader live in all consumers
- This repo: thin selectors module = baked pack + async remote overlay. Userscript path = GM_xmlhttpRequest + GM storage. Extension path: try direct fetch from content script first; if chatgpt.com CSP blocks it, background fetch → message relay. Decide from the ACTUAL CSP observed, record the decision + evidence in Q and A.md.
- Ophel fork: same loader, chrome.storage/Plasmo storage idioms.
- Prompt-queue (`C:/Windows_software/Chrome_extensions/Prompt-queue`): onboard as consumer — inventory its chatgpt selectors, write its contract file + overlay (extend Phase D pack if anchors are missing), wire loader. It follows the established pattern; keep the diff small and idiomatic to that repo.

### Task 2 — Migrate remaining features (this repo, one commit each)
Order: `70-auto-read.js:18-60` (conversation capability events via `08-observer-bus.js` relevance predicates — bus keeps lifecycle, predicate calls resolver), nav controls, remaining `20-smart-copy-part2` selectors, any stragglers found by grep. Every feature: try/degrade wrapper, states `waiting/temporarily_unavailable/degraded`, bounded retry (AGENT-RULES 17).
End-of-task grep gate — zero external-site selector literals outside pack/baked-pack data (AGENT-RULES 15 scope: extension-own-UI selectors are FINE in code):
```bash
grep -rn "querySelector\|closest(" edge-extension/modules/ | grep -v vendor/ | grep -v "data-oracle"  # review every hit: must be own-UI or resolver-internal
```

### Task 3 — Userscript parity
Monolith build inlines baked pack + loader; parity test extended to cover loader fallback (remote unavailable → baked).

### Task 4 — Self-test canary
New module (extension + userscript shared source). Implement the design envelope EXACTLY:
- Triggers: stable adapter init; meaningful SPA route transition; first appearance of a not-yet-observed state class; after pack activation; resume after long background. Dedup by `probeKey = pack:route:state:viewport` in a session coverage set.
- Anchors declare `applicableWhen` (state classes) in the pack; canary probes only applicable anchors in the current state; opportunistic: when the user naturally enters a new state (e.g. streaming starts), pending applicable probes run there.
- Budget: 4–8ms cancellable idle slices (`requestIdleCallback` with `setTimeout` fallback), cumulative ~50ms/session cap, abort slice on user input/navigation/streaming start. Probes resolve FRESH in diagnostic mode — never read or write production strategy-index memos.
- Result taxonomy per probe: `verified_present / verified_expected_absent / unobserved_applicable_state / unexpected_absent / ambiguous / candidate_failed_invariants / probe_interrupted / unsupported_locale`.
- Persistence: compact local history — result code + strategy index + coarse date ONLY. No DOM, no URLs, no titles (AGENT-RULES 21).
- Notifications: only on meaningful transitions — healthy→failed, primary→fallback, unique→ambiguous, verified→stale, pack rejected.
Tests (fake timers + fixture DOM): trigger matrix, dedup, budget respected, cancellation, taxonomy correctness (explicit test: applicable-but-unvisited state yields `unobserved_applicable_state` and the panel shows NOT-verified), no production-cache touch.

### Task 5 — Health panel
Extend existing diagnostics v2 panel: four separated columns — current health / state coverage / last positive verification / pack-version coverage. `fixture-verified` vs `live-verified` labelled distinctly, never merged into one green. Pack version + approval state shown. Export button = repair bundle stub (full exporter in Phase F).

### Task 6 — Fault injection in CI
Port TESTING.md §5 into this repo's CI: mutate fixtures (4 churn patterns) → assert per-feature degradation only, no uncaught exceptions, correct resolution-state events, sibling features unaffected (S3 gate).

### Task 7 — Cleanup
Delete Phase A's transitional selector chains + any dead code once every feature routes through anchors. Record removals.

## Acceptance gates
- All suites green in all three consumer repos + oracle corpus + fault injection (links).
- Canary test suite green — including the `unobserved_applicable_state ≠ healthy` test.
- Live smoke: paste, send, TTS auto-read, smart-copy, ophel outline — all through packs; health panel screenshot showing separated verification columns.
- **M3 drill**: same simulated break as M2 → ophel fork recovers via pack edit only (transcript linked).
- Action-approval gate exercised live once end-to-end (pack bump containing an action-anchor change → prompt appears with diff → approve → active). Evidence.
- Perf: canary within budget (measure with `performance.now()` in the test harness); no user-visible jank report.

## Do NOT
- Canary never acts (no click/focus/scroll/mutation) — code-review reject on sight.
- No Tier-2 aggregate reporting (that's a later opt-in decision, not this phase).
- No feature migrates without its try/degrade wrapper.
