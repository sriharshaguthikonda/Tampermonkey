# driftwatch gap analysis — Sept 2026 chatgpt.com churn

Read-only research for planning. Every claim below is either a file:line citation against
`C:/Windows_software/driftwatch` (HEAD `98c59cc`) / `C:/Windows_software/Tampermonkey`
(branch `enhance-tts-functionality`) / `C:/Windows_software/Chrome_extensions/Prompt-queue`
/ `C:/Windows_software/Chrome_extensions/ophel`, or a citation into
[`00-live-dom-probe-2026-09-21.md`](00-live-dom-probe-2026-09-21.md) (already-captured live
evidence in this same folder — I did not re-probe the live page). No new fixture, pack, or
code file was written; nothing outside this one file was edited.

---

## 1. What driftwatch can do today

### APIs (`driftwatch/src/core.js`, `driftwatch/src/canary.js`)

| API | Location | Behavior |
|---|---|---|
| `compile(s)` | core.js:9-15 | Compiles one of 4 strategy shapes to a CSS selector string; throws `bad strategy: <id>` if none of `css/testid/attr/role` is present (line 14). |
| `resolve(pack, name, root, opts)` | core.js:157-159 → `resolveInternal` 111-155 | Tries strategies in order, stops at the first that satisfies min/max (and, for `action` risk, isn't past `degradeLimit`). Returns `{ok, reason, el, els, strategyIndex, strategyId, matchedCount, degraded, attempts}`. |
| `audit(pack, doc, opts)` | core.js:173-218 | Runs `resolve` once per anchor for status, **plus** a second non-short-circuiting pass over every strategy (190-196) to compute `matchedStrategies`/`agreeingStrategies`/`conflictingStrategies` (198-207) — this is what catches a strategy that quietly resolves to a *different* element than the winner, which cardinality alone can't see. |
| `use(pack)` | core.js:220-225 | Returns `{resolve, audit}` bound to one pack. |
| `canary(pack, doc, onDegrade)` | canary.js:44-58 | Runs one `audit`; only acts if the drift fingerprint (`name:status+strategyIndex` per anchor, canary.js:13-22) changed since last call. On change: pushes to a 20-entry ring buffer (49-50, `.history()` at 60), persists JSON via `chrome.storage.local` → `GM_setValue` → `localStorage` fallback chain (24-42), calls `onDegrade(report)` only if the new summary has any `degraded`/`broken`/`ambiguous` (52-55). Owns no timer itself (file header, canary.js:1-3) — the caller supplies the poll. |

Strategy forms (core.js:9-15; README.md:143-152) — exactly one per strategy:

| Form | Fields | Compiles to |
|---|---|---|
| css | `css` | used verbatim |
| test id | `testid`, `op` (`=`&#124;`^`&#124;`*`) | `[data-testid<op>="value"]` |
| attribute | `attr`, `value?` | `[attr]` or `[attr="value"]` |
| ARIA role | `role`, `name?` | `[role="value"]` or `[role="value"][aria-label="name"]` |

`requires` vocabulary (core.js:36-75, `applyRequires`), evaluated *after* a selector matches:
`connected` (isConnected, 43-44), `enabled` (not `disabled`/`aria-disabled`, 30-31/45-46),
`visible` (layout-gated — jsdom has no layout engine, so under jsdom this records
`unchecked:["visible"]` and passes rather than silently passing or failing, 21-28/47-53),
`inside:<anchorName>` (recursively resolves the named anchor first, with a recursion guard via
a `resolving` Set, 54-71).

Risk classes: pack-declared `risk: "observe"|"action"`. `action` anchors default `max` to 1 if
not explicit — "two matches at any strategy index is ambiguous, not pick-the-first" (core.js:99-102)
— and `degradeLimit` caps how many non-primary strategies may win before `resolve` refuses with
`fail-closed` (136-142).

State-conditioned `expected`: per-anchor map keyed by state name with per-state min/max overrides
(core.js:103-107, `effectiveRange`). Calling `resolve`/`audit` on a state-conditioned anchor
without `opts.state` being an actual key in `expected` returns `unknown-state` immediately —
never a silent fallback to the anchor's plain min/max (118-123; this was a fixed regression, see
docs/REVIEW-2026-07-27-external.md:35-44 "A4").

Oracle markers (test/audit.fixtures.test.js): `data-oracle="<anchorName>"` must resolve to
exactly that element (504-509); `data-oracle-negative` must never appear in *any* anchor's match
set (512-518). A fixture with oracle markers scopes ratchet checking to only the anchors it names
(483-489, "a fixture is a DOM slice, not always a full page"); one with none is checked against
every anchor.

**Testing gap found in this pass**: the oracle/negative-oracle loop (504-518) calls
`resolve(pack, anchorName, doc)` with **no `opts`/state**, for every anchor including
state-conditioned action anchors. Per core.js:118-123 that short-circuits to `unknown-state`
(`els: []`) before any strategy runs — so for `sendButton`/`stopButton` both checks pass
*vacuously*, never exercising the real strategies. The one current-frontier fixture says so
itself: `fixtures/chatgpt.com/current/desktop/conversation.html:9-14` — "`sendButton`/`stopButton`
are not oracle-marked here because both are state-conditioned... and audit()/resolve() need an
explicit opts.state to evaluate them at all" — but the negative-oracle loop still iterates them
and passes trivially instead of being skipped/flagged. Concretely: the `data-oracle-negative=""`
sidebar decoy (fixture lines 20-21, "Pin Sample Stop Chat") — added specifically because the
2026-07-28 pack refresh (commit `98c59cc`) exists to stop `stopButton` matching a sidebar
conversation — is **not actually verified** by the automated ratchet for the one anchor that
motivated it.

Ratchet rules (test/audit.fixtures.test.js): `discoverFixtures` (32-66) walks
`fixtures/<pack>/**/*.html`. `fixtures/<pack>/current/<variant>/` is the strict frontier — every
variant simultaneously "current" — and must resolve `ok`, not merely non-broken, or the test
fails (476-479, 499-501). Older dated dirs may show `degraded` but never `broken`/`ambiguous`
(490-497). Per-pack ratchet: every `packs/*.json` must have ≥1 discoverable fixture, checked
*per pack* not by total count (`missingFixturePacks`, 72-74, 449-457 — itself a fixed regression,
test label "F5").

Sanitizer (`tools/sanitize-capture.mjs`): CLI `--in <raw.html> --out <fixture.html> [--select <css>]`
(1-8, 41-54). Default `--select` is `[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]`
(line 22) — see §5, this is now dead against the live Sept-2026 DOM. `ALLOWED_ATTRS`, 20 entries
(15-20). Redaction: UUID-shaped runs → stable synthetic placeholder, numbered in first-seen order
(`makeRedactor`, 59-71); hex/base64 16+-char runs also redacted, even embedded inside a compound
value (25-39, 76-78, e.g. `request-WEB:<uuid>-0`); `data-testid` values are preserved verbatim as
"semantic constants" (99-101). Drops all text nodes/comments/`<svg>` internals by construction
(`sanitizeElement`, 87-111). Does **not** add `data-oracle`/`data-oracle-negative` — its own
`ALLOWED_ATTRS` (15-20) excludes both, and its generated file header says so explicitly:
"data-oracle / data-oracle-negative markers added by hand afterward" (156-162).

Privacy guard (`tools/check-no-captures.mjs`), run by `npm test` (package.json:10): rejects any
`.html` outside `fixtures/` (90-93), any file >50KB (`MAX_BYTES`, 19/96-98), any non-whitespace
text content after stripping tags/comments (100-104), any attribute outside a 20-entry allowlist
(106-112, a superset of the sanitizer's own — adds `data-type`/`data-oracle`/`data-oracle-negative`/`data-state`).
Per-value heuristics catch content an allowed attribute *name* wouldn't: email regex, 7+-digit
run, `sk-`/`eyJ` token prefixes, >80 chars, >6 words (37-39, 49-60) — added after an adversarial
audit found the original guard "never inspected attribute values" and would have passed
`aria-label="Copy reply to jane.doe@example.com re: invoice 4521"` clean (source: `Q and A.qanda`,
"SHIPPED" section, adversarial-audit bug #1 — this specific finding is not in
docs/REVIEW-2026-07-27-external.md).

Build/vendor flow: `build.js` reads `src/*.js` (core.js forced first, 14-16) and `packs/*.json`,
concatenates source plus a pack-registration IIFE (25-31) into one bundle written to both
`dist/driftwatch.js` and `dist/driftwatch.cjs` (36-38). `package.json:10`'s `test` script is
`check-no-captures.mjs && build.js && node --test test/*.test.js` — build only runs as a side
effect of `npm test`, with no separate gate checking consumers are in sync.

**Vendoring is entirely manual, in every consumer, with no automation anywhere.**
`edge-extension/modules/22-driftwatch.js:1-4` self-documents: "Vendored from the driftwatch repo
(dist/driftwatch.js), built via `npm run build`. GENERATED FILE — do not hand-edit. Fix bugs
upstream in driftwatch, then re-copy dist here." No script in the Tampermonkey repo references
driftwatch (checked `package.json`/manifests). Prompt-queue vendors the same way but keeps the
pack as a separate file: `Chrome_extensions/Prompt-queue/vendor/driftwatch.js` (identical header)
+ `vendor/driftwatch-pack-chatgpt.json`.

### Consumers, verified

1. **edge-extension** (`edge-extension/modules/22-driftwatch.js`, must load before
   `25-prompt-send-part1.js` per its own header). Only `composer` and `sendButton` are actually
   consumed: `resolveDriftwatchComposer()` (25-prompt-send-part1.js:31-40) calls
   `dw.resolve('composer', document)`; `resolveDriftwatchSendButton()` (42-55) calls
   `dw.resolve('sendButton', document, {state:'idle'})`; both wrap in try/catch and return `null`
   on any failure, and both callers (`findPromptArea()` 98-100, `findSendButton()` 137-139)
   fall through to a hardcoded selector array (102-114, 123-135) when driftwatch returns nothing.
   `auditDriftwatchOnce()` (59-88) runs `dw.audit()` once and only **logs** broken/degraded anchor
   names — it never gates a feature decision. `canary()` is never called anywhere in
   edge-extension (grep for `driftwatch.canary|dw.canary|canary(` across `edge-extension/modules/*.js`: zero hits outside the vendored library file itself).
2. **Prompt-queue** (`Chrome_extensions/Prompt-queue/vendor/driftwatch.js` +
   `vendor/driftwatch-pack-chatgpt.json`), consumed by `content-chat-state.js` (driftwatch
   references at lines 193-198, 487-489) for assistant-turn resolution, same fail-soft pattern
   (`window.driftwatch` undefined → hardcoded selector fallback).
3. **ophel** — D8b (00-DESIGN.md:193) names it as a required third consumer. A repo-wide grep of
   `Chrome_extensions/ophel/src` for `driftwatch`/`anchor-core` returns **zero hits**. Not started.

### Cross-repo finding: both real consumers are running a stale pack

driftwatch's `packs/chatgpt.com.json` was refreshed against a live capture in commit `98c59cc`
(2026-07-28 03:55:51 +0530) — commit message: "chatgpt.com REMOVES `button#composer-submit-button`
from the DOM when generation ends... A stop-button lookup that ends in an unscoped fallback
therefore rebinds to whatever else on the page happens to say 'Stop'... Both `stopButton`
strategies are now scoped to the composer, and they are scoped by different ancestors
(`form[data-type="unified-composer"]` and `main form`)". This also added `requires:["inside:conversationTurn"]`
to `copyResponseButton`'s primary strategy and reordered `composer`'s 3 strategies.

Tampermonkey vendored driftwatch in commit `a2866c4` (2026-07-27 22:30:42 +0530); Prompt-queue in
`3f20085` (same exact timestamp, same session). **Both are more than 5 hours before** the `98c59cc`
refresh, and **neither has re-vendored since** (confirmed: no later commit touches
`edge-extension/modules/22-driftwatch.js` or Prompt-queue's `vendor/driftwatch.js`). Diff, current
source pack vs. what's actually vendored and running today
(`edge-extension/modules/22-driftwatch.js:444-461` vs `driftwatch/packs/chatgpt.com.json`
`stopButton` block; identical delta independently present in Prompt-queue's
`vendor/driftwatch-pack-chatgpt.json`):

```diff
- "css": "form[data-type=\"unified-composer\"] #composer-submit-button[data-testid=\"stop-button\"]"
+ "css": "button[data-testid=\"stop-button\"]"                       (no composer scoping)
- "css": "main form button[aria-label^=\"Stop\"]:not([disabled])"
+ "css": "button[aria-label^=\"Stop\"]:not([disabled])"               (no "main form" scoping)
```

Both shipped consumers are running the **exact pre-fix, sidebar-decoy-vulnerable** `stopButton`
strategies, over 7 weeks after the fix landed upstream — because the re-vendor step was never
run. This is moot against the current (Sept 2026) DOM, where every strategy for every anchor is
dead regardless of pack revision (§5) — but it is direct, dated proof that the "re-vendor into
every consumer" step in §4 is not just theoretically manual, it has already silently failed once.

---

## 2. Pack coverage

`packs/chatgpt.com.json` — 6 anchors, all `pack: "chatgpt.com", version: 1`:

| Anchor | Risk | Strategies (id) | Notes |
|---|---|---|---|
| `conversationTurn` | observe, pick last, max 400 | testid-prefix, data-turn-id, data-turn, legacy-article | 4 strategies |
| `assistantMessage` | observe, pick last | message-author-role, data-turn | 2 strategies |
| `copyResponseButton` | observe, pick last, max 4 | testid-button (`inside:conversationTurn`), aria-label-prefix (`inside:conversationTurn`) | 2 strategies, both scoped |
| `composer` | action, degradeLimit 1 | prompt-textarea-contenteditable, contenteditable-textbox, prompt-textarea-id | 3 strategies, **no `requires` on any of them** |
| `sendButton` | action, degradeLimit 1, min 0, state: idle 1/1, streaming 0/0 | testid, composer-submit-id, aria-label-prefix | each `requires: [connected, enabled]` |
| `stopButton` | action, degradeLimit 1, min 0, state: idle 0/0, streaming 1/1 | composer-submit-id (form-scoped), aria-label-prefix (`main form`-scoped) | each `requires: [connected, enabled]` |

### Concepts a TTS reader needs that the pack does NOT cover — cross-checked against edge-extension code

- **Assistant markdown/content root** (the actual text TTS reads). `assistantMessage` is only the
  outer container; the real read-target lookup is hardcoded in 4 places, none pack-driven:
  `CANDIDATE_SELECTORS` = `'p, li, h1...blockquote, .markdown, article'`
  (`edge-extension/modules/00-namespace.js:256`); `.whitespace-pre-wrap, .markdown`
  (`20-smart-copy-part1.js:77,104-109`); `[data-message-author-role] .markdown`
  (`87-ui.js:47-54`); `.markdown em`/`.markdown strong` (`70-auto-read.js:609,615,755`).
- **User message anchor**. The pack has no `userMessage` — only `assistantMessage` — despite the
  identical strategy shape being a one-field swap (`value:"assistant"` → `"user"`). Extension
  instead hardcodes `USER_MESSAGE_SELECTORS` (`00-namespace.js:289`) and inline
  `[data-message-author-role="user"]` queries in `25-prompt-send-part2.js:37,47,76,80,106`,
  `15-playback-lock.js:297`, `35-server-tts.js:372,385`, `20-smart-copy-part1.js`.
- **Turn/message container used by observers**. `.group\/conversation-turn, .group\/turn-messages, [data-message-author-role]`
  (`15-playback-lock.js:297`, `35-server-tts.js:385`) — a Tailwind-generated class-name selector
  the pack doesn't track, of the exact kind 00-DESIGN.md:63 flags as unstable ("generated CSS
  classes without stable co-evidence").
- **Read-aloud / TTS's own UI** (`#tts-control-panel`, `[data-tts-ui]`, …) — correctly out of
  scope. This is the extension's own injected DOM, not a chatgpt.com concept (D17 / AGENT-RULES.md
  rule 15: "Extension-own-UI selectors... stay in code").
- **Stop/streaming indicator** — the pack *has* `stopButton`, state-conditioned, but edge-extension
  never calls `dw.resolve('stopButton', ...)` anywhere (grep confirmed). Pre-existing integration
  gap, not new to this churn: the pack tracks it, nothing consumes it.
- **Model/thread switching signals, scroll container** — zero occurrences in
  `edge-extension/modules/*.js` (grepped for route/model-switcher/scroll-container/`[role=main]`;
  the only scroll-related selector found, `.tts-current-sentence` in `90-scroll.js:106`, is the
  extension's own marker, not a chatgpt.com selector). Not needed today.

### The bigger picture (per `00-live-dom-probe-2026-09-21.md`)

This is not "the pack is missing a few concepts" — per the live probe §1, **every strategy of
every one of the 6 existing anchors** is now `broken`, `fail-closed`, `degraded`, or
"ambiguous-in-effect" against the live page. The DOM moved from turn-per-message
(`article`/`section[data-testid="conversation-turn-N"]`) to exchange-per-turn-pair
(`[data-turn-key]` holding one `[data-content-search-unit-key$=":user"]` and one
`...":assistant"]`), and the `data-testid` vocabulary the whole pack is keyed on is gone from the
thread and composer (probe §1, page-wide `[data-testid]` count = 1). Re-authoring is a vocabulary
replacement, not a coverage addition.

---

## 3. Phase-by-phase status

Authoritative status header: `docs/plans/churn-resistant-framework/01-ROADMAP.md:3-34` (the
2026-07-27 STATUS block). Everything below re-verifies it against current source/git state.

| Phase | Status | Evidence |
|---|---|---|
| **A** — repair + evidence | Delivered, but via direct hardcoded-selector patches, not framework machinery (driftwatch didn't exist yet at those commit dates) | commits `21f71e4`, `5f05938`, `b32de1e`, `d74ff90` (Tampermonkey git log) |
| **B** — local anchor contract | **Delivered differently**: as `driftwatch` (separate repo), not `packages/anchor-core/` (confirmed: no such directory exists anywhere in Tampermonkey) | ROADMAP:18; `driftwatch/src/core.js` fulfills css/attr/role strategies, root scoping, cardinality, risk classes, evidence (`attempts[]`), strict ambiguity rejection. **Not delivered**: role/name via `dom-accessibility-api` (00-DESIGN.md:136) — `role` strategy is a plain `[role][aria-label]` CSS match (core.js:13); `dom-accessibility-api` is not a dependency (`package.json` devDependencies: only `jsdom`). |
| **C** — ophel proof, extract | **Partial**: extraction done, ophel-adoption half not | ROADMAP:18-19: "C's 'extract to its own repo' step is already done; only the ophel adoption half remains." Confirmed: zero `driftwatch`/`anchor-core` refs in `ophel/src`. |
| **D** — pack format + overlays | **Partial**: data-only JSON ✓; remote overlays/preflight/pin-kill/typed-parser ✗ | ROADMAP:20-21. Grep for `preflight/overlay/TTL/ETag/packPin/GM_xmlhttpRequest` in `driftwatch/src`, `driftwatch/tools`, `build.js`: zero hits. Packs loaded via plain `JSON.parse`/object literal (build.js:20), no schema validation in core.js. |
| **E** — remote rollout + canary | **Not started** | `canary()` exists (canary.js) but is called by neither consumer (grep confirmed). No stale-while-revalidate loader (see D). No action-anchor approval UI. |
| **F** — repair assistance | **Not started** | `driftwatch/tools/` contains only `sanitize-capture.mjs` and `check-no-captures.mjs` — no candidate-report/selector-generator/repair-pack tooling. |
| **G** — data-layer spike | **Not started** | Zero occurrences of `reactRouterContext`/`loaderData`/`dataLayer` in `edge-extension`. |

### Decisions D1–D17

| # | Status | Evidence |
|---|---|---|
| D1 | Superseded by user decision ("pick better name seperate repo now!") — went straight to a separate repo; retroactively claimed met (2 consumers + 1 real churn survived) | `01-ROADMAP.md:3-8`; `Q and A.qanda` "SHIPPED" section |
| D2 | Partial: data-only ✓; typed parser with unknown-field rejection ✗ | packs/chatgpt.com.json is plain JSON; no parser/validator in core.js |
| D3 | Baked pack only; no version gate, preflight, last-two retention, or pin/kill at runtime | `version` field exists on the pack (chatgpt.com.json:3) but nothing reads/compares it in core.js/canary.js |
| D4 / D4b | Not built | No repair tooling exists (matches F) |
| D5 | Not started | Phase G |
| D6 | Not started | zero driftwatch refs in ophel |
| D7 | Honored for the 2 wired anchors, by the fallback pattern, not by a general framework mechanism | `resolveDriftwatchComposer`/`resolveDriftwatchSendButton` catch-and-null (25-prompt-send-part1.js:31-55), callers always fall through to the legacy array |
| D8 | Matches — single pack file, chatgpt.com only | packs/ has 1 file |
| D8b | 2 of 3 consumers delivered (edge-extension, Prompt-queue); ophel not | §1 |
| D9 | Not evaluated — strategy `id`s are free-form strings, not obviously Playwright-locator-named | e.g. `"turn.testid-prefix"` |
| D10 | Delivered | `compile()` (core.js:9-15) supports only css/testid/attr/role, no fuzzy type; action anchors fail closed past `degradeLimit` (136-142) |
| D11 | Not started | Phase G |
| D12 | Partial: `risk` field gates max/degradeLimit ✓; `requires` invariants are pack-data, not separately code-owned (moot today — no remote pack distribution exists to exploit the gap) | packs/chatgpt.com.json strategy-level `requires` arrays |
| D13 | Not built | `role` strategy takes one flat `name` string (core.js:13); no `byLocale`/`verifiedLocales`/`unknownLocalePolicy` anywhere |
| D14 | Canary exists but unused (E); "Playwright-on-fixtures" doesn't exist — fixture tests run under jsdom (test/audit.fixtures.test.js:6), so the `visible`/jsdom-blind-spot (core.js:21-28) is never closed by any current test layer | |
| D15 | N/A — no remote pack distribution to approve/sign | |
| D16 | Delivered on sanitization (sanitize-capture.mjs + check-no-captures.mjs); **not** on repo separation — packs and fixtures live in the same repo, not separate ones as D16 specifies | |
| D17 | Delivered for the wired anchors — feature code calls `resolveDriftwatchComposer()`/`resolveDriftwatchSendButton()`, anchor names ('composer','sendButton') only appear inside those two helpers (25-prompt-send-part1.js:31-55), never deeper in feature logic | |

### Success criteria S1–S6

| # | Status | Evidence |
|---|---|---|
| S1 (100% action-anchor precision) | **Unmeasured** — no corpus exists; the one current-frontier fixture doesn't oracle-test state-conditioned action anchors at all (§1 finding). As of the live probe, `sendButton`/`stopButton` are currently fail-closed/degraded on the real page — "0 wrong actions" only because they refuse to act, not because verified correct | fixtures/chatgpt.com/current/desktop/conversation.html:9-14; 00-live-dom-probe §1 |
| S2 (≤1 day repair via pack bump) | **Not met** for this event as of 2026-09-21; no fix shipped yet. Also: even a same-day pack fix would not reach either consumer without the separate manual re-vendor step (§1, §4) — S2 as worded doesn't currently account for that second step | |
| S3 (zero whole-script crashes from one anchor failing) | Likely met for the 2 wired anchors by construction (try/catch + null fallback everywhere) but not verified by a fault-injection suite | 25-prompt-send-part1.js:34-39,45-54,68-72 |
| S4 (p95 <50ms, canary idle-slice budget) | Unmeasured — no perf test in test/ | |
| S5 (existing suites keep passing) | Not independently re-run in this pass (read-only task); consumer test counts only known from `Q and A.qanda` narrative | |
| S6 (no conversation/user data leaves the browser) | Delivered — canary persistence is local-only (canary.js:24-42), no network calls anywhere in `src/`, `resolve`/`audit` never read `textContent`/`innerHTML` (confirmed reading core.js in full) | |

---

## 4. The churn-detection workflow as it exists today

Step-by-step, what happens today from "something broke" to "fix is live in both consumers":

| # | Step | Tooled / Manual / Missing | Evidence |
|---|---|---|---|
| 1 | Notice something broke | **Missing** proactive signal — no canary runs in either consumer | §1 (canary unused) |
| 2 | Capture live DOM | **Manual** — ad hoc devtools script (exactly what `00-live-dom-probe-2026-09-21.md §6` is: a hand-written `querySelectorAll(...).length` probe, not a driftwatch tool) | no capture-automation tool exists in `driftwatch/tools/` |
| 3 | Sanitize the capture into a fixture | **Tooled, but broken default** — `node tools/sanitize-capture.mjs --in <raw> --out <fixture> [--select <css>]` works, but its default `--select` (sanitize-capture.mjs:22) is the now-dead old vocabulary; a caller must already know the new selector shape to pass via `--select`, or the default invocation captures zero elements | §1 |
| 4 | Add the fixture under `fixtures/chatgpt.com/current/<variant>/`, mark oracles | **Manual** — sanitizer doesn't add `data-oracle`/`data-oracle-negative`, its own header says "added by hand afterward" | sanitize-capture.mjs:156-162, ALLOWED_ATTRS 15-20 excludes both |
| 5 | Run the ratchet to see which anchors are broken | **Tooled** — `npm test` auto-discovers the new fixture and reports per-strategy `id×count` for every failing anchor | test/audit.fixtures.test.js:32-66, 494-497 |
| 6 | Edit `packs/chatgpt.com.json` for the flagged anchors | **Manual**, no assist tool (Phase F not started) | |
| 7 | Re-run `npm test` until fully `ok` | **Tooled** | same command |
| 8 | Rebuild `dist/driftwatch.{js,cjs}` | **Tooled** — `npm run build`, also runs automatically inside `npm test` | package.json:9-10 |
| 9 | Re-vendor into **each** consumer | **Manual, per consumer, with zero staleness detection** — hand-copy into `edge-extension/modules/22-driftwatch.js` and separately into Prompt-queue's `vendor/driftwatch.js`+`vendor/driftwatch-pack-chatgpt.json`. Nothing detects drift between source and vendored copy — proven: it silently drifted for 7+ weeks (§1) | 22-driftwatch.js:1-4 header; §1 cross-repo finding |
| 10 | Verify live | **Manual** — reload extension, exercise the feature on chatgpt.com | AGENT-RULES.md rule 25 |
| 11 | ophel | **N/A** — not a consumer yet | §1 |

---

## 5. Minimum capability gap for THIS repair

Ranked by necessity. Tagged **needed-now** vs **second-churn**, and with the roadmap phase it
belongs to. Per the live probe, this churn is a wholesale vocabulary replacement across every
existing anchor (§2), not a missing-anchor problem — most of the list below is data, not code.

1. **needed-now — pure pack-data edit, zero core.js change.** Re-author all 6 existing anchors'
   strategies in `packs/chatgpt.com.json` against the new vocabulary in
   `00-live-dom-probe-2026-09-21.md §2/§7` (`[data-turn-key]`, `[data-content-search-unit-key$=":user"|":assistant"]`,
   `[data-markdown-text-style="assistant-message"]`, `form button[aria-label="Send"|"Stop"]`, etc.).
   `compile()` already supports every new selector shape found (all are plain CSS/attribute
   forms). This alone, done and re-vendored, fixes the 2 wired anchors (composer, sendButton) and
   makes the 4 audited-but-unwired anchors resolvable again for future wiring.
2. **needed-now — Phase D-adjacent, cheap.** Add a `userMessage` anchor (same shape as
   `assistantMessage`, one `value` swap) or otherwise fold the 5+ hardcoded
   `[data-message-author-role="user"]`/`USER_MESSAGE_SELECTORS` call sites (§2) onto the pack.
   The new DOM's paired-unit structure makes user/assistant resolution one concept, not five
   copy-pasted selector strings.
3. **needed-now — Phase D-adjacent, cheap.** Add an `assistantMarkdownRoot` anchor for
   `[data-markdown-text-style="assistant-message"]` and wire the 4 hardcoded `.markdown` call
   sites (00-namespace.js:256, 20-smart-copy-part1.js:77/104-109, 87-ui.js:47-54,
   70-auto-read.js:609/615/755) to consume it. Per the live probe, `.markdown`/`.prose` are both
   0-match now — this is the closest thing to "TTS literally has no read target" if that
   old class truly rotted site-wide, and none of these 4 sites are currently pack-driven at all.
4. **needed-now — one-line tooling fix, not a driftwatch capability.** Update
   `tools/sanitize-capture.mjs`'s default `--select` (line 22) off the dead
   `conversation-turn-`/`article` vocabulary, or the next capture attempt silently yields nothing.
5. **second-churn — Phase D.** A re-vendor staleness check (a version/hash comparison the
   vendored file's own header records) so the "pack refreshed upstream, never re-copied for 7+
   weeks" failure (§1) can't repeat silently. Does not need the full remote-pack-loading machinery
   D specifies — a much smaller check closes the actually-observed gap. Build the small version if
   at all; the big one is still YAGNI.
6. **second-churn — Phase B/D.** Fix the oracle-loop blind spot (test/audit.fixtures.test.js:504-518
   never passes `state`, so `sendButton`/`stopButton` are never actually oracle-verified, §1).
   Not needed to verify THIS repair — a hand/live smoke test already covers it (AGENT-RULES.md
   rule 25) — but should not survive a second churn unfixed.
7. **explicitly YAGNI for now.** Everything else undelivered in §3 — remote pack delivery,
   preflight, pin/kill, overlays, canary wiring (E), repair-assist tooling (F), locale-scoped
   names (D13), `dom-accessibility-api`-based role/name matching (rest of B). None of it is
   necessary to fix a same-pack-shape, same-strategy-vocabulary data edit. Building any of it now
   would be exactly the over-building the "bootstrapping strategy" framing is meant to avoid — the
   manual steps that are actually the bottleneck today are capture (§4 step 2), oracle-adding
   (§4 step 4), and cross-repo vendoring (§4 step 9); the ratchet/build tooling itself is fine.

---

## 6. Open questions — need a live browser, not more source reading

1. "Enter did not submit" a synthetic keystroke into the new composer during the probe
   (00-live-dom-probe §3 item 5) — real behavior change, or a test-harness artifact? The probe's
   own author flags this as unverified.
2. Where does "Read aloud" live now? `button[aria-label*="Read aloud" i]` = 0 in the probe;
   possibly inside the "More actions" menu — unverified (probe §2, last row).
3. Does `speechSynthesis.speaking=false` + zero `<audio>` elements after generation mean
   auto-read/server-TTS is actually broken, or does server-TTS play from a background/offscreen
   document a page-level probe can't see? Probe §5 explicitly calls this "not proof" and
   recommends re-testing with `debugLogging=true`.
4. Untested states: mobile viewport, logged-out, an existing (non-temporary) conversation, and
   3+ exchanges — does `[data-turn-key]` ordering hold, and does the
   `[data-content-search-unit-key]` numeric index (`:0:user`, `:2:assistant` — index 1 unused in
   the probe) mean anything, or is it noise?
5. Exact date of the chatgpt.com redesign — would let "how long has this been broken" be bounded
   the same way the vendoring-staleness gap was bounded in §1.
6. Does the "two contenteditable textboxes when a code block is present" composer ambiguity
   (probe §3 item 3) get worse with multiple code blocks in one thread — relevant to whether
   `composer`'s `degradeLimit:1` is enough once re-authored, or whether it needs an explicit
   `requires` scope instead of relying on strategy order.
7. Does the sidebar-decoy risk the 2026-07-28 pack refresh was built to guard against
   (`stopButton` matching a sidebar item whose title contains "Stop") still apply under the new
   DOM shape — the probe didn't check for a sidebar entry with a matching title against the new
   `form button[aria-label="Stop"]` selector.
