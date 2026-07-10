# Phase C — Ophel proof, then extract anchor-core

Depends: B. Blocks: D, M3 groundwork.
Design refs: 00-DESIGN.md D1, D6, D17. Recon: RECON-codex-2026-07-10.md §1, §3 "Ophel Insertion Points". Rules: AGENT-RULES.md 18, 23.

Fork: `sriharshaguthikonda/ophel` (local `C:/Windows_software/Chrome_extensions/ophel`, v1.1.3). Upstream: `urzeye/ophel` — takes small conventional-commit PRs; CI = format/lint/typecheck/build; NO test suite. User is accepted contributor (#752/#755/#757 merged).

## Part 1 — selector centralisation (this IS upstream PR-1)
1. **Branch** `feat/chatgpt-selector-config` on fork; add `upstream` remote, fetch, rebase local main; record drift.
2. **Pure data refactor** — extract `src/adapters/chatgpt.ts` inline selector constants (~117: prompt/send `:1109-1119`, export/message `:1426-1442`, model/menu/sidebar `:114-126`, TOC rail `:2354-2389`) into one exported adapter-local `chatgptSelectors` config object. ZERO behavior change.
3. **Targeted fixture tests** — vitest + oracle harness scoped to the chatgpt config object only (same runner pattern as Phase B, shared fixtures copied in). Do NOT test-cover the rest of ophel.
4. **Open PR-1 upstream** — the pure data refactor, their style, minimal diff, referencing concrete churn breakage. Immediate upstream value; no anchor-core dependency, no framework pitch. (Resolver seam PR comes later, only after a churn event proves the config object — D6.)

## Part 2 — fork consumes anchor-core
5. **Integrate** — branch `feat/anchor-core` on fork: `chatgptSelectors` entries become AnchorDescriptors; DOMToolkit (`src/utils/dom-toolkit.ts:449-475` query, `:575-645` async get, `:729-825` watch) KEEPS waiting/observation/shadow traversal and calls anchor-core for single resolutions. Hover-probe label reveal (`:2392-2611`) stays adapter behavior; realm-safe event pattern (`:2420-2461`) stays in ophel util (NOT anchor-core — no event construction there).
6. **Capability mapping** — ophel's `SiteAdapter` methods (insertPrompt etc.) = the capability layer (D17); action anchors route through them with code-owned invariants, same rules as Phase B composer.
7. **Fork release** — build extension + userscript artifacts, manual smoke (outline, export, prompt insert), tag fork release.

## Part 3 — extract anchor-core (D1 fulfilled — only now)
8. **New repo** `anchor-core` (name/npm availability check at kickoff; location `C:/Windows_software/anchor-core`, no spaces). Move `packages/anchor-core/` out: history-preserving copy, dual builds (ESM for ophel/Plasmo + IIFE for this repo/userscripts), CI (lint/typecheck/test/oracle corpus/builds).
9. **Both consumers repointed** — this repo vendors pinned IIFE via build.js; ophel imports ESM pinned version. Both green.

## Acceptance gates
- PR-1 opened upstream, upstream CI green (merge timing is theirs — gate = opened + green; link in Q and A.md).
- Fork: chatgpt oracle matrix green vs shared corpus; upstream checks green locally; manual smoke evidence.
- Extraction: both repos consume the SAME published anchor-core version; both test suites green post-repoint.
- Exit: same API in both repos, no fork-only hacks in anchor-core.
