# Q and A

## 2026-06-11T22:50:38+05:30

Status: Working.

Current assumptions:
- Implement `skip x` for automatic reading as character skip, not phoneme skip. Browser SpeechSynthesis and current server TTS path do not expose phoneme boundaries; character offsets already exist.
- Keep existing click/selection skip setting separate. New skip setting applies only when auto-read starts a new ChatGPT assistant message.
- Add separate left/right arrow jump option distinct from click/auto-read skip.
- Make existing shortcut keys editable in settings, including empty values to disable a shortcut.

Questions needing user answer:
- None blocking. If you want phoneme-level skipping later, we need a TTS backend that returns phoneme timing/boundaries.

Next:
- Update roadmap/plan docs.
- Implement Edge extension first.
- Port same behavior to Tampermonkey userscript.
- Verify, then commit/push in small logical commits.

## user comments
1. apparalty this is beeter options for ?!
    skip grapheme / word / sentence x words!
2.per-site adapters
    a. heurestic any site usage model
3. other ideas to implemnt , options for:
    - Read newest answer
    - Read current visible answer
    - Read selected text
    - Read from clicked paragraph
    - Loop current ChatGPT message
    - Read all assistant messages
    - Read only unread/new assistant messages

4. i am going away. beep me mulitple times if you need me.

## 2026-06-11T23:12:00+05:30 agent response

Status: Edge implementation updated.

Decisions:
- Auto-read skip now supports unit choices: character, grapheme, word, sentence.
- Phoneme remains out of scope until a TTS backend exposes phoneme boundaries.
- Per-site adapters and expanded read modes are good follow-up items. I am recording them in roadmap/plan but keeping current implementation focused so Edge/Tampermonkey parity can ship.

No blocking questions.

## 2026-06-18T16:40:22+05:30 agent response

Status: Investigating TTS tracking/highlighting instability on partial-loading pages.

Current assumptions:
- Root issue likely involves highlights/scrolling tied too directly to live DOM positions while ChatGPT-style pages stream, virtualize, or partially load content.
- Fix should preserve Edge-first implementation order, then port to Tampermonkey userscript.
- Prior-art/patent search will be public-safe and generic; no repo code or private logs will be sent.

Questions needing user answer:
- None blocking.

Next:
- Run patent/prior-art search.
- Trace current highlight and scroll code paths.
- Add regression coverage before implementation.



## user comments
1. modularize script files. dont write mahabaratha in one file!!!
2. retarded bastard!! what did you implement?! it is not working!! asshole. 
3. chatgpt page only shows the part of page which is in view....the parts above and below are not present even in the html i think....may be you call taht as view port! idk i you have implemented or those sort o fpages as well!?




## 2026-06-11T23:28:24+05:30 agent response

Status: Implemented, verified, committed, and pushed to `enhance-tts-functionality`.

Shipped:
- Edge extension first, then Tampermonkey userscript parity.
- Auto-read start skip supports character, grapheme, word, and sentence units.
- Auto-read can loop only the current ChatGPT assistant message.
- Left/right arrow navigation has its own segment jump setting.
- Existing reader shortcuts are editable; empty disables a shortcut.
- Userscript version bumped to `3.12` and raw update URLs point at this branch.

Verification passed:
- `node test_auto_read_navigation_controls.js`
- `node --check` on touched Edge modules/options and the Tampermonkey userscript.
- `git diff --check` on task-touched files.

No blocking questions.

## 2026-06-12T04:54:55+05:30 agent response

Status: Focused regression tests and implementation are green locally.

Shipped in working tree:
- New `applyStartSkipToNavigationStarts` setting defaults off.
- Arrow-key/popup navigation and double-click seek can apply the configured auto-read skip unit when enabled.
- Off-screen connected paragraphs no longer disable word highlighting.
- Tampermonkey userscript parity is implemented and version bumped to `3.13`.

Verification passed before commit:
- `node test_auto_read_navigation_controls.js`
- `node test_userscript_navigation_skip_parity.js`
- `node --check` on touched Edge JS and userscript files
- `git diff --check` scoped to task-owned paths

No blocking questions.

## 2026-06-12T05:02:00+05:30 agent response

Status: Committed and pushed to `enhance-tts-functionality`.

Commits:
- `48b716e` Add navigation start skip for Edge TTS
- `fc83295` Port navigation start skip to userscript
- `3df3f3a` Fix server word highlight scroll ordering

Notes:
- Userscript version is now `3.14` because the post-push server-highlight ordering fix changed the raw userscript again.

Verification after final rebase:
- `node test_auto_read_navigation_controls.js`
- `node test_userscript_navigation_skip_parity.js`
- `node --check` on touched Edge JS and userscript files
- `git diff --check`

No blocking questions.

## 2026-06-18T16:56:05+05:30 agent response

Status: TTS tracking/highlighting fix implemented and verified locally.

Shipped in working tree:
- Edge extension first, then Tampermonkey userscript parity.
- Word highlighting now uses the browser CSS Custom Highlight API when available, so modern Edge/Chrome can highlight text ranges without injecting word spans into streaming page DOM.
- Span fallback remains for older browsers.
- Detached word spans/ranges and detached scroll targets are ignored instead of being tracked after partial page reloads or virtualized DOM replacement.
- Auto-scroll now uses nearest alignment instead of repeated center jumps.
- Userscript version bumped to `3.15`.

Prior art:
- Ran `PATENT_FAST=1 patent-workflow` with a public-safe generic query. No close GitHub/HN matches found; npm source failed, so this is evidence only, not proof of absence.
- Checked browser platform APIs and used built-in CSS Custom Highlight / Range behavior instead of adding a custom overlay engine.

Verification passed:
- `node test_auto_read_navigation_controls.js`
- `node test_userscript_navigation_skip_parity.js`
- `node test_voicelink_integration.js`
- `node --check` on touched Edge JS, userscript, and tests
- `git diff --check`

No blocking questions.
