# Phase C — Ophel proof, then extract anchor-core

Depends: B. Blocks: D.
Binding rules: [AGENT-RULES.md](../AGENT-RULES.md) 18, 23 (upstream hygiene). Design refs: [00-DESIGN.md](../00-DESIGN.md) D1, D6, D17. Ground truth: [RECON-codex-2026-07-10.md](../RECON-codex-2026-07-10.md) §1, §3.

## Context you need

- Fork: `sriharshaguthikonda/ophel`, local clone `C:/Windows_software/Chrome_extensions/ophel`, v1.1.3, Plasmo + strict TS. Upstream: `urzeye/ophel` — accepts small conventional-commit PRs; CI = format/lint/typecheck/build; **NO test suite exists there**. User is an accepted contributor (#752/#755/#757 merged). Do not pitch the framework upstream — data refactor first, seam later, only after churn proves it (D6).
- Ophel's `SiteAdapter` (match/insertPrompt/…) IS the capability layer (D17). `DOMToolkit` (`src/utils/dom-toolkit.ts`) owns waiting/observation/shadow traversal — it KEEPS all of that; anchor-core does single resolutions inside it.
- ~117 selectors live in `src/adapters/chatgpt.ts`. Key clusters: prompt/send `:1109-1119`, export/message `:1426-1442`, model/menu/sidebar `:114-126`, TOC rail discovery `:2354-2389`, hover-probe `:2392-2611`, realm-safe events `:2420-2461`. Line numbers are from the 2026-07-10 recon — RE-VERIFY before editing; upstream moves fast.
- Work in the ophel repo follows OPHEL's conventions (their lint/format/commit style), not this repo's.

## Prerequisites checklist
- [ ] Phase B exit review posted and accepted in Q and A.md.
- [ ] `git -C C:/Windows_software/Chrome_extensions/ophel remote -v` shows `origin` (fork) and `upstream` (urzeye) — add upstream if missing.
- [ ] `git fetch upstream && git log --oneline main..upstream/main` — record drift in Q and A.md before starting.

## Part 1 — selector centralisation (this IS upstream PR-1)

### Task 1 — Branch + rebase
Branch `feat/chatgpt-selector-config` from up-to-date main. Commit nothing yet.

### Task 2 — Pure data refactor
Create ONE exported adapter-local object in `src/adapters/chatgpt.ts` (or sibling `chatgpt-selectors.ts` if the file's already huge — match their file-size norms):
```ts
export const chatgptSelectors = {
  promptInput: [...],  sendButton: [...],  stopButton: [...],
  exportMessage: [...], modelButton: [...], modelMenu: [...],
  sidebarLink: [...],  tocRail: [...],  tocItem: [...], /* every inline literal */
} as const;
```
Every inline selector literal in the adapter now references this object. **ZERO behavior change** — same strings, same order, same call sites. Their formatter/linter clean. Commit(s) in their style, e.g. `refactor(chatgpt): centralize selectors into chatgptSelectors config`.

### Task 3 — Targeted fixture tests (fork-only, NOT in the PR)
On a fork-side branch stacked on Task 2: vitest + the Phase-B oracle-harness pattern, scoped ONLY to `chatgptSelectors` against fixtures copied from this repo's corpus (sanitised ones only). Do NOT attempt to test the rest of ophel. If ophel has no vitest setup, add it minimally on the fork branch only.

### Task 4 — Open PR-1 upstream
PR = Task 2 only (data refactor, no tests, no deps). Minimal diff, their conventional-commit style, description references the concrete 2026-07-10 churn breakage and how a config object makes future churn fixes one-file data edits. Link the PR in Q and A.md. Merge timing is theirs — gate is opened + CI green.

## Part 2 — fork consumes anchor-core

### Task 5 — Integrate
Fork branch `feat/anchor-core` (stacked on Part 1): `chatgptSelectors` entries become `AnchorDescriptor`s (risk classes assigned: insertPrompt input = `input`, send = `action`, everything TOC/export/model = `read`/`navigate`). DOMToolkit's query/get/watch internals call anchor-core for the single-resolution step; waiting/polling/shadow behavior unchanged. Import path: local file dependency on `packages/anchor-core` build output for now (pin by commit).
- Hover-probe label reveal (`:2392-2611`) stays adapter behavior — its TARGETS resolve via descriptors, the probing itself is ophel code.
- Realm-safe event util (`:2420-2461`) STAYS in ophel (anchor-core constructs no events — AGENT-RULES 10).
- Action path: insertPrompt/send go through SiteAdapter methods with the same positive-intent checks as Phase B composer (same-form relationship, enabled, unique, fresh re-resolve before act).

### Task 6 — Fork release
Build extension + userscript artifacts, manual smoke on chatgpt.com: outline/TOC, export, prompt insert + send. Tag fork release. Evidence in Q and A.md.

## Part 3 — extract anchor-core (D1 fulfilled — ONLY now)

### Task 7 — New repo
Preconditions (all true, else stay local and say so in Q and A.md): both repos consume the same API; the API survived at least one real churn event OR the M2-style simulated drill.
Create `C:/Windows_software/anchor-core` (no spaces in path — codex sandbox constraint). Check npm name availability; `@scope/anchor-core` under user's scope is fine. Move `packages/anchor-core/` content (plain copy + fresh git init is acceptable; note the provenance commit hash in README). Dual builds: ESM (ophel/Plasmo) + IIFE (this repo/userscripts). CI: lint, typecheck, vitest, chromium tests, oracle corpus, both builds.

### Task 8 — Repoint both consumers
This repo: build.js vendors the pinned IIFE (committed copy + `npm run update-anchor-core` script). Ophel fork: pinned ESM dependency. Both repos' full suites green after repoint. Delete `packages/anchor-core/` from this repo in the same change that repoints (no drift window).

## Acceptance gates
- PR-1 opened upstream + upstream CI green (link).
- Fork: chatgpt oracle matrix green vs shared corpus; upstream checks green locally; smoke evidence.
- Extraction: both consumers on the SAME pinned anchor-core version; both suites green; `packages/anchor-core` removed from this repo.
- Exit statement in Q and A.md: "same API in both repos, zero fork-only hacks in anchor-core" — with any exceptions listed honestly.

## Do NOT
- Do not include tests, anchor-core, or any dependency in PR-1.
- Do not propose the resolver seam upstream yet (that's a later PR, after churn proves the config object).
- Do not extract the repo before Part 1+2 are green (extraction before proof = D1 violation, v1's original mistake).
