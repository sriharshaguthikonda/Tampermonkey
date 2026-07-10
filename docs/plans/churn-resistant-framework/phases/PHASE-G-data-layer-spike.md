# Phase G — ChatGPT data-layer SPIKE (go/no-go)

Depends: B. Runs PARALLEL to D/E (the only declared cross-repo parallelism). **D/E must never depend on this spike.**
Binding rules: [AGENT-RULES.md](../AGENT-RULES.md) 16, 19–21. Design refs: [00-DESIGN.md](../00-DESIGN.md) "ChatGPT data layer = Phase G SPIKE", D5/D11/D16. [TESTING.md](../TESTING.md) §8 conformance protocol is BINDING — read it in full first.

## Context you need

- Question under test: can features read ChatGPT's own data (network traffic + bootstrap state) instead of scraping rendered DOM? Hypothesis (round-2 reviewer's own prediction, adopted): *network owns identity/graph/metadata; DOM owns presentation; completion requires corroboration by both.*
- This is a SPIKE. A NO-GO verdict is a SUCCESS of the gate, not a failure of the phase. Verdicts are **per consumer**: export may be GO while TTS-trigger is NO-GO. TTS *content* stays on rendered DOM regardless of verdict — TTS must read what the user sees.
- Prior art to mine BEFORE coding (clone into `C:/Windows_software/Chrome_extensions/_reference/`, keep licenses): pionxzh/chatgpt-exporter (proves `/backend-api/` *consumption* — auth/session/endpoint patterns), terminalcommandnewsletter/everything-chatgpt (endpoint map).
- **THE security fact this phase lives under**: raw `/backend-api/` traffic AND `window.__reactRouterContext.state.loaderData` contain access tokens, email, identity. Raw captures are SECRETS. `captures/raw/` is git-ignored local-only. A **versioned allowlist projector runs in the MAIN world before anything crosses the postMessage bridge** — the content-script side must never see a token even in memory. Projector fails loudly if unknown fields survive. Only projected artifacts are committed (`fixtures/transcripts/`).

## Hard constraints (violating any = stop and revert)
- Separate experimental module + branch. No backend concept (e.g. stream-complete) enters the pack schema unless the spike GOes AND the concept survives a design review.
- Passive only: `response.clone()` / `ReadableStream.tee()` — the page's ORIGINAL stream is never consumed by us (consuming it once = React hangs, D11). Zero extra requests, ever.
- Injection: MV3 = content script registered `world: "MAIN"` at `document_start`; userscript = script-tag injection. Bridge = namespaced postMessage envelope + origin check.
- No setter-traps on `__reactRouterContext`, no patching `JSON.parse` or React internals — bounded polling only.

## Tasks

### Task 1 — Recorder first (test assets before module code)
Build the capture path: MAIN-world tap → projector → `fixtures/transcripts/`. Record the 11-scenario corpus (TESTING.md §8): ordinary reply, long stream, code blocks, citations, stop mid-stream, error, regenerate, edit-branch, switch-conversation-during-generation, multi-tool, refresh-into-existing-conversation. Each scenario = one projected transcript fixture. Seeded-secret test on the projector BEFORE recording anything real.

### Task 2 — Layered bootstrap capture
Four layers, all implemented, coverage always known:
1. `document_start` MAIN-world fetch wrap; record `installedAtReadyState` — NEVER assume the manifest guaranteed earliness; measure it.
2. Bounded polling (≤2s total) of `window.__reactRouterContext.state.loaderData` through the projector.
3. DOM reconstruction fallback (build initial conversation model from rendered DOM when 1+2 missed the load).
4. Explicit `BootstrapCoverage` result (`full_network / bootstrap_state / dom_reconstructed / partial / none`) surfaced in the health panel.

### Task 3 — RawTurn model
From traffic/bootstrap ONLY — the module must not import anything DOM-reading. `{conversationId, turns[{id, role, text, status}], activeStream}`; handles initial load, delta stream, edit/regenerate branching, conversation switch. Replay tests: every transcript fixture → golden model JSON.

### Task 4 — RenderedTurn model
From rendered DOM ONLY — no network consultation. Same shape. Independent derivation is the entire point; shared code between Task 3 and 4 models = spike invalid.

### Task 5 — Conformance harness (TESTING.md §8, binding)
- Turn alignment: id > branch+role > sequence > text-assisted; alignment confidence recorded per pair.
- Per-dimension gates: turn-set precision/recall — **hard gate: ZERO hidden/system/internal turns exposed as visible; one leak = spike FAILS for TTS/export**. Text fidelity via narrow canonicalisation; every diff CLASSIFIED (`presentation_whitespace / content_missing / hidden_content_exposed / …`). Structured content (code blocks, tables, citations, attachments) compared separately. Completion-event correctness vs DOM ground-truth WINDOW (multi-signal: stream indicator gone + action buttons appear + quiet interval).
- Numeric gates: 0 premature completions, 0 duplicate completions, 100% visible completed-turn recall on core scenarios, p95 completion latency ≤ ~1s, interrupted/error classification 100%.
- Output on failure: reviewable classified diffs, never a similarity score.

### Task 6 — Verdict document
`VERDICT.md` on the spike branch: per consumer (export / TOC-outline / prompt-queue state / TTS-trigger) → **GO / LIMITED-GO / NO-GO** with the conformance evidence for each. Record field-level source precedence for any GO consumer: identity/graph/raw content = network/bootstrap; visible text/presentation = rendered DOM; completion = corroborated by both. Post summary to Q and A.md — user decides on integration.

### Task 7 (only if a consumer GOes) — First consumer = export
Behind `USE_DATA_LAYER` flag (default per verdict), DOM fallback intact, `dataLayer.unavailable` degradation event wired into the standard feature-state machinery.

## Acceptance gates
- Projector seeded-secret tests green (fake tokens in raw fixtures never survive to transcripts, bridge, or bundle).
- Replay + conformance suites green across all 11 scenarios; numeric gates met (evidence linked).
- Kill test: simulate endpoint drift (rename endpoints in a replay) → `dataLayer.unavailable` fires → DOM path works, single warning, no crash.
- Playwright network log: zero non-allowlisted egress.
- `VERDICT.md` committed with per-consumer verdicts. NO-GO across the board → branch archived + learnings section written; that is a clean exit.

## Do NOT
- Never commit anything from `captures/raw/`.
- Never block, modify, retry, or replay live traffic against the real backend.
- Never let spike types/concepts leak into anchor-core or the pack schema on the main branches while the spike is open.
