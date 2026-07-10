# Design: Churn-Resistant Selector Framework (v2)

Status: v2 — post two external review rounds · 2026-07-10
v1 → v2 deltas and their rationale: [RESPONSE-to-first-critique.md](RESPONSE-to-first-critique.md) (authoritative where any older doc conflicts).
Owner repos: `sriharshaguthikonda/Tampermonkey` (this repo), ophel fork (`C:/Windows_software/Chrome_extensions/ophel`, upstream [urzeye/ophel](https://github.com/urzeye/ophel)), Prompt-queue (`C:/Windows_software/Chrome_extensions/Prompt-queue`), separate `anchor-core` + `selector-packs` repos LATER (Phase C/D).
Input research: [docs/Research/website_churn_selectors.md](../../Research/website_churn_selectors.md), [PRIOR-ART.md](PRIOR-ART.md), [RECON-codex-2026-07-10.md](RECON-codex-2026-07-10.md).

## Problem

Host sites (chatgpt.com first) change DOM without notice. Every change breaks hardcoded selectors across multiple codebases (this repo's edge-extension + userscripts, ophel adapters, Prompt-queue). Each breakage = code patch + release + reinstall. The 2026-07-10 ChatGPT update broke several at once (e.g. #19 paste-anywhere again).

## Goal

A site change should cost a **data update** (selector pack), not a code release. When even the pack can't resolve, features **degrade per-feature** instead of crashing the script, and breakage is **observable** (local self-test diagnostics) with a fast, human-approved repair loop.

## First principle (from review round 1, adopted verbatim)

> Remote definitions may help *locate* elements, but local code must retain control of **trust, state and actions**.

Everything below follows from this split: packs propose candidates; code decides trust.

## Non-goals

- Runtime LLM/AI selector healing (privacy, latency). LLM assist is offline-only (repair tooling, human-approved).
- Rewriting our scripts onto Plasmo/WXT.
- Replacing ophel upstream's architecture — we fork + feed a minimal seam upstream.
- Network data layer as a locked architecture decision — it is a go/no-go **spike** (Phase G).

## Architecture (4 layers)

```
[Selector Pack (remote JSON, versioned, data only)]   <- updatable without release
        v
[anchor-core (pure deterministic resolver)]           <- code, changes rarely
  - single resolution: descriptor -> candidates -> invariants -> result + evidence
  - NO observer, NO SPA-nav patching, NO URL polling, NO network, NO storage,
    NO event construction, NO clicking. Pure resolve + evidence only.
  - consumers keep their own lifecycle machinery
    (this repo: 08-observer-bus.js; ophel: DOMToolkit waiting/observation)
        v
[Capability adapters (per consumer — this layer already exists!)]
  this repo = feature modules; ophel = SiteAdapter (match/insertPrompt/...).
  Expose intent-level APIs: composer.submit(), composer.setText(),
  conversation.getNewestCompletedAssistantTurn(), outline.getTurnList()...
  Features NEVER consume raw pack element IDs.
        v
[Features] (TTS auto-read, paste-anywhere, TOC/outline, export, Prompt-queue ...)
  Per-feature isolation: one anchor failing to resolve degrades that feature only
  (states: waiting / temporarily_unavailable / degraded — never permanent disable,
  bounded retry; refined-github discipline).
```

### Anchor risk classes (core trust model)

Every anchor declares `risk: read | navigate | input | action | destructive`.

| Class | Remote pack may update | Code-owned, immutable remotely |
|---|---|---|
| read | any whitelisted strategy | root scoping, validation predicates |
| navigate | exact strategies; positional cautiously | same + uniqueness |
| input / action / destructive | **exact-match strategies ONLY** (attr-equals, exact role + exact/oneOf accessible name, exact multi-attr combos, native/form semantics) | invariants, trusted roots, intent checks, preflight; **no positional strategies ever** |

Banned in packs for action-class anchors: substring/regex name matching, text-contains, heuristics, positional indices, broad structural traversal, generated CSS classes without stable co-evidence.

Code-owned **invariants** per action anchor (examples for `send-button`): must be `HTMLButtonElement`, enabled, unique, inside the trusted composer root, `forbid` Dictate/Voice (the #19 lesson — the dictation exclusion lives in code, not pack data).

**Positive intent checks, not just exclusions** (a hostile/wrong pack could exactly name "Attach files"): action anchors act only through capability methods (`composer.submit()`, never a generic `clickAnchor()`); code owns the submit-control relationship (button belongs to the same trusted composer instance as the resolved input, e.g. `button.form === composerInput.form`, `type="submit"`); composer state must be "ready to submit"; expected prompt content present; all invariants rerun on freshly resolved nodes immediately before the click.

### Selector pack (data — uBlock filter-list model)

- JSON, one **base pack** per site + per-consumer **overlays**. `critical` does NOT live in packs — each consumer publishes a contract file (`required`/`optional` element list).
- Schema (v2 sketch; exact schema frozen in Phase D):

```jsonc
{
  "schema": 2,
  "site": "chatgpt.com",
  "version": "2026.07.10.1",           // date-serial, monotonic
  "minCore": "1.0.0",
  "anchors": {
    "composer-input": {
      "risk": "input",
      "cardinality": "one",             // one | many | oneOf
      "route": ["/", "/c/*"],
      "pageState": null,                // e.g. {"conversation": "streaming"}
      "allowedRoot": "composer-root",   // resolution scoped under another anchor
      "expectedAbsentWhen": null,       // e.g. stop-button absent while idle
      "strategies": [
        { "type": "testid", "value": "prompt-textarea" },
        { "type": "role", "role": "textbox",
          "accessibleName": {
            "byLocale": { "en": ["Message ChatGPT"], "de": ["Nachricht an ChatGPT"] },
            "verifiedLocales": ["en"],
            "unknownLocalePolicy": "skip-strategy" } },
        { "type": "css", "value": "div.ProseMirror#prompt-textarea" }
      ],
      "require": ["visible", "editable"],
      "forbid": []                       // security exclusions stay in CODE for action anchors
    }
  }
}
```

- **Data only. No executable JS in packs.** Strategy/predicate vocabulary is a fixed whitelist implemented in anchor-core.
- **Validation = exact typed parser** with unknown-field rejection, size caps, strategy-count caps, selector-complexity caps. No improvised subset validator, no ajv-lite.
- Delivery: public GitHub repo `selector-packs` → raw URL fetch (GM_xmlhttpRequest in userscripts, fetch in MV3), ETag cache, TTL ~6h, stale-while-revalidate.
- Baked-in copy of every pack ships in each consumer = first-run + offline + kill-switch fallback. Remote pack applies only if `version >` current; corrupt/invalid remote → ignored, keep last-good. **Retain last two good packs.** Consumer-side `packPin: "<version>|baked"` kill switch.
- **Preflight + atomic activation**: a new pack version must resolve its anchors against the live page with state-aware results before activation. Preflight states: `valid_present / valid_expected_absent / invalid_candidate / ambiguous / unexpected_absent`; activation fails only on the last three *where the tested state expects the anchor* (Stop absent while idle ≠ rejection).
- **Rollout asymmetry**: read-anchor pack changes auto-activate after preflight; **action-anchor changes require explicit local user approval in early versions** (a one-click diff prompt). This supersedes pack signing for v1.
- Signing: DEFERRED. Solo-maintainer signing key lives in the same compromise domain as repo creds; risk classes + invariants already bound the blast radius. Opt-in strict mode = SHA-pinned jsdelivr URLs. Full signing becomes a hardening item at >1 maintainer or store-scale distribution.

### Locale + accessible-name handling

- Names are **versioned, locale-scoped pack data**, never universal identifiers: `accessibleName.byLocale`, `verifiedLocales`, `unknownLocalePolicy: "skip-strategy"`.
- Adapter determines UI locale from **code-owned signals** (`<html lang>`, app locale, stored setting) — never from the candidate's own label (circular).
- Unsupported locale → skip name strategy → try exact locale-independent strategy → else **fail closed for action anchors**.
- Only observed + fixture-verified translations enter packs; no machine-translation dictionaries.
- "Exact" = exact after narrow canonicalisation: Unicode normalisation, whitespace collapse, optional configured case-fold. NEVER punctuation-stripping ("Send" ≠ "Send later").
- NO positional fallback for action anchors ("last button in composer" is locale-neutral but not intent-neutral). Locale-neutral evidence = native/form semantics: `type="submit"`, exact testid, `button.form === composerInput.form`, unique submit-capable control in trusted form, plus a small code-implemented semantic-relation vocabulary (e.g. `associated-form-submit-control`) — never arbitrary CSS ancestry/indexes.

### Strategy authoring ranking (strongest exact intent-bearing evidence first)

1. Meaningful testid
2. Native/form semantics (`type=submit`, form association)
3. Role + locale-scoped accessible name
4. Exact attribute combos
5. Code-owned semantic relations
6. Structural (LOW-RISK anchors only: read allowed rooted+validated, navigate cautious, input/action/destructive prohibited)
7. Fuzzy/heuristic (diagnostics + repair-assist ONLY — never consumed at runtime by action/input/destructive anchors; those fail closed)

Note: a random generated ID is *worse* than exact role+name; generic `type="button"` is weaker than role+name. Rank by evidence strength, not mechanism.

### anchor-core (code, changes rarely)

- Strict TypeScript. Starts as **local package `packages/anchor-core/` in this repo** (Phase B); extracted to its own repo only after both this repo and ophel consume it and the API survived at least one real churn event (Phase C exit).
- Accessible-name computation via [`dom-accessibility-api`](https://www.npmjs.com/package/dom-accessibility-api) (MIT, zero runtime deps, testing-library's engine). No hand-written accname. Dependency rule: *no new dependency without size/licence/maintenance/security review* (not "zero deps" dogma).
- API sketch (frozen in Phase B against real call sites):

```ts
const core = createAnchorCore(pack, contract, { locale, logger });
const r = core.resolve("composer-input", { root: doc });
// r: { state, element?, strategyIndex?, evidence[] }
```

- **Resolution-state taxonomy** (replaces "heal"): `primary_hit / expected_variant_hit / fallback_hit / ambiguous / not_present_expected / not_present_unexpected / candidate_repair_suggested / failed`. Absence ≠ breakage; send/stop mutual exclusion expressed via `expectedAbsentWhen` + page state.
- **Strict ambiguity rejection**: multiple candidates passing invariants = `ambiguous`, not "first wins". One strong strategy + strict invariants beats fake fallbacks (two-strategy minimum dropped).
- **Handles (Option A)**: fresh element per call; consumers re-query before acting. Never a cross-tick node cache. Retained: (a) memoisation *within one synchronous feature operation* (resolve composer once, use for input+submit checks in the same tick — re-querying between assert and click reintroduces TOCTOU); (b) winning-strategy-index caching (cheap fast path, node still freshly verified).
- Read-only against DOM: strategies never mutate DOM/ARIA. Side-effectful probing (hover-reveal) is consumer adapter behavior, not anchor-core.
- Realm-safe event util (ophel #643 `ownerDocument.defaultView` lesson) lives in consumers/adapters, NOT in anchor-core (it does no event construction).

### Passive self-test canary (primary breakage detector)

A **passive diagnostic resolver: no clicks, no submits, no focus, no mutation, ever.**

- Triggers: after stable adapter init; on meaningful SPA route transition; when a not-yet-observed state class appears; after pack activation; on resume after long background. NOT merely once-per-session.
- Anchors declare applicability: `applicableWhen: {conversation: "streaming"}` etc. Session coverage set + `probeKey = pack:route:state:viewport` dedup.
- Budget: 4–8ms cancellable idle slices (requestIdleCallback with timeout fallback), cumulative ~50ms cap per session, cancel on user input/navigation/streaming. Probes resolve FRESH in diagnostic mode (never reuse production caches).
- **Absence taxonomy** (the key correction from round 2): `verified_present / verified_expected_absent / unobserved_applicable_state / unexpected_absent` (+ ambiguous, candidate_failed_invariants, probe_interrupted, unsupported_locale). *Absence in an inapplicable state proves the state model works — not that the anchor still resolves.* Stop-button gets probed opportunistically next time the user naturally streams.
- Health panel separates: current health vs state coverage vs last positive verification vs pack-version coverage. Fixture-verified labelled separately from live-verified — never merged into one green.
- Persistence: compact local coverage history only (result codes + strategy id + coarse date — no DOM, no URLs, no titles).
- Aggregation Tier 1 (default): local-only; notify only on meaningful transitions (healthy→failed, primary→fallback, unique→ambiguous, verified→stale, pack rejected). Tier 2 (only if ever needed): explicit opt-in FAILURE-ONLY aggregate reports — minimized payload (site/pack/anchor/state/result/day-bucket), no persistent identifier, local dedup one-per-anchor-result-pack-day, open schema, user payload preview. No DP/OHTTP machinery — premature.

### Diagnostics & repair loop

1. Self-test canary + feature-level resolution events feed local diagnostics (existing diagnostics v2 in this repo).
2. User exports a **repair bundle** on demand: sanitised DOM subtree of the failing region + failing anchor ids + pack version. One click / one command. Never ambient telemetry.
3. Offline repair tool (CLI): bundle + pack → candidate-report generator + selector-generator → optional codex/LLM ranking (bundles MAY go to codex/cloud — user OK'd, D4b) → proposed pack diff runs against fixture corpus → **human approves and merges** (gate = correctness + explained diff + human approval; a human writing two lines ≠ failure). No auto-merge.
4. All users pick up the new pack within TTL. No code release, no store review, no reinstall.

### ChatGPT data layer = Phase G SPIKE (go/no-go, per consumer)

Not a locked decision (D5 downgraded). Full protocol in [phases/PHASE-G-data-layer-spike.md](phases/PHASE-G-data-layer-spike.md). Summary:

- Hypothesis under test (reviewer's own predicted best outcome): *network owns identity/graph/metadata, DOM owns presentation, completion requires corroboration by both.*
- Runs in a separate experimental module + branch, parallel to Phases D/E; D/E never depend on spike success; no backend concepts enter the pack schema prematurely.
- Ends in explicit **GO / LIMITED-GO / NO-GO per consumer** (export may be GO while TTS-speech is NO-GO). Export is first consumer if GO; TTS stays on rendered DOM regardless (TTS must read what the user sees).
- **SECURITY: `window.__reactRouterContext.state.loaderData` and raw traffic captures contain access tokens/email/identity. Raw loader state and raw captures are SECRETS**: `captures/raw/` is git-ignored + local-only; a versioned allowlist projector runs in the MAIN world *before anything crosses the bridge*; projector fails if unknown fields survive; only projected fixtures are committed.
- Strict `tee()`/`clone()` — never consume the page's original stream (D11); MAIN-world registered content script for MV3; passive only, zero extra requests.

## Decisions

| # | Decision | Why / status |
|---|---|---|
| D1 | anchor-core: local package `packages/anchor-core/` first; separate repo AFTER both consumers use it + one real churn survived | v2 amends timing, not end state (critique §1.4); user approved end state Q&A Q1 |
| D2 | Packs = data only, whitelisted strategy vocab, exact typed parser | security/trust surface; store remote-data exemption |
| D3 | Baked pack + remote overlay, version gate, preflight + atomic activation, last-TWO retention, pin/kill switch | offline + corrupt-pack + rollback safety |
| D4 | LLM repair offline-only, human-approved, no auto-merge | privacy, cost; runtime stays deterministic |
| D4b | Repair bundles MAY go to codex/cloud — explicit user action only, never ambient | user, Q&A 2026-07-10 Q4 |
| D5 | ChatGPT data layer = go/no-go SPIKE (Phase G), per-consumer verdicts | critique §1.18; conformance protocol round 2 |
| D6 | Ophel: fork consumes anchor-core fully; upstream gets PR-1 = selector-config data refactor first, resolver seam only after churn proves it | upstream review culture; critique §1.19 swapped PR order |
| D7 | Per-feature isolation; feature *states* (waiting/degraded/…), bounded retry — never permanent disable-on-miss | one dead anchor ≠ dead script |
| D8 | v1 scope: chatgpt.com only; architecture site-agnostic | user Q&A Q5; gemini/claude = future packs (#20) |
| D8b | Consumers: this repo (edge-extension + userscripts), ophel fork, Prompt-queue, every future extension | user Q&A Q6 |
| D9 | Strategy names align with Playwright locator vocabulary | familiar to every dev/agent |
| D10 | Heuristic scoring only in diagnostics/repair-assist; action/input/destructive anchors fail closed | critique §1.6; perf + trust |
| D11 | Stream interception: strict tee/clone, MAIN-world content script | consuming original stream hangs site UI |
| D12 | Risk classes on every anchor; code owns invariants/trusted roots/intent checks; remote may update exact-match strategies only for action anchors | round 2 Q3.1 resolution |
| D13 | Locale-scoped names, fail-closed unknown locale for action anchors, no positional action strategies, form-semantics as locale-neutral evidence | round 2 Q3.2 resolution |
| D14 | Passive self-test canary primary; Playwright-on-fixtures secondary; persistent-profile automation = optional CDP-attach only | round 2 Q3.3 resolution |
| D15 | Action-anchor pack changes need explicit local approval early on; signing deferred (SHA-pin = opt-in strict mode) | round 2; supersedes signing debate for v1 |
| D16 | Raw captures (DOM snapshots, network, bootstrap state) are SECRETS: git-ignored local dir, allowlist-sanitised before any commit; packs repo and fixture corpus are SEPARATE repos, corpus private by default | critique §1.11 (most serious v1 flaw) |
| D17 | Capability adapters are the named integration layer (= ophel SiteAdapter, = this repo's feature modules); features never see pack IDs | critique §1.2/§2.5 |

## Threats & mitigations

- **Remote pack = remote control risk** → data-only schema, typed parser + caps, version gate, preflight, risk classes: hostile pack at worst mis-targets *read* anchors; action anchors gated by code-owned invariants + intent checks + local approval.
- **Pack repo compromised** → same as above + last-good retention + pin/kill switch + opt-in SHA-pinned URLs.
- **Site obfuscates aggressively (class hash rotation)** → testid/role+name/form-semantics tiers survive; worst case = pack update within TTL.
- **Locale/wording experiments** → locale-scoped name data; repair = pack update (the system working as designed).
- **Backend API drift (Phase G)** → spike module isolated; DOM path remains for every consumer.
- **Privacy** → D16; no conversation/user data leaves the browser at runtime; repair bundles explicit; canary history is result-codes only.
- **A11y** → resolver read-only; never mutates ARIA.

## Success criteria

- S1: **100% precision on action anchors** (never act on the wrong element — measured on oracle + adversarial corpus); high recall on read anchors; explicit `ambiguous` when uncertain. (Replaces v1's blanket ≥90% resolve rate as the headline metric; corpus resolve rate stays as a tracked diagnostic.)
- S2: Time-to-repair after breakage ≤ 1 day via pack bump only (no code release) for ≥80% of selector-only breakages.
- S3: Zero whole-script crashes from a single anchor resolution failure (fault-injection verified).
- S4: Resolver p95 cold resolve < 50ms per anchor on large chats; canary within its idle-slice budget; no visible jank.
- S5: All features keep passing existing test suites after integration.
- S6: No conversation/user data leaves the browser at runtime (audited; repair bundles + optional Tier-2 failure reports are explicit user actions).
