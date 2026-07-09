# P5 — Ophel fork integration + upstream seam

Depends: P2 (P4 optional enhancer). Blocks: M3.
Design refs: 00-DESIGN.md D6. Recon refs: RECON-codex-2026-07-10.md §1, §3 "Ophel Insertion Points". Rules: AGENT-RULES.md 12, 15.

Fork: `sriharshaguthikonda/ophel` (local clone `C:/Windows_software/Chrome_extensions/ophel`, branch `main`, v1.1.3). Upstream: `urzeye/ophel`. User is an accepted contributor there (#752, #755, #757 merged) — upstream takes small conventional-commit PRs; CI = format/lint/typecheck/build, NO test suite exists.

## Part A — fork consumes anchorlib (our branch, full integration)
1. **Branch** `feat/anchorlib-resolver` on fork. Add `upstream` remote (`urzeye/ophel`), fetch, rebase local main first — record drift.
2. **Adapter seam** — extend `DOMToolkit` (`src/utils/dom-toolkit.ts:449-475` query, `:575-645` async get, `:729-825` watch) to accept descriptor objects (anchorlib ESM import) alongside plain selector strings. Existing shadow-aware + polling behavior preserved; anchorlib handles chain/validate/heal, DOMToolkit keeps its waiting/observer ergonomics.
3. **ChatGPT adapter migration** — `src/adapters/chatgpt.ts`: replace inline chains at `:1109-1119` (prompt/send), `:1426-1442` (export/message), `:114-126` (model/menu/sidebar), TOC rail discovery `:2354-2389` with descriptors from `chatgpt.com.json` pack (same pack as P3 — shared truth, extended with ophel-only elements: native-toc-rail, toc-item, model-button, model-menu, sidebar-link, deep-research-iframe). Pack loader: userscript build uses GM grants already configured (`vite.userscript.config.ts:464-514`); extension uses background fetch.
4. **Side-effect strategies** — hover-probe label reveal (`:2392-2611`) stays adapter code (it's behavior, not location) but its TARGET elements resolve via pack; realm-safe event pattern (`:2420-2461`) moves INTO anchorlib util (AGENT-RULES 9) and adapter imports it.
5. **Tests (new — ophel has none)** — vitest + fixture harness scoped to `src/adapters/chatgpt.ts` descriptors: same resolution-matrix runner as P2 against shared corpus (submodule or copied fixtures). Do NOT try to test-cover all of ophel; only the resolver seam + chatgpt descriptors.
6. **Fork release** — build extension + userscript artifacts, manual smoke (outline, export, prompt insert on chatgpt.com), tag fork release.

## Part B — upstream PRs (small, sequenced, their style)
1. **PR-1 (seam only)**: `DOMToolkit.query/get/watch` accept `string | string[] | DescriptorLike` + optional `resolver` injection point on `SiteAdapter` (registry `src/adapters/index.ts:24-52` untouched behavior-wise). No anchorlib dependency — just the interface + default implementation preserving current behavior. Small diff, typed, conventional commits, zh-friendly PR description like their norm.
2. **PR-2 (data not code)**: extract chatgpt adapter's inline selector constants into a single exported `chatgptSelectors` config object (pure refactor, no behavior change) — makes future churn fixes one-file data edits upstream too, and maps 1:1 to our pack.
3. **PR-3+ (opportunistic)**: when next real ChatGPT churn hits upstream, contribute the fix as a config-object edit, demonstrating the seam's value. Propose pack-format adoption only after PR-1/2 merged and a churn event proved it (don't pitch the framework cold).

## Acceptance gates
- Fork: chatgpt adapter resolution matrix green vs corpus; upstream CI checks (format/lint/typecheck/build) green locally (paste); manual smoke evidence.
- M3 drill: same simulated break as M2 → fork recovers via pack edit only.
- PR-1 and PR-2 opened upstream with minimal diffs (links in Q and A.md). Merge timing is theirs — not a gate we control; gate = opened + CI green.
