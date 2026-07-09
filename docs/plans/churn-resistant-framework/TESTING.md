# Testing Framework

Applies to anchorlib (P1+), packs (P2+), and integrations (P3+). Every phase plan references these gates; a phase is DONE only when its gates pass with output pasted as evidence (verification-before-completion rule).

## Test pyramid

### 1. Unit (vitest + happy-dom) — anchorlib repo
- Resolver: every strategy type × (hit, miss, multiple-candidates, invalid-candidate) — table-driven.
- Predicates: visible/editable/inViewport/etc against synthetic DOM.
- Cache/revalidation: node removed → handle revalidates → re-resolves (virtualized-DOM simulation: remove + reinsert equivalent node).
- Pack loader: version gate, schema-invalid remote rejected, ETag/TTL logic, last-good rollback (mock fetch).
- Target: ≥95% line coverage on resolver + loader (research doc criterion).

### 2. Fixture corpus / selector-regression (the heart)
- `fixtures/chatgpt.com/YYYY-MM-DD[-label]/page.html` — real saved DOM snapshots. Canonical home: starts in THIS repo at P0 (`fixtures/`), migrates to the `selector-packs` repo at P2 (packs + the corpus that validates them live together); consumers reference it from there (copy or submodule). Single source of truth after P2 — no forked corpora. Seed corpus from snapshots already in this repo root (`chatgpt without extensions.html`, `chatgpt with extenstion.html`, `_[Extended]-_[gpt-5-5-thinking]_files`, lighthouse-keeper saves) + fresh capture at P1 start. Every future breakage adds its snapshot (P6 automates capture).
- Test: for each snapshot × each pack element: assert resolution succeeds and records **which tier** resolved it. Output = resolution matrix:

```
element          2026-05-02  2026-06-20  2026-07-10
prompt-box       t1          t1          t3(heal)
send-button      t1          t2(heal)    t2(heal)
```
- Gate: no element FAILs on the newest snapshot; heals (tier>1) allowed but must be listed in PR description → triggers pack primary-selector bump.
- This is the S1 metric (≥90% resolve across corpus after site change).

### 3. Integration (Playwright, offline)
- Serve fixture snapshots via local static server; load real built artifacts (userscript via test harness page, extension via `--load-extension` headless Chromium).
- Scenarios: resolve all elements on load; observer fires on simulated message append; SPA navigation revalidation; fault injection (see 5).
- ChatGPT data layer (P4): replay recorded `/backend-api` JSON/SSE transcripts through the intercept module; assert emitted conversation events match golden JSON.

### 4. Live canary (P6, semi-automated, local machine)
- Nightly scheduled task: Playwright with persistent logged-in profile → chatgpt.com → resolve all pack elements → send nothing (read-only; respect rate-limit threat) → write result row + snapshot on any failure/heal → notify user (existing push channel) only on regression.
- Canary failure = create breakage bundle automatically → feeds repair CLI.

### 5. Fault injection (S3 gate)
- Harness mutates fixture DOM (rename classes, strip data-testids, wrap elements, remove aria-labels — the 4 observed churn patterns from research doc) → assert: features degrade individually, no uncaught exceptions, health events emitted, other features keep working.
- Run in CI for anchorlib and for this repo's built extension.

### 6. Contract/schema tests
- Pack JSON: ajv schema validation in packs repo CI; version monotonicity check; every element referenced by any consumer feature exists in pack (consumers publish their required-element list as JSON — cross-repo contract file).

### 7. A11y + security guards
- Assert resolver made zero DOM writes after full resolve pass (MutationObserver watch during test).
- Assert no network requests to non-allowlisted hosts at runtime (pack fetch host only), Playwright network log.
- Repair bundles: snapshot sanitizer test — known PII strings in fixture must be stripped.

## CI matrix

| Repo | CI | Gates |
|---|---|---|
| anchorlib | GitHub Actions: lint, typecheck, unit, fixture-regression, fault-injection, build both bundles | all green + coverage ≥95% resolver/loader |
| selector-packs | schema validate, version check, fixture-regression against pinned anchorlib | all green |
| Tampermonkey (this repo) | node build.js + existing test_*.js + new integration suite | all green |
| ophel fork | upstream's existing checks + our adapter integration tests | upstream checks stay green (upstream-PR hygiene) |

## Evidence discipline

Every phase-completion claim in Q and A.md must paste: command run + tail of output for each gate. No green claim without output (superpowers verification rule; engineering-hardening evidence-before-done).
