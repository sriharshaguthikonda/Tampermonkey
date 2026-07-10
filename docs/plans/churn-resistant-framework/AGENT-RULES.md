# Rules for Implementing Agents (v2)

Read this before touching any phase. These rules are binding; phase plans assume them. Where any doc conflicts, [RESPONSE-to-first-critique.md](RESPONSE-to-first-critique.md) wins.

## Process
1. **One phase per repo at a time**, in roadmap order. Cross-repo parallelism only where the roadmap declares it (G ∥ D/E only). Do not start a phase whose dependency milestone isn't checked off in Q and A.md.
2. Read the phase file fully, then the referenced design sections, THEN code. No coding from the phase title.
3. TDD default: write the phase's listed tests first, implement until green. Amendment for uncertain browser integration: a time-boxed SPIKE is allowed first, but it must end in characterisation tests before the real implementation lands.
4. Small atomic commits = **green vertical slices**, conventional-commit style. Commit after each numbered task, not at phase end.
5. Never claim done without evidence LINKED in Q and A.md (command + result summary + link to full output). No pasted log walls.
6. Blocked or surprised (upstream diverged, DOM changed again, test impossible)? Write the question + your default into Q and A.md, notify, CONTINUE on unblocked tasks. Never idle-wait.

## Trust model (non-negotiable)
7. **Risk classes gate everything.** Action/input/destructive anchors: exact-match strategies only in packs; positional strategies prohibited; heuristic/fuzzy prohibited at runtime — fail closed. Code owns invariants, trusted roots, intent checks.
8. **Act only through capability methods** (`composer.submit()` …). A generic `clickAnchor(id)` API = review reject. Invariants rerun on freshly resolved nodes immediately before any action.
9. **No cross-tick DOM-node caching.** Fresh resolve per call; per-synchronous-operation memo and strategy-index caching are the only allowed caches.
10. Resolver read-only: strategies never mutate DOM/ARIA, never construct events, never click. anchor-core has no observer/network/storage — consumers own lifecycle.
11. Locale: names resolve via locale-scoped pack data; UI locale from code-owned signals only; unknown locale = fail closed for action anchors.

## Code
12. No new runtime dependency without size/licence/maintenance/security review recorded in Q and A.md (`dom-accessibility-api` pre-approved).
13. Data only in packs: no executable strings, no function bodies, no eval-ables. New strategy types = code + schema bump + risk-vocabulary review.
14. Pack parsing via the exact typed parser (unknown-field rejection + caps). Never ajv-lite or improvised subset validators.
15. **Selector-literal rule (narrowed):** only *external site anchor definitions* live in packs. Extension-own-UI selectors, generic extraction rules, local invariants, and security exclusions stay in code. An external-site selector literal inside feature code = review reject.
16. All DOM event construction via `element.ownerDocument.defaultView` (sandbox realm — ophel #643). Injected page-context code isolated in one module per repo.
17. Per-feature isolation: try/degrade wrappers; feature states (waiting/temporarily_unavailable/degraded) with bounded retry — never throw past feature boundary, never permanent disable-on-miss.
18. Match each repo's existing style: this repo = plain JS + build.js (anchor-core package itself = strict TS); ophel = their Plasmo/TS conventions.

## Privacy & repos (non-negotiable)
19. **Raw captures are SECRETS**: raw logged-in DOM snapshots, network recordings, and `__reactRouterContext`/bootstrap state contain tokens/identity. They live in a git-ignored local dir (`captures/raw/`), are NEVER committed to ANY repo, and cross no bridge before the allowlist projector (which fails on unknown surviving fields). Committed fixtures = sanitised subtrees passing the secret/PII scanner only.
20. Public packs repo ≠ fixture corpus repo. Corpus private by default.
21. No conversation/user data leaves the browser at runtime. Repair bundles = explicit user action (codex/cloud OK per D4b). Canary history = result codes + strategy id + coarse date only.
22. Extension-loading folders stay clean: no __pycache__, no *.pyc, no generated debris (user rule 2026-07-09). PYTHONDONTWRITEBYTECODE=1.
23. Upstream (urzeye/ophel) PRs: minimal diff, their style, no vendored lib inside the PR; data-refactor PR first (D6). Never push `gemini-version`/`main` directly; branch + PR per phase.
24. Secrets/logins never committed; local config only.

## Verification mindset
25. After any change touching runtime behavior: run the affected flow end-to-end (build, load extension, exercise on fixture or live page) — not just unit tests.
26. When a fix targets "site broke X": capture into the corpus FIRST (raw → sanitise → fixture), then fix against it. The fixture + identity oracle is the regression test.
27. A resolution returning `ambiguous` or `unexpected_absent` is a correct answer, not a bug to paper over. Never "first match wins" your way past it.
