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





## 2026-07-02 agent update

## user comments
1. add commit push small logical commits
1b. use subagents with appropriate intelligence you are buring tokens!!!!!
2. other issues - being able to paste anywhere and it populates the prompt text box are not working.
3. i think some of the issues are already solved, they are just floating in github.
4. there is this other extension called ophel on github....i have a fork as well... think we can borrow impelementations to solve this not loaing issue!
5. on the vision side....we can take ideas / implementations from them and expand our scope to other ai chat websites as well!
6. talk to me in this file 
7. beep me multiple times if you need me i'm going away

## 2026-07-03T02:35+05:30 agent response — root cause found, work started

Status: Root cause of chatgpt.com-won't-load identified from your `console.log` file (it WAS useful). Plan approved earlier in chat; Codex implementing now, Claude orchestrating. Will beep when I need you and when done.

Root cause:
- Extension registers ~8 `MutationObserver`s on `document.body` (subtree). ChatGPT's updated front end mutates the DOM heavily during load; our observer callbacks (smart-copy button injection `20-smart-copy-part1.js:18`, prompt-history extraction `25-prompt-send-part2.js:60`) each take 150–830 ms per mutation batch and re-trigger each other (copy-button DOM writes → more mutations → feedback loop). Main thread saturates → page never finishes loading.
- Aggravator: diagnostics `pageSnapshot()` reads `document.body.innerText` (forced full-page reflow) on EVERY log call, and debug logging defaults ON for everyone.

Fix in flight (issues filed): #12 P0 observer-bus fix, #13 innerText reflow, #14 debugLogging checkbox, #15 diagnostics v2 + Export-JSON button, #16 hardening guards, #17 dev/prod build split (`node build.js` → dist/dev + dist/prod), #18 userscript parity follow-up.

Answers to your new comments:
1b (token burn): agreed — Codex CLI does implementation, cheap subagents for mechanical work, me for orchestration/review only.
2 (paste-anywhere broken): filing as new issue; likely same ChatGPT-update fallout (stale prompt-box selectors in `findPromptArea`). Will fix after P0 lands.
3 (already-solved issues floating): will audit #5–#11 against current code and close the solved ones with evidence.
4 (Ophel): saw `[Ophel] Loaded ChatGPT adapter` in your console log — it coexists on the page. Will review your fork's ChatGPT adapter for observer/adapter patterns worth borrowing; our observer-bus fix is compatible with that direction.
5 (multi-site vision): filing a roadmap issue for per-site adapter architecture (Ophel-style) covering other AI chat sites.
6+7: yes — updates land in this file; I'll beep you when input is needed and when the fix is ready to test.

Questions needing user answer:
- None blocking right now. When the fix is ready you'll need to reload the extension and open chatgpt.com once to confirm (I'll beep).



## user comments
1. use subagents with appropriate intelligence you are buring tokens!!!!!
2. ophel folder is there as well in local folder chrome extensions as well
3. downloaded a copy of current chatgpt html in the tampermokey folder as well. you can compare to previours versions. if it helps

## 2026-07-03T03:05+05:30 agent response — FIX SHIPPED, please test

Status: All work implemented, verified locally, committed, and pushed to `enhance-tts-functionality` (9 commits). Codex did the implementation; Claude reviewed each wave and reran all gates independently (3 node tests + syntax checks + build verification: all green).

What changed:
1. **P0 fix (#12, #13)**: all ~8 `document.body` MutationObservers replaced by ONE shared observer bus (`edge-extension/modules/08-observer-bus.js`) — debounced (200ms, 1s max wait), idle-scheduled, ignores the extension's own injected nodes (kills the feedback loop). Smart-copy, prompt-history, paragraph, auto-read, playback-lock migrated. Prompt-history no longer does cloneNode+innerText per mutation (lazy extraction on hotkey). Diagnostics no longer force a full-page reflow per log line.
2. **Debug logging checkbox (#14)**: Options + popup have "Debug logging". OFF = extension console-silent (default). ON = verbose. `localStorage.chatgptTtsDebug` stays as manual override only.
3. **Diagnostics v2 (#15)**: ring buffer captures errors, promise rejections, CSP violations, and long main-thread tasks (the exact signal that would have caught this bug); persisted to extension storage; **"Export diagnostics JSON" button** in Options (and popup) — send me that file next time instead of copy-pasting console.
4. **Hardening (#16)**: every module init wrapped (one broken feature can't kill the rest or the page); detached-node + Intl.Segmenter guards.
5. **Dev/Prod builds (#17)**: `node build.js` from repo root → `dist/dev` (name shows "(DEV)", verbose by default) + `dist/prod` (lean, silent). Load either once via edge://extensions → Load unpacked; after rebuilds just click Reload. Your current source-folder load keeps working (prod-like defaults).

HOW TO TEST (2 minutes):
1. edge://extensions → Reload the extension (or Load unpacked → `dist/dev` for the verbose build).
2. Open chatgpt.com. Expect: site loads normally with extension enabled.
3. Quick TTS smoke: auto-read a new answer, word highlight, arrow navigation.
4. If ANYTHING still broken: Options → Export diagnostics JSON → drop the file path here.

Issue hygiene: #5, #8, #9 closed as already-fixed (evidence in comments); #6 downgraded (mitigated by session-namespaced cache keys). Real + open: #7, #10, #11. From your comments: #19 paste-anywhere regression, #20 multi-site adapters (Ophel architecture surveyed + commented).

Your new comments, acked:
2 (local Ophel folder): noted — will use local copy for deeper borrowing when building #20 adapters.
3 (downloaded chatgpt HTML in repo): very helpful — using it right now to re-derive current prompt-box selectors for the #19 paste fix (next codex task).

Questions needing user answer:
- Just the TEST above. Beeping you now.