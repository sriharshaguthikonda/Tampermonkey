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
---

## Handoff: 2026-07-10T05:18:43Z (auto-saved before compaction)

### Compaction Metadata
- Trigger: manual
- Custom instructions: selective with keeping info needed for plan v2 rewrite
- Transcript: C:\Users\deletable\.claude\projects\C--Windows-software-Tampermonkey\74d4cc82-ff41-475a-be78-af290ef2de28.jsonl
- CWD: C:\Windows_software\Tampermonkey

### Last User Message (transcript tail)
(unavailable)

### Last Assistant Message (transcript tail)
Covers: planning-complete state (4 plan commits, unpushed), all settled decisions from both review rounds, the two resume paths (v2 rewrite vs P0A hotfix — waiting on your call in Q and A.md), and the operational gotchas (bridge question-sizing, raw-capture-secrets rule, memory runtime bug chip).

### Git Snapshot
- Branch: enhance-tts-functionality
- Status:
 M docs/plans/churn-resistant-framework/first_critique_by_chatgpt.txt
?? .model_bridge_cache/
?? .serena/
?? _[Extended]-_[gpt-5-5-thinking]_files/
?? artifacts/
- Recent commits:
65ca099 docs(handoff): planning session complete — framework plan + 2 review rounds settled
bb27d9b docs(plan): round-2 review complete — all 4 contested items resolved via bridge
9843120 docs(plan): rebuttal to first ChatGPT critique + prior-art factual fixes
6240e1d docs(plan): fold in user Q&A answers — D4b codex/cloud repair, D8b Prompt-queue consumer
8158929 docs(plan): churn-resistant selector framework — design, roadmap, 7 phase plans, testing framework

### Model Summary
(filled post-compaction, 2026-07-10 ~06:00 IST — plan v2 rewrite executed after this snapshot)

- User said "plan v2 rewrite" → executed fully this session.
- Commits: `2e41940` (v2 core docs), `654a35c` (phases A–G replace P0–P6), `40baf44` (phases fleshed into self-contained implementation scripts, per user's "flesh out the plans so retarded agents can implement"), `27e1315` (Q&A update).
- 00-DESIGN.md v2: risk classes, "packs propose / code decides trust" first principle, anchor-core purity (local package first), capability adapters named, locale-scoped names, passive self-test canary, data layer = Phase G spike, decisions D1–D17, precision-first success criteria.
- 01-ROADMAP.md v2: phases A–G, gates not calendar, one-phase-per-repo rule (G ∥ D/E only declared parallelism).
- TESTING.md v2: identity oracles + adversarial fixtures, 100% action-anchor precision gate, happy-dom parsers-only, Phase-G conformance protocol (§8).
- AGENT-RULES.md v2: 27 rules; trust-model (7–11) + privacy (19–24) non-negotiable.
- Each phases/PHASE-A…G.md: context primer, prereq checklist, per-task steps/code shapes/commit messages, gate commands, failure playbook, Do-NOT fence.
- Source of truth for all v2 content: RESPONSE-to-first-critique.md (§1 adoptions, §2 modifications, Round-2 answers).
- Branch enhance-tts-functionality still UNPUSHED (user says "push" when wanted).

### Handoff Context (paste into next session)
1. Plan v2 COMPLETE at `docs/plans/churn-resistant-framework/` — read 00-DESIGN.md → 01-ROADMAP.md → phases/PHASE-A-repair-evidence.md.
2. Next action: WAIT for user "go" in `Q and A.md`, then execute Phase A (re-fix #19 paste/send; users broken since 2026-07-10 ChatGPT update).
3. Phase A fully scripted in its phase file: gitignore captures/raw FIRST → capture → sanitise + oracle-mark fixture → diagnose `edge-extension/modules/25-prompt-send-part1.js:16-49` → red oracle test → fix (keep fallbacks + dictation exclusion) → gates → live smoke → user confirms.
4. Gate commands: `node --check <file>`, `node test_composer_fixture_oracle.js` (new), `node test_auto_read_navigation_controls.js`, `node test_userscript_navigation_skip_parity.js`, `node test_voicelink_integration.js`, `node build.js`.
5. SECURITY: raw DOM/network/`__reactRouterContext` captures are SECRETS — git-ignored `captures/raw/` only, allowlist-sanitise before commit (AGENT-RULES 19–20).
6. Never push `gemini-version`/`main`; branch is `enhance-tts-functionality`; push only on user request.
7. Q&A protocol live: communicate in `Q and A.md`, pre-dispatch notes before long work, never block on questions.
8. Optional leftover: merge `docs/Research/self_healign_selector_drop_in _chatgpt_research.txt` (66.7K) into PRIOR-ART.md.
9. Memory runtime broken (os.kill SystemError, `C:\.memory\scripts\memory_runtime.py:125`) — spawned chip task_89c4e2c9; one bridge-behavior memory nuance still unsaved (content preserved in Q&A + this file).
10. ChatGPT bridge: ask small questions one at a time (`ask_chatgpt` sync works, cloud_ok=true; async submit/fetch broken — insertion_mismatch).

---

## Handoff: 2026-07-10T17:55:24+05:30 — Phase A in progress, blocked on live DOM capture

### Current task state
- User said "go", started Phase A (`docs/plans/churn-resistant-framework/phases/PHASE-A-repair-evidence.md`) commit-by-commit, unpushed on `enhance-tts-functionality`.
- Task tracker (in-session TaskCreate, ids 1-6, NOT persisted to a file — recreate if resuming cold): #1 gitignore DONE, #2 capture+sanitise fixture IN PROGRESS/BLOCKED, #3 diagnose PENDING, #4 oracle test harness built+smoke-tested but UNCOMMITTED (needs real fixture for a genuine red run), #5 fix PENDING, #6 verify-live PENDING.
- Commits this session: `ade6cb7` (gitignore `captures/raw/`), `8e50bc2` (PRIOR-ART.md merge of deep-research findings — the "optional leftover" from prior handoffs, now DONE).

### Key decisions
- **Userscript scope finding**: `build.js` does NOT generate a userscript monolith — it only copies `edge-extension/` into `dist/dev`/`dist/prod`. The actually-maintained userscript is `Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js` (per AGENTS.md); grepped it for prompt-textarea/Send/Dictate — **zero matches**. Paste/send (#19) exists ONLY in `edge-extension/`, never ported. User confirmed independently ("edge extension is the main thing... not possible in tampermonkey scripts"). **Phase A Task 5 needs no userscript porting** — smaller diff than the phase doc assumed. (Ignore stale `Tampermonkey_scripts/--- ChatGPT dev-1.7.user.js`, last touched March, unrelated old file.)
- **No DOM library in repo** (no `package.json`, no `node_modules`, Phase A bars adding packages). Wrote a minimal HTML parser + CSS selector-chain matcher scoped exactly to `PROMPT_SELECTORS`/`SEND_SELECTORS` syntax (tag/#id/.class/[attr]/[attr="v"]/[attr*="v"]/descendant-combinator/:not) directly inside `test_composer_fixture_oracle.js` — validated against a throwaway synthetic fixture (built, ran, deleted, never committed) before touching the real capture. Ceiling: only supports the selector syntax actually used by this module; would need extending for `^=`/`$=`/multiple `:not()` args/child-combinator if a future selector needs them.
- Deep-research merge (`docs/Research/self_healign_selector_drop_in _chatgpt_research.txt`, UTF-16-encoded, decode with `raw.decode('utf-16')` not plain read) independently converges on the same architecture as v2 design (own kernel on `dom-accessibility-api`, remote data packs Dark-Reader/uBlock style, offline-only LLM repair) — no design changes triggered, treated as validation. New PRIOR-ART.md rows added: `@medv/finder`, Vimium, Dark Reader detail, rejected-list additions, similarity-threshold starting numbers (0.85 / gap 0.15, dormant — similarity tier is diagnostics-only per round-1 critique adoption), GPL-3.0 caution for Ophel-sourced patterns, academic citations.

### Modified files
- `.gitignore` — added `captures/raw/` (committed `ade6cb7`).
- `docs/plans/churn-resistant-framework/PRIOR-ART.md` — deep-research merge (committed `8e50bc2`).
- `Q and A.md` — multiple agent-response sections appended this session (uncommitted — commit with next docs batch, don't lose user's inline replies).
- `test_composer_fixture_oracle.js` — NEW, repo root, UNCOMMITTED. Ready to run the moment the fixture exists; do not commit until it produces a genuine red run against the real (not synthetic) fixture per phase Task 4.

### Blockers / open questions
- **Hard blocker on Task 2**: need a live, logged-in chatgpt.com DOM capture of the composer. Asked twice in `Q and A.md`. Two paths offered:
  1. User signs Claude-in-Chrome extension into the same account (g.sriharsha746@gmail.com) with chatgpt.com open — `mcp__claude-in-chrome__list_connected_browsers` returned `[]` on last 2 retries (17:30ish and 17:55 IST) even after user said they enabled the extension — keep retrying this tool each session start, it may just need another sign-in step on their end.
  2. Manual fallback: user runs in chatgpt.com DevTools console `copy(document.documentElement.outerHTML)` or copies the composer `<form>` outerHTML, saves as `captures/raw/2026-07-10/composer.html` (path already gitignored).
- Nothing else in Phase A is executable until one of those lands — do not skip ahead to Phase B/C (AGENT-RULES rule 1: one phase at a time, dependency gate).

### Next steps (in order, once fixture/browser unblocks)
1. Retry `mcp__claude-in-chrome__list_connected_browsers`; if populated, navigate to chatgpt.com, grab composer HTML via `read_page`/`javascript_tool` instead of asking user again.
2. Task 2 remainder: sanitise the raw composer HTML by hand into `fixtures/chatgpt.com/2026-07-10-composer/composer.html` — strip scripts/styles/urls/session-looking ids, add `data-oracle="composer-input"` on the real input, `data-oracle="send-button"` on the real send button, `data-oracle-negative="dictation"` (and one per other sibling button: attach-files etc). Secret-check: `grep -riE "(bearer|token|session|sk-[a-z0-9]|@gmail|@outlook|authorization)" fixtures/chatgpt.com/2026-07-10-composer/"` must return nothing, plus eyeball. **`.gitignore` line 43 is a blanket `*.html`** — will silently gitignore this fixture; add a `!fixtures/**/*.html` negation before committing it, or the commit will look empty.
3. Task 3: diff `edge-extension/modules/25-prompt-send-part1.js:16-49` selector chains against the fixture by hand, find what churned, comment on GitHub issue #19 (only with explicit permission — posting to GitHub is a "send on user's behalf" action).
4. Task 4: run `node test_composer_fixture_oracle.js` against the real fixture — confirm it's genuinely RED (baseline evidence), then commit `test: composer fixture oracle for #19 (red)`.
5. Task 5: add new primary selector(s) to the top of `PROMPT_SELECTORS`/`SEND_SELECTORS` chains in `25-prompt-send-part1.js` only (no userscript porting needed, see Key decisions). Per user's standing instruction, route this edit through codex-cli (`codex exec -c model_reasoning_effort=medium`) and use Serena for symbol nav rather than hand-editing. Run full gate set: `node --check edge-extension/modules/25-prompt-send-part1.js`, `node test_composer_fixture_oracle.js`, `node test_auto_read_navigation_controls.js`, `node test_userscript_navigation_skip_parity.js`, `node test_voicelink_integration.js` — all green. Commit.
6. Task 6: reload unpacked extension, verify live on chatgpt.com (paste/send/dictation-untouched/TTS-still-reads), post evidence to `Q and A.md`, wait for user's explicit confirm before treating #19 as closeable.

### Critical context
- Serena and context-mode MCP tools were connecting mid-session (deferred); use `ToolSearch` to load `mcp__serena__*` before symbol-editing work in Task 5.
- `mcp__plugin_context-mode_context-mode__ctx_execute`/`ctx_execute_file` are the right tool for reading/summarizing large files (used successfully on the 68KB deep-research txt) — keeps raw bytes out of conversation context; this file's usage hit the 85% context warning that triggered this handoff, so lean on it more, not less, next session.
- Repo has `.repo-intel/manifest.json` (policy: sensitivity=private, profile=basic) — read it before broad exploration, per global instructions.
- AGENTS.md mandates: implement in `edge-extension/` first, port to `Tampermonkey_scripts/` after — but Task 5 is confirmed edge-extension-only, no port needed this phase.
- Never push `gemini-version`/`main` directly; stay on `enhance-tts-functionality`; push only on explicit "push".
- Q&A protocol live and being used correctly — user is answering inline in `Q and A.md` faster than real-time; re-read the file tail before acting, don't assume last-known state.

### Model summary
- Phase A (emergency #19 paste/send fix) started on user go-ahead; working commit-by-commit per AGENT-RULES.
- Task 1 (gitignore) done and committed. Task 4's test harness built and validated early (against a synthetic, now-deleted fixture) to de-risk it before the real capture arrives.
- Found and documented that Task 5's scope is smaller than the phase doc assumed: no userscript porting needed, feature is edge-extension-only.
- Did the previously-flagged optional PRIOR-ART.md merge of the 66.7K deep-research file while blocked — used context-mode sandbox execution to avoid loading the raw UTF-16 file into conversation context.
- Hard-blocked on Task 2 (live chatgpt.com DOM capture): no connected browser via Claude-in-Chrome despite user enabling the extension; asked for either browser sign-in or a manual DevTools paste, twice, in Q&A.
- Correctly did NOT start Phase B/C/etc. while Phase A is incomplete, per binding rule 1.
- User's standing instructions for the rest of Phase A: route the actual selector-fix code edit through codex-cli, use Serena for symbol navigation, keep committing atomically, don't stop for permission on non-GitHub actions.
- Test file `test_composer_fixture_oracle.js` exists uncommitted at repo root — don't recreate it, just point it at the real fixture once captured.
- `.gitignore`'s blanket `*.html` rule will need a negation exception before the fixture commit in Task 2 — flagged so it isn't a surprise.

### Handoff context (resume here)
1. `cd C:/Windows_software/Tampermonkey`, branch `enhance-tts-functionality`, read `Q and A.md` tail FIRST — user may have answered the capture-blocker while this session was compacting.
2. If answered: either retry `mcp__claude-in-chrome__list_connected_browsers` (if user signed in) or read `captures/raw/2026-07-10/composer.html` (if user pasted manually).
3. Recreate the in-session task tracker (TaskCreate #1-6) if it's gone — it's not persisted across compaction, this handoff is the source of truth for status.
4. `git log --oneline -5` to confirm `ade6cb7`/`8e50bc2` are there and no one force-pushed over them.
5. `test_composer_fixture_oracle.js` already exists at repo root, ready to run — do not rewrite it, just supply the real fixture.
6. Follow "Next steps" above in order 2→6; don't skip Task 3's manual diagnosis even if the fix seems obvious — AGENT-RULES 26 requires capture-then-diagnose-then-fix, in that order, with evidence.
7. Before closing #19 on GitHub: that's a "send on user's behalf" action — post the comment draft in `Q and A.md` first or ask explicitly, don't auto-post.
8. Remaining Phases B-G untouched, no prep work started on them — respect the one-phase-at-a-time rule.
---

## Handoff: 2026-07-10 (later same day) — browser connected, Task 2/4 done, Task 3 redirected by a real finding

### Current task state
- Claude-in-Chrome connected this session (`list_connected_browsers` returned a local device; earlier sessions saw `[]`). Drove chatgpt.com directly — no manual DevTools paste needed after all.
- Task 2 DONE + committed (`d74ff90`): sanitized fixture `fixtures/chatgpt.com/2026-07-10-composer/composer.html`, oracle-marked, secret-grepped clean. Added `.gitignore` negation (`!fixtures/**/*.html`) so it survives the blanket `*.html` rule.
- Task 4 DONE + committed (same commit): `test_composer_fixture_oracle.js` run against the REAL fixture — **PASSES**. `findPromptArea()`/`findSendButton()` in `25-prompt-send-part1.js` already match the live DOM (`#prompt-textarea[contenteditable=true]` ProseMirror div, `[data-testid=send-button]`). Selectors are NOT stale.
- Task 3 (diagnose): reframed. Not a selector bug. Live repro of paste-anywhere (clear composer → click blank area → real Ctrl+V) showed no text landing — but couldn't trust this repro because the extension showed zero console output across a fresh reload and its floating control panel (seen once, first screenshot only) never reappeared. Read `edge-extension/modules/99-bootstrap.js:300-307`: `TTSReader.init()` (which creates the panel and attaches the paste listener) only runs inside `chrome.storage.sync.get(null, callback)` with **no timeout/fallback**. If sync storage stalls for any reason, init silently never happens — matches every symptom observed. Can't verify further: `chrome.storage` isn't reachable from page-context JS eval used by the browser tools.
- Asked user in `Q and A.md` (commit `b9d703d`) to pick: (1) manually verify in their real day-to-day browser whether panel/paste work normally, or (2) greenlight a small codex-cli hardening fix (storage.sync timeout + `chrome.storage.local` fallback) to test against this same live setup.
- User has also said (Q&A, not yet acted on): will disable other extensions on their end for cleaner testing; it's Edge browser (message cut off mid-sentence, "not ___" — never completed); asked to use codex-cli for implementation (standing instruction, unchanged); mentioned Prompt-queue extension's commit history as possibly relevant (unclear how, not yet connected to #19 — flagged, not investigated).

### Key decisions
- Do NOT implement the storage.sync timeout/fallback fix without explicit go-ahead — it's an init-path behavior change, not the selector fix Task 5 assumed, so treating it as a new candidate root cause requiring sign-off rather than continuing the phase script blindly.
- Oracle test result changes Task 5's likely scope: probably no `PROMPT_SELECTORS`/`SEND_SELECTORS` edit needed at all; real fix (if the storage.sync theory holds) lives in `99-bootstrap.js` init bootstrapping, a different file than the phase doc named.

### Modified/new files this session
- `.gitignore` — added `!fixtures/**/*.html` negation (committed `d74ff90`).
- `fixtures/chatgpt.com/2026-07-10-composer/composer.html` — NEW, sanitized real capture (committed `d74ff90`).
- `test_composer_fixture_oracle.js` — now committed (was uncommitted at last handoff) — same file, no changes, now proven against a real (not synthetic) fixture (committed `d74ff90`).
- `Q and A.md` — two new agent-response sections + question (commits `0eb1270`, `b9d703d`).

### Blockers / open questions
- Waiting on user's choice in `Q and A.md`: manual real-browser test vs. codex-cli hardening fix. Either answer unblocks the next step; don't guess further via live automated repro — the chrome.storage-not-reachable-from-page-eval limitation means no more signal is obtainable that way.
- Prompt-queue "historical commits" comment from user — unclear relevance to #19, flagged in Q&A, not investigated; don't chase until user clarifies.

### Next steps (in order, once user answers)
1. If "test manually confirms it's fine here": treat #19 as either already-partially-fixed or intermittent; ask user to describe exactly when it fails (which strengthens or kills the storage.sync stall theory) before touching code.
2. If "greenlight hardening fix": route through codex-cli per standing instruction — prompt should target `edge-extension/modules/99-bootstrap.js` `initWithStoredSettings()`, add a timeout (e.g. 2–3s) that falls back to `TTSReader.init()` with `chrome.storage.local`-or-defaults if `chrome.storage.sync.get` hasn't resolved, keep the existing sync-resolves-normally path unchanged. Gate: `node --check`, all 3 existing node tests + the new oracle test, live smoke via Claude-in-Chrome (reload extension not possible remotely — ask user to reload, or test whatever's already loaded).
3. Either path: once root cause is confirmed, that's when Task 5 (the actual fix + its own gates) executes for real; don't pre-commit to touching `25-prompt-send-part1.js` since the oracle already shows its selectors are fine.
4. Still respect one-phase-at-a-time — no Phase B+ prep.

### Critical context
- `chrome.storage` APIs are invisible to `mcp__claude-in-chrome__javascript_tool` (main-world page eval) — only reachable from the extension's own contexts (content script isolated world, background service worker). This is a hard tool limitation, not a bug in reasoning; don't retry the same probe expecting different results.
- Content-script-set `window.*` globals (e.g. `window.__TTSNS`) are also invisible to page-context eval for the same isolated-world reason — use real DOM queries (`document.querySelector`) instead, which work fine since DOM is shared even when JS globals aren't.
- `chrome://extensions` is blocked from Claude-in-Chrome navigation (security boundary, expected) — can't visually confirm install/enable state that way.
- Secret filter on `javascript_tool` blocked a raw `form.outerHTML` dump as cookie/query-string-like data — expected/correct behavior per AGENT-RULES 19–20; worked around by building an attribute-allowlist skeleton in-page instead of dumping raw HTML.
---
