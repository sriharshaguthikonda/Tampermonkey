---

## Handoff: 2026-05-05T06:54:25Z (auto-saved before compaction)

### Compaction Metadata
- Trigger: (unknown)
- Custom instructions: (none)
- Transcript: (unknown)
- CWD: (unknown)

### Last User Message (transcript tail)
(unavailable - transcript missing)

### Last Assistant Message (transcript tail)
(unavailable - transcript missing)

### Git Snapshot
- Branch: enhance-tts-functionality
- Status:
 M "Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js"
 M edge-extension/content.js
 M edge-extension/manifest.json
?? .memory_link
?? docs/
- Recent commits:
e487259 Add configurable skip words for TTS start
a923b82 Prioritize extension changes before Tampermonkey scripts
952ba63 Add configurable skip words offset for click-start reading
0cc3bab fix(bg): guard getSettings sendResponse against closed port
215d332 fix(tts): sanitize HTML on paragraph revert to block XSS

### Model Summary
(TODO: fill after compaction — 8–12 bullets)

### Handoff Context (paste into next session)
(TODO: fill after compaction — 10–20 lines of concrete resume instructions)

---
---

## Handoff: 2026-05-05T23:32:54Z (auto-saved before compaction)

### Compaction Metadata
- Trigger: (unknown)
- Custom instructions: (none)
- Transcript: (unknown)
- CWD: (unknown)

### Last User Message (transcript tail)
(unavailable - transcript missing)

### Last Assistant Message (transcript tail)
(unavailable - transcript missing)

### Git Snapshot
- Branch: enhance-tts-functionality
- Status:
?? refactor_plan.md
- Recent commits:
2b04393 refactor: add table of contents headers to both TTS readers
5585623 refactor(userscript): add section banners for navigability
9ad8b0e refactor(content.js): add section banners for navigability
b7c74a1 auto read new messages fix
e487259 Add configurable skip words for TTS start

### Model Summary
(TODO: fill after compaction — 8–12 bullets)

### Handoff Context (paste into next session)
(TODO: fill after compaction — 10–20 lines of concrete resume instructions)

---
---

## Handoff: 2026-05-05T23:36:08Z (auto-saved before compaction)

### Compaction Metadata
- Trigger: (unknown)
- Custom instructions: (none)
- Transcript: (unknown)
- CWD: (unknown)

### Last User Message (transcript tail)
(unavailable - transcript missing)

### Last Assistant Message (transcript tail)
(unavailable - transcript missing)

### Git Snapshot
- Branch: enhance-tts-functionality
- Status:
 M docs/handoff/HANDOFF.md
?? refactor_plan.md
- Recent commits:
2b04393 refactor: add table of contents headers to both TTS readers
5585623 refactor(userscript): add section banners for navigability
9ad8b0e refactor(content.js): add section banners for navigability
b7c74a1 auto read new messages fix
e487259 Add configurable skip words for TTS start

### Model Summary
(TODO: fill after compaction — 8–12 bullets)

### Handoff Context (paste into next session)
(TODO: fill after compaction — 10–20 lines of concrete resume instructions)

---
---

## Handoff: 2026-05-06T00:48:15Z (auto-saved before compaction)

### Compaction Metadata
- Trigger: (unknown)
- Custom instructions: (none)
- Transcript: (unknown)
- CWD: (unknown)

### Last User Message (transcript tail)
(unavailable - transcript missing)

### Last Assistant Message (transcript tail)
(unavailable - transcript missing)

### Git Snapshot
- Branch: enhance-tts-functionality
- Status:
 M docs/handoff/HANDOFF.md
?? edge-extension/profile.js
?? refactor_plan.md
- Recent commits:
07da3e0 refactor(extension): split content.js into 21 modules
2b04393 refactor: add table of contents headers to both TTS readers
5585623 refactor(userscript): add section banners for navigability
9ad8b0e refactor(content.js): add section banners for navigability
b7c74a1 auto read new messages fix

### Model Summary
(TODO: fill after compaction — 8–12 bullets)

### Handoff Context (paste into next session)
(TODO: fill after compaction — 10–20 lines of concrete resume instructions)

---

## Handoff: 2026-07-03T02:22:14+05:30 — ChatGPT-won't-load P0 fix, orchestrated via Codex

### Current task state
- **P0 root cause CONFIRMED** (from user's `console.log` at repo root): ~8 `MutationObserver(document.body, {subtree:true})` across `edge-extension/modules/` 15/20/25/45/70 saturate the main thread on chatgpt.com's updated (virtualizing) front end. Worst: `20-smart-copy-part1.js:18` (updateCopyButtons per mutation + self-retriggering DOM writes) and `25-prompt-send-part2.js:60` (cloneNode+innerText per node). Aggravator: `05-diagnostics.js:36` `pageSnapshot()` reads `document.body.innerText` per log call (forced reflow), debug default ON.
- Plan approved: `C:\Users\deletable\.claude\plans\chatgpt-site-fails-to-quizzical-robin.md`. Branch: `enhance-tts-functionality`.
- **Codex wave A RUNNING in background**: shell task `bcpbiukqs`, log `$SCRATCH/codex-waveA.log`, final msg `$SCRATCH/codex-waveA-last.md`. Implements commits 1-5 (innerText fix #13; observer bus `modules/08-observer-bus.js` + manifest registration; migrate smart-copy/prompt-history/paragraph/auto-read/playback-lock observers #12). Instructed: local commits only, NO push, gates = `node --check` + 3 node tests.
- Claude task list: #2 in_progress (wave A), #3 wave B staged (prompt ready `$SCRATCH/codex-waveB-prompt.md`: debugLogging checkbox #14 + diagnostics v2 ring buffer/export #15), #4 wave C hardening #16 (prompt NOT yet written), #5 wave D build split #17 (prompt NOT yet written), #6 review/push/docs.
- SCRATCH = `C:/Users/DELETA~1/AppData/Local/Temp/claude/C--Windows-software-Tampermonkey/c326a902-0329-469b-85e1-c1350b5ee1b6/scratchpad`

### Key decisions
- Two builds + runtime toggle (user-approved): `node build.js` → `dist/dev` (name " (DEV)", `modules/01-build-info.js` with `ns.BUILD={channel:'dev'}`, debug default ON) + `dist/prod` (debug default OFF). Source `edge-extension/` stays loadable.
- New `debugLogging` setting (NOT reusing `showDiagnostics` — that stays for overlay panel); localStorage `chatgptTtsDebug` becomes explicit override only; gate default false unless dev channel.
- Codex CLI (`codex exec --full-auto`, v0.142.5) implements; Claude orchestrates/reviews/pushes. User pre-authorized pushing small logical commits (Q and A.md).
- Q and A.md is THE user channel ("talk to me in this file"); PushNotification ("beep", ~2x) when input needed/done. User is away.

### GitHub issues (sriharshaguthikonda/Tampermonkey)
- Filed this session: #12 P0 observer saturation, #13 innerText reflow, #14 debugLogging checkbox, #15 diagnostics v2 + export, #16 hardening guards, #17 dev/prod build split, #18 userscript parity, #19 paste-anywhere regression, #20 multi-site adapter roadmap.
- Ophel intel commented on #12/#20: upstream `urzeye/ophel` (user fork exists), 17 site adapters `src/adapters/*.ts`, base adapter exposes NARROW observer target (base.ts:862); chatgpt.ts:130 documents ChatGPT virtualization placeholders `[data-turn-id-container]`.
- Stale-issue audit verdicts (evidence-checked, action pending):
  - #5 FIXED (00-namespace.js:233, 35-server-tts.js:64-151) → close w/ evidence comment.
  - #8 FIXED (75-queue.js:116-124 stale-utterance guard) → close.
  - #9 FIXED (60-highlight.js:100-116 per-span replaceChild; no innerHTML-assign call sites) → close.
  - #6 UNCLEAR/mitigated (cache keys namespaced by playbackSessionId, 70-auto-read.js:1362; literal guard missing ~1533) → comment/downgrade.
  - #7 STILL-PRESENT (65-prewrap.js:203-233 unbounded pendingReverts) → keep.
  - #10 STILL-PRESENT (70-auto-read.js:1698-1708, 1754-1776 silent skips) → keep.
  - #11 STILL-PRESENT (background.js:215,221,358 early slot release) → keep.
  - #5-#10 bodies cite dead `content.js` lines (code moved to modules/) — say so in comments.

### Modified files (this session)
- `Q and A.md` — appended 02:35 agent response (root cause, issue links, answers to user's 7 comments). Commit with final docs commit.
- `docs/handoff/HANDOFF.md` — this section.
- Codex wave A editing `edge-extension/modules/*` + `manifest.json` (its own commits).

### Blockers / open questions
- None blocking. User away; beep when fix ready to test (reload extension → open chatgpt.com) or decision needed.

### Next steps (in order)
1. On wave A completion: `cat "$SCRATCH/codex-waveA-last.md"`; `rtk git log --oneline -8`; `rtk git diff HEAD~5 --stat`; spot-review bus + migrations; rerun 3 tests + `node --check` on touched files.
2. Launch wave B (background): `codex exec --full-auto --output-last-message "$SCRATCH/codex-waveB-last.md" "$(cat "$SCRATCH/codex-waveB-prompt.md")" > "$SCRATCH/codex-waveB.log" 2>&1`
3. Author wave C prompt (hardening #16: per-module init try/catch via 99-bootstrap, 65-prewrap.js:73 isConnected guard, Intl.Segmenter try/catch 70-auto-read.js:114,133, CSS Highlight call-site audit; single commit `fix(hardening): guards — prewrap innerHTML, Intl.Segmenter, per-module init try/catch (#16)`), then wave D prompt (build split #17 per Key decisions; single commit `feat(build): build.js → dist/dev + dist/prod, build-info module, README (#17)`); run sequentially.
4. Issue hygiene: close #5/#8/#9 with evidence comments; comment #6.
5. Final: review full diff, run tests, push `rtk git push origin enhance-tts-functionality`, docs commit (Q and A.md + handoff), update Q and A.md status + ask user to test, PushNotification, save memory rows (observer-saturation bug→fix lesson; project state), mark tasks completed.
6. Later (tracked, not now): #19 paste fix (needs live selectors via claude-in-chrome), #7/#10/#11, #18 parity, #20 adapters.

### Critical context
- Tests (repo root): `node test_auto_read_navigation_controls.js`, `node test_userscript_navigation_skip_parity.js`, `node test_voicelink_integration.js`.
- RTK prefix for git/gh. Git Bash, forward slashes. Caveman chat mode; code/commits/issues normal prose.
- gh authed as sriharshaguthikonda; origin = https://github.com/sriharshaguthikonda/Tampermonkey.git.
- Do NOT read codex .log or subagent .output transcripts fully (context blowout); read `*-last.md`.
- `console.log` at repo root = P0 evidence, don't modify. `.serena/` untracked — leave. Forbidden for codex: Q and A.md, console.log, .serena/, Tampermonkey_scripts/.
- If codex misbehaved: `rtk git status`; `rtk git log origin/enhance-tts-functionality..HEAD --oneline`; fix forward or `git reset --soft` and re-slice.

### Model summary
- ChatGPT's update + extension's 8 body-wide MutationObservers = main-thread saturation; page never loads. Evidence-confirmed via user console log, not hypothesis.
- Fix = single debounced, self-mutation-filtered observer bus with cheap mark-dirty callbacks; narrow-target (Ophel-style) upgrade is the follow-on.
- Old diagnostics were useless for this failure class: console-only, nothing persisted, and themselves a perf hazard (innerText reflow per log, default ON).
- Diagnostics v2 = ring buffer + error/CSP/longtask capture + JSON export; longtask capture catches this bug class directly.
- debugLogging checkbox gates all output; prod silent by default, dev verbose; localStorage only as manual override.
- Build split: one source, dependency-free build.js, two load-unpacked dists.
- Engineering flow live: 9 new issues, stale audit done (3 closable, 3 confirmed-open, 1 downgrade), small logical commits, codex implements, Claude reviews/pushes.
- User priorities: minimal token burn (delegate), Q and A.md channel, beep when needed, Ophel borrowing + multi-site vision later.

### Handoff context (resume here)
1. `cd C:/Windows_software/Tampermonkey` (branch enhance-tts-functionality).
2. `SCRATCH="C:/Users/DELETA~1/AppData/Local/Temp/claude/C--Windows-software-Tampermonkey/c326a902-0329-469b-85e1-c1350b5ee1b6/scratchpad"`
3. `cat "$SCRATCH/codex-waveA-last.md" 2>/dev/null || tail -30 "$SCRATCH/codex-waveA.log"` — wave A status.
4. `rtk git log --oneline -10 && rtk git status` — verify commits 1-5 exist, reference #12/#13, tree clean.
5. Run the 3 node tests; if red, fix before proceeding.
6. Launch wave B per Next steps 2; author+run waves C, D.
7. Close #5/#8/#9, comment #6 (evidence in this handoff).
8. Push after full review; update Q and A.md; PushNotification user; save memory; complete task list #2-#6.

### DELTA 2026-07-03T02:5x+05:30 (post wave A+B)
- Wave A DONE + verified (5 commits: 9f40f0c #13 innerText fix; 1b99da5 bus module; 3cc5819 smart-copy; 43445d4 prompt-history; 2bc0232 paragraph/auto-read/playback-lock). Only remaining MutationObservers: bus itself + allowed 5s attribute observer (25-prompt-send-part2.js:212). Tests rerun by orchestrator: 3/3 PASS.
- Wave B DONE + verified (72cdd19 debugLogging checkbox #14; ca796db ring buffer + CSP/longtask capture + JSON export #15). Tests 3/3 PASS. Branch ahead 7.
- Issue hygiene DONE: #5/#8/#9 closed w/ evidence, #6 downgraded w/ comment.
- **Wave C+D RUNNING**: background shell task `b79uj3rh7`, prompt `$SCRATCH/codex-waveCD-prompt.md`, results `$SCRATCH/codex-waveCD-last.md` + `.log`. Delivers commit `fix(hardening): ... (#16)` then `feat(build): build.js → dist/dev + dist/prod ... (#17)`.
- REMAINING after C+D: verify (last-msg + git log + 3 tests + run `node build.js` + check dist manifests), review full diff `rtk git diff origin/enhance-tts-functionality..HEAD --stat`, push, final docs commit (Q and A.md + this handoff, message `docs: Q and A + handoff for ChatGPT load fix session`), update Q and A.md status (ask user: reload dist/dev, open chatgpt.com, export diagnostics if still broken), PushNotification ~2x, save memory rows (bug→fix lesson: body-wide MutationObserver saturation on virtualizing SPAs → single debounced filtered bus; longtask capture for future), mark tasks #4/#5/#6 complete.
