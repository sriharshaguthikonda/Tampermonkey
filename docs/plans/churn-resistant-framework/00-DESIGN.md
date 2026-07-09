# Design: Churn-Resistant Selector Framework

Status: DRAFT for user review · 2026-07-10
Owner repos: `sriharshaguthikonda/Tampermonkey` (this repo), ophel fork (`C:/Windows_software/Chrome_extensions/ophel`, upstream [urzeye/ophel](https://github.com/urzeye/ophel)), NEW lib repo (Phase 1).
Input research: [docs/Research/website_churn_selectors.md](../../Research/website_churn_selectors.md), [PRIOR-ART.md](PRIOR-ART.md).

## Problem

Host sites (chatgpt.com first) change DOM without notice. Every change breaks hardcoded selectors across multiple codebases (this repo's edge-extension + userscripts, ophel adapters). Each breakage = code patch + release + reinstall. Today's ChatGPT update broke several at once (e.g. #19 paste-anywhere again).

## Goal

A site change should cost a **data update** (selector pack), not a code release. When even the pack can't resolve, features **degrade per-feature** instead of crashing the script, and breakage is **observable** (local diagnostics) with a fast repair loop.

## Non-goals

- Runtime LLM/AI selector healing (privacy, latency). LLM assist is offline-only (repair tooling).
- Rewriting our scripts onto Plasmo/WXT.
- Replacing ophel upstream's architecture — we fork + feed a minimal seam upstream.

## Architecture (4 layers)

```
[Selector Pack (remote JSON, versioned)]        <- data, updatable without release
        v
[Resolver Engine  (lib: "anchorlib", name TBD)] <- code, changes rarely
  strategy chain per element (pack decides order; authoring guidance):
    1. attrs      (stable attribute sets: data-testid, id, name)
    2. role+name  (ARIA semantics, semantic-locators approach — churns least)
    3. css        (known-good CSS; hashed/utility classnames discouraged)
    4. structural (anchored relative paths, e.g. "form descendant of main, last")
    5. heuristic  (fathom-style scored predicates: visible+editable+largest ...)
  + candidate validation predicates (visible / editable / clickable /
    interactable = not overlay-covered via elementFromPoint / enabled)
  + optional open-shadow-DOM piercing traversal per strategy
  + memoized handles w/ revalidation on DOM mutation & SPA navigation
  + health events (resolve ok / fallback depth / fail) -> local diagnostics
        v
[Site Adapter]  (per site: element map + data-layer hooks + observer predicates)
  chatgpt.com adapter also has a DATA layer: fetch/SSE intercept of /backend-api/
  (pattern from pionxzh/chatgpt-exporter) so content features read structured
  conversation JSON; DOM is only needed for UI mount points + input/send.
        v
[Features] (TTS auto-read, paste-anywhere, TOC/outline, export, ...)
  consume adapter API, never raw selectors. Per-feature isolation: one feature
  failing to resolve disables that feature only (refined-github discipline).
```

### Selector pack (data, the core idea — uBlock filter-list model)

- JSON, one pack per site. Schema (v1):

```jsonc
{
  "schema": 1,
  "site": "chatgpt.com",
  "version": "2026.07.10.1",          // date-serial, monotonic
  "minLib": "1.0.0",                   // resolver compat gate
  "elements": {
    "prompt-box": {
      "critical": true,                // feature-gating flag
      "strategies": [
        { "type": "css",  "value": "div.ProseMirror#prompt-textarea" },
        { "type": "role", "role": "textbox", "name": "*message*" },
        { "type": "css",  "value": "textarea[data-testid='prompt-textarea']" },
        { "type": "heuristic", "score": ["editable", "visible", "inViewport", "maxArea"] }
      ],
      "validate": ["visible", "editable"],
      "cache": "navigation"            // none | navigation | session
    },
    "send-button": { "...": "..." },
    "assistant-message": { "...": "..." },
    "message-container": { "...": "..." }
  }
}
```

- **Data only. No executable JS in packs.** Strategy/predicate vocabulary is a fixed whitelist implemented in the lib (unlike uBlock scriptlets — smaller trust surface).
- Delivery: public GitHub repo `selector-packs` → raw URL fetch (GM_xmlhttpRequest in userscripts, fetch in MV3 background), ETag cache, TTL ~6h, stored in GM storage / chrome.storage.local.
- A build-time **baked-in copy** of every pack ships inside each script/extension = first-run + offline + kill-switch fallback. Remote pack must have `version >` baked version to apply; corrupt/schema-invalid remote pack → ignored, log, keep last good (rollback safety).
- Optional integrity: pin by commit SHA via jsdelivr URL when we want immutability.

### Resolver engine (code, changes rarely)

- TypeScript, zero runtime deps, two build outputs: ESM (for ophel/Plasmo) + single-file IIFE global (for userscripts + edge-extension via build.js).
- API sketch (final API fixed in Phase 1 after codex call-site inventory):

```ts
const anchors = createResolver(pack, { logger, docRoot });
const el = await anchors.get("prompt-box");            // resolve w/ fallbacks, cached
anchors.observe("assistant-message", cb, {added: true}); // churn-tolerant observer
anchors.health();                                       // {elementId: {ok, fallbackDepth, fails}}
anchors.onBreakage(evt => diagnostics.report(evt));     // feeds repair loop
```

- Fallback semantics: strategies tried in order; each candidate must pass `validate` predicates; success at depth>0 logs a "heal" event (primary selector stale → pack maintainers alerted via diagnostics, still works for user).
- Virtualized-DOM aware: observers tolerate unmount/remount; handles revalidate before use (never hold stale nodes).
- Sandbox-realm safe: all events constructed via `element.ownerDocument.defaultView` (ophel #643 lesson).

### Data-layer adapter (chatgpt.com)

- Page-context injected hook wrapping `window.fetch` (+ EventSource/SSE reader) filtered to `/backend-api/conversation*` — emits structured conversation events (turn added, stream delta, title) to content script via postMessage.
- Vendored patterns from chatgpt-exporter + everything-chatgpt endpoint map; isolated module so backend API drift = one module to patch, features untouched.
- Strictly local; nothing leaves the browser. Throttle: passive interception only, no extra requests (rate-limit threat from research doc).

### Diagnostics & repair loop (closes the loop)

1. Local diagnostics (already have v2 in this repo) records resolve failures + fallback-depth heals with element id + pack version.
2. User (or nightly local canary task) exports a **breakage bundle**: sanitized DOM snapshot of the failing region + failing element ids. One click / one command.
3. Offline repair tool (CLI): snapshot + pack → codex/LLM proposes updated strategy chain → runs against snapshot corpus (regression) → human merges pack bump → all users pick up new pack within TTL. No code release, no store review, no reinstall.

## Decisions (locked unless user overrides in Q and A.md)

| # | Decision | Why |
|---|---|---|
| D1 | Lib in NEW separate repo, vendorable single file + ESM | user approved (Q&A 2026-07-10 Q1); consumable by both repos + ophel upstream someday |
| D2 | Packs = data only, whitelisted strategy vocab | security/trust surface; store-review friendliness |
| D3 | Baked pack + remote overlay w/ version gate + last-good rollback | offline safety, corrupt-pack safety |
| D4 | LLM repair offline-only | privacy, cost; runtime stays deterministic |
| D5 | chatgpt.com data layer via fetch/SSE intercept | research doc long-term option 3; proven by chatgpt-exporter |
| D6 | Ophel: fork consumes lib fully; upstream gets minimal seam PR (config-driven selectors / resolver injection), not the framework | upstream accepts small reviewable PRs, no heavy deps |
| D7 | Per-feature isolation everywhere | one dead selector ≠ dead script |
| D8 | v1 scope: chatgpt.com only; architecture site-agnostic | it's what broke; gemini/claude = future packs (#20) |
| D9 | Strategy names align with Playwright locator vocabulary (`role`, `testid`, `text`, `css`) | familiar to every dev/agent; external review 2026-07-10 |
| D10 | Heuristic tier runs only at resolve time (never per-mutation), with per-element time budget | perf on heavy pages (S4); external review flagged jank risk |
| D11 | Stream interception: strict `tee()`/passthrough — never consume the page's original stream; MV3 uses `world: "MAIN"` registered content script for the page-realm hook | consuming a ReadableStream once = site UI hangs (external review) |

## Threats & mitigations (delta over research doc)

- **Remote pack = remote control risk** → data-only schema, schema validation, version-gate, optional SHA-pinned URL, baked fallback.
- **Pack repo compromised** → same as above + lib caps strategy expressiveness (no attribute writes, resolver is read-only against DOM).
- **Site obfuscates aggressively (class hash rotation)** → that's exactly what tiers 2/4/5 (role+name, structural, heuristic) survive; worst case = pack update.
- **Backend API drift** → data-layer module isolated; DOM path remains as degraded fallback.
- **A11y** → resolver is read-only; heuristics never mutate ARIA; hover-probe tricks (ophel #642) become last-resort strategies flagged `sideEffect: true`, disabled by default.

## Success criteria (measurable, from research doc + tightened)

- S1: ≥90% of selector-regression corpus resolves after a real site change without pack update (fallback tiers do their job).
- S2: Time-to-repair after breakage ≤ 1 day, via pack bump only (no code release) for ≥80% of breakages.
- S3: Zero whole-script crashes from a single element resolution failure (per-feature isolation verified by fault-injection tests).
- S4: Resolver p95 cold resolve < 50ms per element on large chats; no visible jank.
- S5: All features keep passing existing test suites after integration (no behavior regressions).
- S6: No conversation/user data leaves the browser at runtime (audited; repair bundles are explicit user action).
