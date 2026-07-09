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

### FINAL 2026-07-03T03:45+05:30 — SESSION COMPLETE, ALL SHIPPED & VERIFIED
- Waves C+D landed (9a690e2 hardening #16; e0fe520 build split #17 — codex hit .git lock, I committed). Wave E paste fix (#19) landed: 21f71e4 (selectors from user's saved chatgpt HTML `_[Extended]-_[gpt-5-5-thinking].html`; ProseMirror chain + InputEvent insertion). Docs commits cfc3624 + cedc1d7. **12 commits total pushed** (9f40f0c..cedc1d7), branch in sync with origin.
- **USER VERIFIED**: loaded dev build, "working properly". Fresh console.log: 0 extension-attributed violations (was hundreds); diagnostics v2 capturing page CSP/rejections; TTS playing.
- Issues: #12–#17 CLOSED (verified), #5/#8/#9 CLOSED (stale-fixed), #6 downgraded. OPEN: #19 (awaiting user paste test), #7, #10, #11, #18 (userscript parity), #20 (Ophel adapters — user also has LOCAL ophel folder in chrome extensions dir for borrowing).
- Memory saved: mem_20260702_2026-07-03-tampermonkey_0c7079 (root cause + observer-bus fix pattern + Ophel narrow-target lesson).
- All 7 Claude tasks completed. NEXT SESSION candidates: user's #19 paste-test result from Q and A.md, then #7/#10/#11 fixes, #18 parity port, #20 adapter architecture.

---

## 2026-07-10 05:20 IST — Churn-resistant selector framework: PLANNING COMPLETE + 2 review rounds settled

### Current task state
- PLANNING ONLY session (user instruction: no implementation). Deliverables committed on `enhance-tts-functionality`, NOT pushed: `8158929` (plan v1), `6240e1d` (Q&A answers folded), `9843120` (rebuttal + prior-art fixes), `bb27d9b` (round-2 resolutions).
- Plan docs: `docs/plans/churn-resistant-framework/` — 00-DESIGN.md (D1–D11 + D4b/D8b), 01-ROADMAP.md (P0–P6, M1–M4), TESTING.md, AGENT-RULES.md, PRIOR-ART.md, RECON-codex-2026-07-10.md (codex recon, file:line seams), phases/PHASE-0..6, RESPONSE-to-first-critique.md (rebuttal + round-2 answers), first_critique_by_chatgpt.txt (input).
- ChatGPT review round 1 (critique) + round 2 (4 contested Q&As via bridge) both complete. No open disputes. **Plan v2 rewrite NOT yet done.**

### Key decisions (settled)
- Selectors = remote data-only JSON packs (uBlock model); resolver lib starts as LOCAL `packages/anchor-core/` in this repo; extract to separate repo only after Tampermonkey + ophel both consume it (D1 timing amended by critique).
- Anchor risk classes (read/navigate/input/action/destructive). Action anchors: remote may update EXACT-match strategies only (attr-equals, role+name equals/oneOf); code owns invariants + positive intent checks (`composer.submit()` only, never generic click) + state-aware preflight + local approval for action-anchor pack changes. Signing deferred to hardening.
- Names = locale-scoped pack data (byLocale/verifiedLocales/fail-closed on unknown locale); NO positional strategies for action anchors — form semantics instead (`button.form === input.form`, `type=submit`).
- v1 lib scope CUT: no observer/SPA-nav/node-cache/runtime-heuristics/event-utils; consumers keep own lifecycle (observer bus here; DOMToolkit in ophel). Option-A handles (fresh element per call; cache winning strategy index only). `dom-accessibility-api` for accname (semantic-locators has accname dep — verified npm). Typed pack parser w/ unknown-field rejection.
- Testing: identity oracles + adversarial fixtures = precision gates (100% precision on action anchors). Raw DOM captures are SECRETS (`__reactRouterContext` holds access tokens): git-ignored raw → allowlist projector → sanitized committed fixtures; packs repo ≠ corpus repo.
- Canary = passive extension self-test: state-class triggered probes, `unobserved_applicable_state` ≠ healthy, 4–8ms cancellable idle slices, local-only history; optional failure-only opt-in crowd signal later.
- Data layer = go/no-go spike PARALLEL to pack phases; per-consumer verdicts (export first; TTS stays on rendered DOM); raw-vs-rendered conformance protocol w/ zero-hidden-turn-leak hard gate; layered bootstrap capture (document_start MAIN-world fetch wrap + allowlisted loader-global projector + DOM reconstruction; BootstrapCoverage taxonomy).
- Revised roadmap shape A–G (RESPONSE doc §4) supersedes P0–P6 file layout pending v2. P0A = emergency #19 hotfix; P0B = descriptor pilot (composer anchors only).
- Consumers: this repo, ophel fork (sriharshaguthikonda/ophel @ C:/Windows_software/Chrome_extensions/ophel, v1.1.3), Prompt-queue, all future extensions (memory rule). Ophel upstream PR order: selector-config extraction FIRST, generic seam later.

### Modified files
- NEW: `docs/plans/churn-resistant-framework/*` (all), `Q and A archive.md`.
- UPDATED: `Q and A.md` (archived + 4 agent responses + inline user answers).
- Committed inputs: `docs/Research/website_churn_selectors.md` (UTF-16), `docs/Research/self_healign_selector_drop_in _chatgpt_research.txt` (66.7K ChatGPT deep research — NOT yet merged into PRIOR-ART.md).

### Blockers / open questions
- None blocking. Awaiting user in `Q and A.md`: "go v2" (fold RESPONSE §1 + round-2 into phase docs) OR greenlight P0A hotfix first (#19 paste/send broken for users NOW).
- Memory MCP embeddings runtime DOWN: os.kill SystemError in `C:\.memory\scripts\memory_runtime.py:125 _pid_exists`; spawn_task chip task_89c4e2c9 created. One pending memory update (bridge nuance) unsaved — content preserved here + Q&A.

### Next steps
1. "go v2" → rewrite 00-DESIGN/01-ROADMAP/phases/* per RESPONSE-to-first-critique.md (23 adoptions §1 + round-2 answers); rename phases A–G; one commit.
2. P0A greenlit → `phases/PHASE-0-hotfix.md` tasks 1,2,5 ONLY: snapshot → diagnose #19 vs `edge-extension/modules/25-prompt-send-part1.js:16-49` → fix prompt/send + sanitized fixture + one regression oracle + live smoke. NO descriptor migration during outage.
3. Merge `self_healign_selector_drop_in _chatgpt_research.txt` into PRIOR-ART.md.
4. Push branch when user says push.

### Critical context
- Bridge: question-sized prompts only ("question by question only"); fetch works wait_seconds=120–180, poll 2–3×; huge research jobs die claim_expired. ask_best_public_model fallback: cerebras GLM needs max_output_tokens≥7000 (empty answer at 2500).
- Codex: `codex exec --skip-git-repo-check -c model_reasoning_effort=medium --output-last-message <file> "$(cat prompt.txt)"`; plain non-git cwd fails trust check.
- ctx_execute_file confined to repo root — copy external files in first.
- Memory MCP rejects non-ASCII in content — ASCII only.
- Q&A protocol live; archive-and-keep-lean rule active; user answers inline fast.

### Model summary
- Planned churn-resistant selector framework across 3 repos after 2026-07-10 ChatGPT UI update broke extensions; planning only, no code.
- Delegation: codex CLI = both-repo recon (RECON doc); ChatGPT bridge = critique + 4-question round 2; cerebras GLM = design review; own websearch = prior art.
- Architecture: remote data-only selector packs + deterministic anchor-core + capability adapters + passive self-test canary + offline LLM repair loop.
- Critique adopted ~70% (privacy resequencing, precision oracles, scope cut, local-package-first, P4→spike, self-test canary); 4 contested items all resolved in round 2 — ChatGPT accepted the action-anchor boundary with refinements we adopted.
- User answered all Q&A inline: lib repo OK, upstream strategy OK, packs OK, codex/cloud repair OK, chatgpt-first, Prompt-queue consumer (saved as memory rule).
- Factual fix verified: semantic-locators depends on accname → plan uses dom-accessibility-api.
- 4 commits on enhance-tts-functionality, unpushed; v2 rewrite pending user go.
- Memory rows: plan/decisions mem_...churn-resistant-selector_27d315; Prompt-queue rule mem_...user-decision-2026-07-10_e8943b; bridge behavior mem_...2026-07-10-model-bridge_fafc5a (last nuance update failed — runtime bug, chip task_89c4e2c9).

### Handoff context (resume here)
1. Read `Q and A.md` tail first — user's answer decides v2 rewrite vs P0A hotfix.
2. `docs/plans/churn-resistant-framework/RESPONSE-to-first-critique.md` = most current truth; supersedes phase docs where they conflict until v2.
3. P0A entry: `edge-extension/modules/25-prompt-send-part1.js:16-49` (prompt) + `:38-49` (send); diagnose against fresh chatgpt.com snapshot; issue #19.
4. CRITICAL fixture rule: raw captures git-ignored only; never commit loader/`__reactRouterContext` dumps (tokens).
5. VM test harness pattern to extend: `test_auto_read_navigation_controls.js:8-58` → planned `test_selector_descriptors.js`.
6. Ophel seams: `src/utils/dom-toolkit.ts:449-475/575-645/729-825`; chatgpt adapter `src/adapters/chatgpt.ts:1109-1119,1426-1442,114-126,2354-2389`.
7. Upstream PR order: selector-config extraction first (RESPONSE §1.19).
8. Never push gemini-version/main directly; work stays on enhance-tts-functionality until user says push.
9. Bridge one small question per job; codex --skip-git-repo-check; memory ASCII-only; extension folders free of generated debris.
10. User hands-off on architecture ("beyond my pay grade") but answers scope questions fast in Q&A — route decisions there, never block.
