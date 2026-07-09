# Rules for Implementing Agents

Read this before touching any phase. These rules are binding; phase plans assume them.

## Process
1. One phase at a time, in roadmap order. Do not start a phase whose dependency milestone isn't checked off in Q and A.md.
2. Read the phase file fully, then the referenced design sections, THEN code. No coding from the phase title.
3. TDD: write the phase's listed tests first (they fail), implement until green. Every non-trivial module ships with its check.
4. Small atomic commits, conventional-commit style, one logical change each. Commit after each numbered task, not at phase end.
5. Never claim done without pasting gate output (see TESTING.md "Evidence discipline") into Q and A.md.
6. Blocked or surprised (upstream diverged, DOM changed again, test impossible)? Write the question + your default into Q and A.md, notify, CONTINUE on unblocked tasks. Never idle-wait.

## Code
7. No new runtime dependencies anywhere without a Q&A entry justifying it. anchorlib stays zero-dep.
8. Data only in packs: never put executable strings, function bodies, or eval-ables into pack JSON. New strategy types go in lib code + schema bump.
9. All DOM event construction via `element.ownerDocument.defaultView` (sandbox realm — ophel #643 lesson). All injected page-context code isolated in one module per repo.
10. Per-feature isolation: a feature acquires elements through try/degrade wrappers; never let one failed resolve throw past feature boundary.
11. Read-only resolver: strategies must not mutate DOM/ARIA. Side-effectful strategies (hover-probe) exist behind `sideEffect: true` and default OFF.
12. Match each repo's existing style: this repo = plain JS + build.js (no bundler swap); ophel = their Plasmo/TS conventions; anchorlib = strict TS.
13. Selector literals live ONLY in packs (or P0's transitional `selectors.js`). A selector string inside feature code = review reject.

## Repos & hygiene
14. Extension-loading folders stay clean: no __pycache__, no *.pyc, no generated debris (user rule, 2026-07-09). Run Python with PYTHONDONTWRITEBYTECODE=1.
15. Upstream (urzeye/ophel) PRs: minimal diff, their code style, no vendored lib inside the PR, English + polite; reference concrete breakage issues.
16. Never push to `gemini-version`/`main` directly; branch + PR per phase.
17. Secrets/logins (canary profile) never committed; profile path in local config only.

## Verification mindset
18. After any change touching runtime behavior: run the affected flow end-to-end (build, load extension, exercise on fixture or live page) — not just unit tests.
19. When a fix targets "site broke X": capture a DOM snapshot into the fixture corpus FIRST, then fix against it. The snapshot is the regression test.
