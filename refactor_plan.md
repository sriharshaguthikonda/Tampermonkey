# Refactor Plan — Edge Extension Split (Tampermonkey TTS Reader)

> Audience: downstream coding agent (possibly weaker model). Follow steps **in order**, **mechanically**. Do not skip. Do not improvise. Every step has **DO**, **VERIFY**, **STOP**.

---

## 0. TL;DR

Goal: split the 7381-line `edge-extension/content.js` into ~15 focused module files loaded in order via `manifest.json` `content_scripts[0].js` array. **Zero behavior change.** Methods stay on one shared `TTSReader` object via shared namespace pattern; `this`-binding preserved.

Tampermonkey userscript stays single-file (Tampermonkey constraint). Already has section banners. No further work in this refactor.

**Workflow:**
```
Phase A: add + commit + push   (already-pending TTS-clip fix — may already be committed)
Phase B: split content.js into modules
Phase C: add + commit + push   (refactor result)
```

Branch: `enhance-tts-functionality` (already checked out). Push only at end of A and end of C.

**Files in scope (paths relative to repo root `C:/Windows_software/Tampermonkey`):**

| File | Lines | Role |
|---|---|---|
| `edge-extension/content.js` | 7381 | Edge MV3 content script — to be SPLIT |
| `edge-extension/manifest.json` | 73 | Manifest — `content_scripts[0].js` array updated |
| `Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js` | 3727 | Userscript — UNCHANGED in this refactor |

**Out of scope:** `background.js`, `popup.js`, `options.js`, CSS, HTML, icons, README, Tampermonkey userscript.

---

## 1. Hard Rules

1. **No semantic change.** Behaviour parity mandatory. Confirm via manual smoke test before commit.
2. **No `this` migration.** Every method on `TTSReader` keeps `this.foo()` callsites unchanged. Methods stay on one shared object.
3. **Tampermonkey untouched.** `.user.js` cannot be split. Skip entirely.
4. **No version bump in this refactor.** `manifest.json` version stays `1.33`. Push-bump only if user requests.
5. **No `git add -A`. No destructive git** (`reset --hard`, `push --force`, `--no-verify`).
6. **Verify after every module write** with `node --check`. If fail, `git restore` the file. Never fix-forward syntax breaks.
7. **Smoke test required before Phase C push.** This is a real refactor, not comment-only. Load unpacked extension, open chatgpt.com, confirm overlay + TTS button + auto-read all work.
8. **Caveman commit messages** (imperative, ≤72 char subject). No emojis.
9. **If confused, STOP and ask user.** Do not guess.

---

## 2. Pre-flight (one-shot)

```bash
cd "C:/Windows_software/Tampermonkey"

# 2.1 Branch
git branch --show-current
# EXPECT: enhance-tts-functionality

# 2.2 Working tree
git status --short
# EXPECT: clean OR exactly the 3 pending Phase-A files modified.

# 2.3 Files parse
node --check edge-extension/content.js
# EXPECT: exit 0

# 2.4 Section anchors present
grep -c "// SECTION " edge-extension/content.js
# EXPECT: 22 (sections 01..22)

# 2.5 Remote reachable
git fetch origin
```

If any FAIL → STOP.

---

## 3. Phase A — Commit & Push the Pending Fix (skip if already done)

Check first:
```bash
git log --oneline -5
# If top commit subject matches "fix(tts): unwrap word spans on revert..." → SKIP Phase A. Phase A already done.
git status --short
# If shows 3 modified files (content.js, manifest.json, userscript) → do A.1..A.5.
```

### A.1 Stage exact files
```bash
git add edge-extension/content.js
git add edge-extension/manifest.json
git add "Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js"
```
No `git add -A`.

### A.2 Verify staged diff
```bash
git diff --cached --stat
# EXPECT: 3 files, content.js + userscript ~+30/-25 each, manifest +1/-1.
```
Other file appears → STOP, `git reset HEAD <path>`.

### A.3 Commit
```bash
git commit -m "fix(tts): unwrap word spans on revert to keep streamed text" -m "Auto-read wrapped per-word spans then restored a stale innerHTML snapshot, wiping text streamed in after wrap. Replace innerHTML-restore paths in revertParagraph, prunePrewrappedParagraphs, clearPrewrappedParagraphs, deferProcessedParagraphRevert, schedulePendingRevert, flushPendingReverts with unwrapWordSpans which only replaces marked data-tts-word=\"1\" spans with text nodes. Mirrors fix in edge-extension/ and Tampermonkey_scripts/. Bumps manifest 1.32->1.33 and userscript @version 3.10->3.11."
```

### A.4 Sync + push
```bash
git fetch origin
git pull --rebase origin enhance-tts-functionality
# Conflicts → STOP, ask user.
git push origin enhance-tts-functionality
```

### A.5 Verify
```bash
git log -1 --oneline
git status --short  # EXPECT: clean
```

✅ **Phase A complete.**

---

## 4. Phase B — Split `content.js` into Modules

### B.0 Architecture (read once, then follow B.1..B.6)

**Pattern: shared namespace + manifest load order.**

- New directory: `edge-extension/modules/`
- Each module = own IIFE = own file
- First module creates `window.__TTSNS = { constants, helpers, TTSReader }`
- Subsequent modules pull from `window.__TTSNS` via destructuring at IIFE top, then `Object.assign(window.__TTSNS.TTSReader, { ...methods })`
- Last module calls `window.__TTSNS.TTSReader.init()`
- `manifest.json` `content_scripts[0].js` lists all modules in load order
- All modules run in same isolated world per frame (Chrome MV3 guarantee) → `window.__TTSNS` shared across them

**Why this preserves `this`:** ES6 method shorthand inside `Object.assign(target, { foo() { this.bar(); } })` resolves `this` at call time = the receiver. All methods Object.assign'd to the same `TTSReader` object → `this` always = `TTSReader`. No callsite edits.

**Why this preserves top-level constants/helpers:** each module's IIFE destructures from `window.__TTSNS.constants` and `window.__TTSNS.helpers` at top, so method bodies reference bare names exactly as before:
```js
(function(){
    'use strict';
    const ns = window.__TTSNS;
    const { SETTINGS_STORAGE_KEY, BASE_DEFAULT_SETTINGS, PROFILE_CHATGPT } = ns.constants;
    const { getProfileFromUrl, getCurrentProfile, getProfileDefaults, pickLegacySettings, persistProfileSetting } = ns.helpers;
    Object.assign(ns.TTSReader, {
        // methods unchanged from original
    });
})();
```

### B.1 Module map

Source line ranges in `edge-extension/content.js` (post-banner-pass):

| #  | Section in source           | Source lines | New file                                  | Approx out lines |
|----|-----------------------------|--------------|-------------------------------------------|------------------|
| 01 | TOC + 'use strict' + 01+02  | 1–382        | `modules/00-namespace.js`                 | ~395             |
| 02 | 03 Lifecycle & Init         | 383–423      | `modules/10-lifecycle.js`                 | ~55              |
| 03 | 04 Playback Lock            | 424–722      | `modules/15-playback-lock.js`             | ~315             |
| 04 | 05 Smart Copy               | 723–1678     | `modules/20-smart-copy.js`                | ~975             |
| 05 | 06 Prompt / Send / Paste    | 1679–2104    | `modules/25-prompt-send.js`               | ~445             |
| 06 | 07 Media Boost              | 2105–2248    | `modules/30-media-boost.js`               | ~160             |
| 07 | 15 Server TTS               | 2249–2686    | `modules/35-server-tts.js`                | ~455             |
| 08 | 08 Voice Resolution         | 2687–3045    | `modules/40-voice.js`                     | ~375             |
| 09 | 09 Paragraph Indexing       | 3046–3085    | `modules/45-paragraph.js`                 | ~55              |
| 10 | 10 Text & Speech Units      | 3086–3453    | `modules/50-text.js`                      | ~385             |
| 11 | 11 Selection Seek           | 3454–3612    | `modules/55-selection.js`                 | ~175             |
| 12 | 12 Highlight & Word Spans   | 3613–3676    | `modules/60-highlight.js`                 | ~80              |
| 13 | 13 Prewrap & Revert         | 3677–4017    | `modules/65-prewrap.js`                   | ~360             |
| 14 | 14 Auto-Read Observer       | 4018–5840    | `modules/70-auto-read.js`                 | ~1840            |
| 15 | 16 Queue & Utterance        | 5841–6128    | `modules/75-queue.js`                     | ~305             |
| 16 | 17 Reading Flow & Nav       | 6129–6542    | `modules/80-flow.js`                      | ~430             |
| 17 | 18 Event Listeners          | 6543–6687    | `modules/85-events.js`                    | ~165             |
| 18 | 19 UI Build                 | 6688–6924    | `modules/87-ui.js`                        | ~255             |
| 19 | 20 Scroll & Pointer         | 6925–7076    | `modules/90-scroll.js`                    | ~170             |
| 20 | 21 Notifications & Drag     | 7077–7131    | `modules/92-notify.js`                    | ~75              |
| 21 | 22 Bottom-Level Bootstrap   | 7132–end     | `modules/99-bootstrap.js`                 | ~270             |

**Numeric prefix = manifest load order.** Lexicographic sort matches load order. Numbers leave gaps for future inserts.

**Line-number drift warning:** if `content.js` lines have shifted since this plan was written, use grep on the section banner string to relocate, e.g. `grep -n "// SECTION 05:" edge-extension/content.js`. Banners are unique anchors.

### B.2 Master extraction procedure (per module)

For each row N in B.1, in order top-to-bottom:

**Step 1 — Identify cut range.**
```bash
# Confirm start anchor
grep -n "// SECTION NN:" edge-extension/content.js
# Confirm next-section anchor (= end+1 of current cut)
grep -n "// SECTION MM:" edge-extension/content.js   # MM = next section in source order
```

Source section order (line-number order, NOT numeric order):
01, 02, 03, 04, 05, 06, 07, 15, 08, 09, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22.

**Step 2 — Read the cut.**
Use `Read` tool with `offset=<start>` and `limit=<end-start>` to retrieve the exact slice.

**Step 3 — Determine which constants/helpers the slice references.**
```bash
# Quick scan for top-level identifiers used inside slice
grep -oE '\b(SETTINGS_STORAGE_KEY|PROFILE_CHATGPT|PROFILE_LOCAL|PROFILE_FILE|BASE_DEFAULT_SETTINGS|PROFILE_DEFAULT_SETTINGS|getProfileFromUrl|getCurrentProfile|getProfileDefaults|pickLegacySettings|persistProfileSetting)\b' <(sed -n '<start>,<end>p' edge-extension/content.js) | sort -u
```
Use the result to populate the destructured imports at top of new module. If a slice references no top-level helpers, omit the destructure line. Never destructure unused names — `node --check` will not error but it's noise.

**Step 4 — Write the new module file.**
Module template (use Write tool to create file):

```js
(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    // Destructure ONLY the constants/helpers this module uses (Step 3 result):
    const { /* e.g. PROFILE_CHATGPT, BASE_DEFAULT_SETTINGS */ } = ns.constants;
    const { /* e.g. getCurrentProfile, persistProfileSetting */ } = ns.helpers;

    Object.assign(ns.TTSReader, {
        // === paste the methods slice here, EXACTLY as in source ===
        // (the SECTION NN banner comment can stay as a comment inside the Object.assign)
    });
})();
```

**Critical paste rules:**
- The slice from source is method properties of an object literal: `methodName(args) { ... },\n` repeated. Paste those property entries directly into the `Object.assign({ ... })`.
- Trailing comma on the last method is allowed and recommended.
- Indent: source has 8-space indent (inside original `TTSReader = {`). New module has 8-space indent (inside `Object.assign({`). Same. **Do not re-indent.**
- Section banner comment line (`// SECTION NN: …`) stays inside the Object.assign as a comment between methods. Harmless.
- DO NOT touch method bodies. Zero edits to logic.

**Step 5 — Syntax check the new file.**
```bash
node --check edge-extension/modules/<filename>
```
Fail → `git restore` (or just delete the new file with `rm` since it isn't tracked yet) → redo Step 4. Most common cause: missed comma between methods, or pasted partial slice.

**Step 6 — Repeat for next module.**

### B.3 Special cases

**`00-namespace.js` (first module, different template):**
```js
(function () {
    'use strict';

    if (window.__TTSNS) return;

    const SETTINGS_STORAGE_KEY = 'settingsByProfile';
    const PROFILE_CHATGPT = 'chatgpt';
    const PROFILE_LOCAL = 'local';
    const PROFILE_FILE = 'file';

    const BASE_DEFAULT_SETTINGS = {
        // === paste lines 37–98 from source EXACTLY ===
    };

    const PROFILE_DEFAULT_SETTINGS = {
        // === paste lines 100–124 from source EXACTLY ===
    };

    function getProfileFromUrl(urlLike) { /* paste from source */ }
    function getCurrentProfile() { /* paste */ }
    function getProfileDefaults(profile) { /* paste */ }
    function pickLegacySettings(items) { /* paste */ }
    function persistProfileSetting(profile, key, value) { /* paste */ }

    const TTSReader = {
        // === paste SECTION 02 state object — lines 186–382 from source EXACTLY ===
        // (this is the property initializer block; everything up to but NOT including
        //  the SECTION 03 banner)
    };

    window.__TTSNS = {
        constants: {
            SETTINGS_STORAGE_KEY,
            PROFILE_CHATGPT,
            PROFILE_LOCAL,
            PROFILE_FILE,
            BASE_DEFAULT_SETTINGS,
            PROFILE_DEFAULT_SETTINGS,
        },
        helpers: {
            getProfileFromUrl,
            getCurrentProfile,
            getProfileDefaults,
            pickLegacySettings,
            persistProfileSetting,
        },
        TTSReader,
    };
})();
```

> SECTION 02 is the **state initializer block** of the `TTSReader = { ... }` object literal — properties like `speechSynthesis: window.speechSynthesis,`, `ttsActive: false,`, the `CONFIG: { ... }` sub-object, etc. It ends right before the first method (which is `init() {` in SECTION 03). Cut everything between line 186 (the line *after* `const TTSReader = {`) and the line *before* the SECTION 03 banner. Paste inside the new `const TTSReader = { ... }` literal as-is.

**`99-bootstrap.js` (last module):**

SECTION 22 in source is bootstrap functions OUTSIDE `TTSReader` (top-level inside the IIFE). They reference `TTSReader` directly.

Template:
```js
(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }
    const TTSReader = ns.TTSReader;
    const { /* any helpers/constants used by bootstrap functions */ } = ns.helpers;

    // === paste SECTION 22 functions EXACTLY (top-level functions, not methods) ===
    function getPlaybackState() { /* paste */ }
    // ... etc

    // === final init call (was at very bottom of original IIFE) ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TTSReader.init());
    } else {
        TTSReader.init();
    }
})();
```

> Confirm exact bootstrap entry point by reading source lines 7132..end. The last few statements of the original IIFE are the readiness gate + `TTSReader.init()`. Mirror them verbatim. If they wire to `chrome.runtime.onMessage`, copy that too.

### B.4 Update `manifest.json`

Replace `content_scripts[0].js` value `["content.js"]` with the ordered module list.

DO via `Edit` tool:
- `old_string`: `"js": ["content.js"],`
- `new_string`:
```json
      "js": [
        "modules/00-namespace.js",
        "modules/10-lifecycle.js",
        "modules/15-playback-lock.js",
        "modules/20-smart-copy.js",
        "modules/25-prompt-send.js",
        "modules/30-media-boost.js",
        "modules/35-server-tts.js",
        "modules/40-voice.js",
        "modules/45-paragraph.js",
        "modules/50-text.js",
        "modules/55-selection.js",
        "modules/60-highlight.js",
        "modules/65-prewrap.js",
        "modules/70-auto-read.js",
        "modules/75-queue.js",
        "modules/80-flow.js",
        "modules/85-events.js",
        "modules/87-ui.js",
        "modules/90-scroll.js",
        "modules/92-notify.js",
        "modules/99-bootstrap.js"
      ],
```

Verify JSON parse:
```bash
node -e "JSON.parse(require('fs').readFileSync('edge-extension/manifest.json','utf8')); console.log('ok')"
# EXPECT: ok
```

### B.5 Delete original `content.js`

Only after all 21 modules exist + `node --check` passes for each + manifest updated:

```bash
git rm edge-extension/content.js
```

### B.6 Smoke test (MANDATORY before any commit)

> **WARNING:** This is a real refactor. Do NOT commit without smoke test. If you cannot smoke-test in this environment, STOP and ask the user to run it.

Manual steps:
1. Load unpacked extension from `edge-extension/` in Edge → `edge://extensions/` → Developer mode → Load unpacked.
2. Open `https://chatgpt.com/`.
3. Confirm overlay renders (settings gear, play button visible).
4. Click play on a chat message. Confirm TTS speaks. Confirm word highlighting tracks.
5. Toggle auto-read on. Send a new message. Confirm new reply auto-reads without text clipping.
6. Open DevTools Console. Look for any `[TTSReader]` errors or "is not a function" / "Cannot read properties of undefined" errors. Any error → STOP, do not commit, debug.

### B.7 Commit (split as one logical change)

```bash
git add edge-extension/modules/
git rm edge-extension/content.js  # if not already staged via B.5
git add edge-extension/manifest.json
git diff --cached --stat
# EXPECT: 22 new files under modules/, content.js deleted, manifest.json modified.

git commit -m "refactor(extension): split content.js into 21 modules" -m "Behaviour-preserving split of edge-extension/content.js (7381 lines) into modules/ loaded via manifest content_scripts array. Shared namespace pattern: 00-namespace.js creates window.__TTSNS = { constants, helpers, TTSReader }; subsequent modules Object.assign methods onto the shared TTSReader so this-binding is preserved with zero callsite edits. 99-bootstrap.js calls init(). manifest.json content_scripts[0].js lists modules in load order. Module breakdown documented in refactor_plan.md section B.1. Smoke-tested on chatgpt.com: overlay, play, highlight, auto-read all functional. Tampermonkey userscript untouched (single-file constraint)."
```

---

## 5. Phase C — Final Push

```bash
git fetch origin
git pull --rebase origin enhance-tts-functionality
# Conflicts → STOP, ask user.

git status --short
# EXPECT: clean

git log --oneline -5
# EXPECT: split commit on top, then Phase A commit (if it was needed).

git push origin enhance-tts-functionality
# EXPECT: success

git log @{u}..
# EXPECT: empty
```

✅ **Phase C complete.**

---

## 6. Verification Checklist (run before declaring done)

- [ ] `git status` clean.
- [ ] `git log @{u}..` empty.
- [ ] `edge-extension/content.js` no longer exists (`ls edge-extension/content.js` → not found).
- [ ] `edge-extension/modules/` contains 21 `.js` files.
- [ ] `node --check` exits 0 for each module:
      ```bash
      for f in edge-extension/modules/*.js; do node --check "$f" || echo "FAIL: $f"; done
      ```
- [ ] `manifest.json` `content_scripts[0].js` array length = 21, in correct order.
- [ ] `node -e "JSON.parse(require('fs').readFileSync('edge-extension/manifest.json','utf8'))"` exits 0.
- [ ] No `this`-binding bugs (smoke-tested: TTS plays, highlights track, auto-read works).
- [ ] No `Cannot read properties of undefined` or `is not a function` in DevTools Console during smoke test.
- [ ] No commits skip hooks (`git log --format='%h %s' | grep -i no-verify` empty).
- [ ] Tampermonkey userscript file unchanged this phase (`git diff main..HEAD -- "Tampermonkey_scripts/"` shows only Phase A changes if any).

---

## 7. Rollback

**Module write broke `node --check`:**
```bash
rm edge-extension/modules/<broken>.js
# Redo B.2 for that module.
```

**Smoke test fails after all modules written:**
- Most likely: missed a constant/helper destructure, or load-order bug. Check DevTools Console for the specific identifier.
- Fix forward by editing the offending module's destructure line. Re-smoke-test.
- If unfixable: revert local-only state.
  ```bash
  git status --short
  # If split commit not yet made:
  rm -rf edge-extension/modules
  git restore edge-extension/manifest.json
  git restore edge-extension/content.js  # restores original from HEAD
  ```

**Already pushed Phase C and need to undo:**
- DO NOT `push --force`. STOP. Tell user. User decides revert vs. fix-forward.

**`git pull --rebase` conflicts:**
- STOP. Do not auto-resolve. Ask user.

---

## 8. Anti-patterns

- ❌ Renaming methods or variables.
- ❌ Reformatting unrelated code (no Prettier sweep, no quote-style change, no semicolon clean-up).
- ❌ Combining methods across sections "for cohesion" — keep cuts at section banner boundaries.
- ❌ Touching method bodies. Extraction is paste-only.
- ❌ Splitting `TTSReader` state across multiple modules. State init is ONLY in `00-namespace.js`.
- ❌ Promoting `TTSReader` methods to top-level functions (would break `this`).
- ❌ Bumping `manifest.json` version for the split. Version is part of release flow, not refactor.
- ❌ Touching `background.js`, `popup.js`, `options.js`, CSS, HTML.
- ❌ Touching the Tampermonkey userscript.
- ❌ `git add -A`, `git commit -am`, `git push -f`, `git reset --hard`, `git rebase -i`, `--no-verify`.
- ❌ Skipping the smoke test. The whole point of this refactor is risk; smoke test is the only safety net.
- ❌ Using `Bash` tool for grep/read. Use `Grep`/`Read` tools.

---

## 9. Why this approach (informational)

`TTSReader` mega-object is one mutable target. Splitting via `Object.assign` onto a shared namespace preserves `this`-binding without any callsite rewrites — the cheapest possible split. Manifest content_scripts array gives deterministic load order with no build step. All modules run in the same isolated world per Chrome MV3 spec, so `window.__TTSNS` is shared.

Tampermonkey is locked single-file by Tampermonkey itself (`@require` exists but cross-host CDN dependency is worse than one big file). Banner pass already done from prior session; userscript stays as-is.

If a future refactor wants real ES modules: requires Manifest V3 `module` content scripts (still flagged behind `world: "ISOLATED"` quirks) OR a build step. Either is a separate project and needs a test harness first.

---

_End of plan. Hand-off to next agent._
