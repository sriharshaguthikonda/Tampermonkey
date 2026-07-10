# Phase G — ChatGPT data-layer SPIKE (go/no-go)

Depends: B. Runs PARALLEL to D/E (declared; the only allowed cross-repo parallelism). **D/E never depend on this spike's success.**
Design refs: 00-DESIGN.md "ChatGPT data layer = Phase G SPIKE", D5, D11, D16. Rules: AGENT-RULES.md 16, 19–21. TESTING.md §8 (conformance protocol) is binding.
Prior art to mine BEFORE coding: pionxzh/chatgpt-exporter (proves API *consumption*), terminalcommandnewsletter/everything-chatgpt (endpoint map). Clone into `C:/Windows_software/Chrome_extensions/_reference/`, keep licenses.

## Hypothesis under test
*Network owns identity/graph/metadata; DOM owns presentation; completion requires corroboration by both.* The spike proves or kills this per consumer.

## Hard constraints
- Separate experimental module + branch. No backend concepts (e.g. stream-complete) enter the pack schema unless the spike GOes AND the concept survives review.
- Passive only: strict `response.clone()`/`tee()` — never consume the page's original stream (React hangs). Zero extra requests. MV3: MAIN-world registered content script; userscript: script-tag injection; namespaced postMessage envelope + origin check.
- **SECRETS**: raw traffic + `window.__reactRouterContext.state.loaderData` contain access tokens/email/identity. `captures/raw/` git-ignored local-only; **versioned allowlist projector runs in MAIN world before anything crosses the bridge**; projector FAILS if unknown fields survive; only projected artifacts committed to `fixtures/transcripts/`. No setter-traps on the global, no patching JSON.parse/React internals.

## Tasks
1. **Recorder first** — capture real `/backend-api/` traffic (conversation load, new message stream, title gen, regenerate, edit-branch, stop, error) through the projector into transcript fixtures. Scenario corpus per TESTING.md §8 (11 scenarios).
2. **Layered bootstrap capture** — (1) document_start MAIN-world fetch wrap recording `installedAtReadyState` (never assume manifest-guaranteed earliness); (2) bounded ≤2s polling of `__reactRouterContext.state.loaderData` through the projector; (3) DOM reconstruction fallback; (4) explicit `BootstrapCoverage` taxonomy surfaced in health panel.
3. **RawTurn model** — from traffic/bootstrap ONLY (no DOM consultation): `{conversationId, turns[{id, role, text, status}], activeStream}`; handles load, delta stream, edit/regenerate, switch. Replay tests → golden JSON.
4. **RenderedTurn model** — from DOM ONLY (no network consultation). Independent derivation is the point.
5. **Conformance harness** — TESTING.md §8: turn alignment (id > branch+role > sequence > text-assisted, recorded confidence); per-dimension gates — ZERO hidden/system-turn leakage (one leak fails spike for TTS/export), classified text diffs, structured-content comparison, completion vs DOM ground-truth window (indicator gone + actions appear + quiet interval). Numeric: 0 premature completions, 0 duplicates, 100% visible completed-turn recall, p95 completion ≤~1s, interrupted/error classification 100%. Output = classified diffs, not scores.
6. **Verdict** — explicit **GO / LIMITED-GO / NO-GO per consumer** (export, TOC/outline, prompt-queue state, TTS-trigger; TTS *content* stays rendered-DOM regardless — it must read what the user sees). Written verdict doc with evidence; field-level source precedence recorded (identity/graph = network; visible text/presentation = DOM; completion = corroborated).
7. **If GO: first consumer = export** behind `USE_DATA_LAYER` flag, DOM fallback intact, `dataLayer.unavailable` degradation event wired.

## Acceptance gates
- Projector secret tests green (seeded fake tokens in raw fixtures never survive).
- Replay + conformance suites green across all 11 scenarios; numeric gates met (evidence linked).
- Kill test: endpoint drift simulation → `dataLayer.unavailable` → DOM path works, single warning, no crash.
- Playwright network log: zero non-allowlisted egress.
- Verdict doc committed; if NO-GO for all consumers, spike branch archived + learnings noted — that outcome is a SUCCESS of the gate, not a failure of the phase.
