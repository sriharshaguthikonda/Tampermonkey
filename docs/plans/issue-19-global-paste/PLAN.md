# Fix #19 global paste + file remaining issues

## Context

Global paste (paste anywhere on chatgpt.com → populate prompt box) broken — GitHub issue #19, user's top priority. Investigation (3 Explore agents, this session) proved paste code is **byte-stable since introduction** (commit 5f7f55a); selectors healthy (composer fixture oracle passes vs real 2026-07-10 capture). Breakage = two independent failure layers, both silent:

1. **Init death**: `edge-extension/modules/99-bootstrap.js:300-307` — `chrome.storage.sync.get(null, cb)` has no timeout; `TTSReader.init()` (panel + the ONLY paste listener, attached at `15-playback-lock.js:283-286`) runs only inside cb. Sync stall → extension totally silent (matches observed: no panel, no console, paste dead).
2. **Guard false-positive — CONFIRMED on real DOM**: `handleGlobalPaste` (`25-prompt-send-part2.js:245-290`) early-returns when `hasBlockingOpenElements` (`:224-242`) finds any visible `[data-state="open"]` document-wide. User's fresh chatgpt.com capture (`TTS Edge Extension Bug.html`, repo root, saved 2026-07-15) has **7× `data-state="open"`** on an idle page — including the always-visible sidebar `div.bg-token-sidebar-surface-primary[data-state="open"]` — and **zero** real `role="dialog|menu|listbox"` overlays. Guard fires on every idle page → paste silently aborts whenever extension is alive.

Reference: Prompt-queue extension's working insertion recipe confirmed our `setPromptText` (execCommand insertText) is already equivalent — no need to import its machinery.

ChatGPT bridge consulted (job `20260715T041149Z_07ea534ff233b61a`) — **concurs with both fixes**, amendments folded in below: safeInit-wrap the callback body (a throw in `applySettings` inside the async cb = same silence symptom, outer safeInit can't catch it), read `chrome.runtime.lastError`, no storage.local fallback (nothing mirrored there), stronger visibility check for the guard (not offsetParent-only — fixed-position popovers), and update #19's stale description.

**Delegation (user directive)**: codex agents do implementation; orchestrator verifies test-green before trusting (past lesson: codex left work half-done). Q&A channel (`Q and A.md`) = communication; post pre-dispatch + post-completion notes per phase; don't stop for answers. **Tooling (user comment #9)**: targeted context via `repo_context_slice` + serena symbol tools (`find_symbol`, `replace_symbol_body`) for edits — no broad file reads; exact edit targets already pinned to file:line in this plan.

## Fix 1 — bootstrap hardening (`99-bootstrap.js:300-307`)

Replace `initWithStoredSettings()` get-call body. Four protections (ChatGPT-amended): fail-open 2s timeout armed **before** the get; `chrome.runtime.lastError` read + logged in cb; safeInit around `applySettings` (throw inside async cb must not kill init) and around the get call itself; init exactly once.

```js
const profile = getCurrentProfile();
TTSReader.settingsProfile = profile;
let initialized = false;
function applyAndInit(items, source) {
    safeInit(`applySettings:${source}`, () =>
        applySettings(getStoredProfileSettings(items || {}, profile), { silent: true }));
    if (!initialized) { initialized = true; safeInit('TTSReader.init', () => TTSReader.init()); }
}
// ponytail: storage.sync.get can stall/fail (issue #21, layer 1 of #19).
// Fail open to profile defaults after 2s; late get() re-applies stored settings, init runs once.
const timeoutId = setTimeout(() => { console.warn('[TTSReader] storage load timed out; using defaults'); applyAndInit({}, 'timeout'); }, 2000);
try {
    chrome.storage.sync.get(null, (items) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) { console.error('[TTSReader] storage read failed', chrome.runtime.lastError.message); applyAndInit({}, 'sync-error'); return; }
        applyAndInit(items || {}, 'sync');
    });
} catch (e) { clearTimeout(timeoutId); console.error('[TTSReader] storage read threw', e); applyAndInit({}, 'sync-throw'); }
```

Pipeline intact: `getStoredProfileSettings({}, profile)` degrades to `getProfileDefaults(profile)`; late sync arrival re-applies settings (idempotent, `silent:true`); `onChanged` listener below unchanged. Skipped: storage.local fallback (nothing mirrored there — would return `{}` and mask real settings), configurable timeout.

## Fix 2 — guard fix (`25-prompt-send-part2.js:236`)

Drop `[data-state="open"]` from the blocking selector; keep semantic blockers `[role="dialog"], [role="menu"], [role="listbox"]`:

```js
// ponytail: [data-state="open"] removed — Radix keeps it on persistent chrome (sidebar,
// pickers) so guard always fired (#19). role dialog/menu/listbox cover real Radix overlays
// (Radix unmounts closed content); role-less popovers with focused input caught by
// editable-activeElement guard. Re-add scoped variant only if real leak shows.
const menu = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"]')).find(visible);
```

Plus strengthen `visible()` (ChatGPT-amended — hidden *mounted* menus must not block; not offsetParent-only, fixed-position popovers break it): `isConnected`, no `closest('[aria-hidden="true"], [inert]')` ancestor, display/visibility, `parseFloat(opacity) > 0.01`, `getClientRects().length > 0`, rect width/height > 1 and intersecting viewport.

Rejected alternatives: offsetParent-only check (unsafe for fixed popovers, and sidebar is genuinely visible anyway); scoped data-state match (redundant — Radix overlays carry roles).

## Tests (zero-dep node scripts, copy vm-load pattern from `test_composer_fixture_oracle.js`)

- `test_paste_guard_oracle.js`: load `25-prompt-send-part2.js`, call `hasBlockingOpenElements` directly with fake DOM. Cases: Radix-idle page w/ visible `data-state="open"` sidebar (mirror real capture: `div.bg-token-sidebar-surface-primary[data-state="open"]` from `TTS Edge Extension Bug.html`) → false (**fails pre-fix = regression proof**); visible `role="dialog"` → true; `role="menu"`/`role="listbox"` → true; hidden dialog → false; hidden *mounted* menu/listbox → false; edit-box textarea → true.
- `test_bootstrap_boot_fallback.js`: stub chrome + captured setTimeout. Cases: sync cb never arrives → init once after 2s fallback; late cb → settings re-apply (spy `setGlobalPasteEnabled`), no re-init; `runtime.lastError` set → defaults + init; `applySettings` throws → init still runs.

## GitHub issues + commit sequence

1. File **#21** first (HIGH): "Content script silently dead when chrome.storage.sync.get never resolves" — cite `99-bootstrap.js:300-307`, mark as layer 1 of #19, link #19.
2. Commit 1: `fix(bootstrap): boot with profile defaults if storage.sync.get stalls (refs #21, #19)` — 99-bootstrap.js + its test.
3. Commit 2: `fix(paste): drop document-wide [data-state="open"] from blocking guard (refs #19)` — 25-prompt-send-part2.js + its test.
   `refs` not `fixes` — close #19/#21 only after live verification.
4. File LOW/MED issues (batch, one gh session): storage.sync **write** path ignores `runtime.lastError` (quota failures silently drop settings — ChatGPT-flagged, MED); stale TODO.md (2026-04-24, closed issues as P0); committed `console.log` at repo root; 8× unfilled handoff TODOs in `docs/handoff/HANDOFF.md`; empty catches `30-media-boost.js:50` + `60-highlight.js:50`; stale duplicate userscripts in `Tampermonkey_scripts/`.
5. Update #19 description (still blames stale selectors — disproven by fixture oracle; point at the two confirmed layers).
6. Push feature branch (no permission needed per user pref); no main-touching action without go-ahead.

## Verification

1. `node test_paste_guard_oracle.js` red pre-fix → green post-fix; `node test_bootstrap_boot_fallback.js` green; `node test_composer_fixture_oracle.js` still green.
2. `node build.js`, reload unpacked extension, live chatgpt.com diagnostic (extension console context):
   - `!!__TTSNS.TTSReader` (booted), `!!TTSReader.pasteHandler` (listener), `hasBlockingOpenElements(findPromptArea())` (guard idle-fire), `chrome.storage.sync.get(null, i=>console.log('sync ok'))`.
   - Then real paste test: click empty page area, Ctrl+V → prompt box populates.
   - Run diagnostic once pre-fix (evidence for issues) if user's browser session available; post-fix run is the close gate for #19/#21.
3. Close #19 + #21 with evidence after live pass.

## Housekeeping (user Q&A asks)

- **Step 0 at execution**: copy this plan into the repo at `docs/plans/issue-19-global-paste/PLAN.md` (user rule: plans live in the repo, not agent folders) and link it from Q&A + issue #19.
- Archive old `Q and A.md` entries to `Q and A.archive.md`, keep live file lean (user comment #1).
- Post status notes in Q&A channel before/after each codex dispatch; codex agents do implementation (user comment #5), orchestrator verifies test-green.

## Risks

- Lost blocking case: visible role-less non-focus popover — global paste fills composer behind it; harmless, documented in comment.
- Stall window (2s→sync arrival) applies profile defaults; a user who disabled global paste sees it briefly on — corrected by late-apply; accepted.
- If paste still broken after both fixes + live check → next suspect is read-back-verify gap in `setPromptText`; new issue, out of scope now.
