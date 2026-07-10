# Q and A

(older sessions archived to `Q and A archive.md`)

## 2026-07-10 planning session: churn-resistant selector framework

Status: PLANNING (no implementation yet, per your instruction).
Working autonomously. Agents running:
- codex: recon of both repos (ophel clone + this repo) — selector inventory, seams for shared resolver layer.
- chatgpt (browser bridge): deep prior-art research (self-healing locators, ublock-style remote selector lists, network-intercept approaches, llm selector repair).
- me: synthesis + roadmap/phase plans + testing framework docs.

Deliverable: plan docs in `docs/plans/churn-resistant-framework/` (roadmap + phase plans + test framework), foolproof enough for weaker agents to implement.

Questions (NON-blocking — I proceed with defaults, override here anytime):

1. **Where does the resilience lib live?**
   Default: NEW separate repo (e.g. `dom-anchor` / name TBD) producing a single vendorable file + npm package. Both this repo's scripts and our ophel fork consume it. Reason: ophel upstream won't take a big dependency; a small vendored file + thin PR-able seam is the only thing they might accept.

answer - fine if you think that is best do it.


2. **Ophel upstream strategy?**
   Default: keep our fork consuming the lib fully; propose only a minimal "resolver hook / selector-config" seam PR upstream, not the whole framework. Their limitations = they want small reviewable PRs, no new heavy deps.
   
answer: okay, that strategy looks good for the upstream repo.

3. **Remote-updatable selector packs** (ublock filter-list style: site change = JSON update from a gist/GitHub raw, no code release)?
   Default: YES — this is the core long-term win. Packs versioned in a public repo, signed by commit, cached via GM storage / chrome.storage.
   
okay, that is beyond my pay grade. you think about that.

4. **LLM-assisted selector repair?**
   Default: NOT runtime. Phase-later offline tool: CI captures DOM snapshot when selectors break → local/codex model proposes new selector chain → human merges pack update. No user data leaves browser at runtime.
   
okay, but i think the data can be saved and maybe we can also use codex or cloud to do that repay.


5. **Which sites first?**
   Default: chatgpt.com only for v1 (it's what broke), architecture site-agnostic so gemini/claude/etc are just new packs later.
   
yes, chatgpt comes first, later similar thing can be done for other websites, site-agnostic.



6. **Scope of "our extension framework"** = this repo's edge-extension + Tampermonkey userscripts, right? Anything else that should consume the lib (VoiceLink? Prompt-queue?) — list here if so.

oh yes, prompt queue should also consume this and add this to memory. so future development will be easy if any extension is developed.



Answer inline under any question; I keep working meanwhile.



## user comments
1. so what send has reached chatgpt ....i will paste in docs you don't need to communicate further with chatgpt for now

## 2026-07-10 agent response — PLAN COMPLETE, ready for your review

Status: DONE (planning only, per instruction). Commits `8158929` + follow-up. All your inline answers (Q1–Q6) folded in:
- Q4: repair bundles may go to codex/cloud — recorded as D4b.
- Q6: Prompt-queue added as consumer — D8b + saved to memory as standing rule for all future extensions.
- ChatGPT bridge: understood, no more sends. When you have the response, paste it into `docs/plans/churn-resistant-framework/RESEARCH-chatgpt-deep-research.md` (new file, just paste raw) — next session merges it into PRIOR-ART.md.

Read in this order (all in `docs/plans/churn-resistant-framework/`):
1. `00-DESIGN.md` — architecture + decisions D1–D11.
2. `01-ROADMAP.md` — P0→P6, milestones M1–M4.
3. `phases/PHASE-0-hotfix.md` — first implementation step: re-fix #19 + descriptor-table pilot.
4. `TESTING.md` + `AGENT-RULES.md` — gates + binding rules for implementing agents.
5. `PRIOR-ART.md` + `RECON-codex-2026-07-10.md` — evidence.

One-line pitch: selectors become remote-updatable JSON packs (uBlock filter-list model) resolved by a 5-tier fallback engine; ChatGPT features read the site's own network JSON instead of scraping DOM; nightly canary + codex repair CLI close the loop. Site change = 1 json edit, no code release, no reinstall.

Questions: none blocking. Greenlight P0 here whenever — phase files are written to hand straight to implementing agents.



## user comments
1. C:\Windows_software\Tampermonkey\docs\Research\self_healign_selector_drop_in _chatgpt_research.txt
2. well, i am not really capable of reviewing the plans that you make but if you can save all those files, i'll dump them to chatgpt and ask it to do a review.
3. now the thing is chatgpt took a lot of time to build and it did give huge report. i have saved in that self-healing selector drop in chatgpt research text.

4. all the plans to chatgpt sent for detailed review, let's see what comes back.

5. C:\Windows_software\Tampermonkey\docs\plans\churn-resistant-framework\first_critique_by_chatgpt.txt of plan is loading wait
6.the critique, first critique by chatgpt text file, go read it.


7. you can ask chatgpt model bridge question by question. i can get you the answer. question by question only.

## 2026-07-10 agent response — critique assessed, rebuttal ready

Critique is good — I accept ~70% outright. Full rebuttal for ChatGPT:
**`docs/plans/churn-resistant-framework/RESPONSE-to-first-critique.md`**

- §1: 23 items adopted as-is (anchor risk classes, anchor-core split + local-package-first, no node caching, heuristics demoted to diagnostics, precision oracles + adversarial fixtures, privacy resequencing — raw snapshots never committed anywhere, P4 demoted to go/no-go spike, P6 canary = extension self-test, estimate honesty, etc).
- §2: 5 adopted-with-modification, with arguments (e.g. pack signing deferred — solo-maintainer signing key lives in the same compromise domain as repo creds; risk classes already bound the blast radius).
- §3: 4 contested questions ChatGPT must answer. Big one: if action anchors are fully code-frozen, send-button churn (this week's real breakage) is back to code releases — we propose "remote may update exact-match strategies for action anchors; code owns trust/invariants".
- §4: revised roadmap adopting its A–G shape.

Verified its factual jab: `npm view semantic-locators` → depends on `accname`. It was right; PRIOR-ART.md corrected. Plan v2 rewrite happens after round 2 settles (no doc churn).

Per your #7: sending contested question 3.1 through the bridge now, one at a time. If the fetch side times out, grab the answer from your tab and paste it here or in a file.



## user comments
1. your boundary question, you might get that answer back. 
2. it has responded to your boundary question. hope you got the answer back or i will copy-paste.
3. if you ask smaller questions, 
4. it will give you smaller answers quickly.

## 2026-07-10 agent response — ROUND 2 COMPLETE, all 4 contested items settled

Noted re smaller questions — that matched behavior exactly (all 4 fetches succeeded; only the huge deep-research job outlived the claim window). Answers + adoptions recorded in `RESPONSE-to-first-critique.md` "Round 2 answers" section:

1. **Action anchors**: ChatGPT accepted our boundary — remote packs may update exact-match strategies; code owns trust. Its additions adopted: positive intent checks (act only via `composer.submit()`, never generic click), state-aware preflight, local-approval gate for action-anchor pack changes early on (this also settles the signing debate for v1).
2. **Locale/names**: resolved — names are locale-scoped pack data (`byLocale`, `verifiedLocales`, fail-closed on unknown locale for action anchors); NO positional fallbacks for action anchors, form-semantics instead (`button.form === input.form`, `type=submit`).
3. **Self-test canary**: envelope upgraded — state-class-triggered probes (not once-per-session), `unobserved_applicable_state` ≠ healthy, 4–8ms cancellable slices, opportunistic probing when you naturally enter states, local-only history + optional failure-only opt-in crowd signal.
4. **Data-layer spike**: parallel scheduling accepted with conditions; full raw-vs-rendered conformance protocol received (zero hidden-turn-leak = hard fail gate); bootstrap capture via allowlisted `__reactRouterContext` projector — IMPORTANT security catch: that global holds access tokens/identity, raw captures are secrets, sanitise in MAIN world before anything crosses the bridge.

**No open disputes left. Next: plan v2 rewrite folding §1 adoptions + round-2 answers into the phase docs — say "go v2". Or greenlight P0A hotfix first (unaffected by any of this; users still broken).**


## user comments
1.flesh out the plans so retarded agents can implement

## 2026-07-10 agent response — v2 committed, now fleshing out phases

v2 rewrite DONE first (commits `2e41940` core docs, `654a35c` phases A–G replacing P0–P6). All round-1 + round-2 review outcomes folded into 00-DESIGN / 01-ROADMAP / TESTING / AGENT-RULES / phases.

Seen your "flesh out" instruction — expanding each PHASE-A…G file now into fully self-contained implementation scripts: prerequisites checklist, per-task exact files/steps/code shapes, test names + assertions, verbatim gate commands, commit messages, failure playbooks. Working on it — next note when committed.

## 2026-07-10 agent response — PHASES FLESHED OUT, plan v2 fully done

Committed `40baf44` (on top of `2e41940` + `654a35c`). Each `phases/PHASE-A…G.md` is now a self-contained implementation script: "Context you need" primer (assumes the agent knows nothing), prerequisites checklist, numbered tasks with exact file paths + code shapes + suggested commit messages, verbatim gate commands, "If things go wrong" playbook, and a "Do NOT" scope fence. A weak agent needs only the phase file + AGENT-RULES.md + the named design sections.

Plan structure now:
- `00-DESIGN.md` — architecture + decisions D1–D17 (v2)
- `01-ROADMAP.md` — phases A–G, milestones M1–M4, gates not calendar
- `TESTING.md` — oracle corpus, precision gates, conformance protocol
- `AGENT-RULES.md` — 27 binding rules (trust model + privacy are non-negotiable sections)
- `phases/PHASE-A…G.md` — the implementation scripts

**Ready to implement. Phase A (re-fix #19 paste/send — users still broken) is the entry point; say go and it starts.** Branch still unpushed — say "push" when wanted. Optional leftover: merging your 66.7K deep-research file into PRIOR-ART.md.



## user comments
1. codex cli to implement as agents!
2. use serena as well

## 2026-07-10 agent response — Phase A progress, one blocker, one finding

Noted re codex-cli + serena — will route Task 5's actual selector-fix edit through codex-cli (gpt-5.5 medium) and use Serena for symbol nav on that file, per your standing instruction.

Done:
- `ade6cb7` — task 1, gitignore `captures/raw/`.
- Task 4 harness built + smoke-tested (uncommitted, waiting on real fixture to make it a genuine red run): `test_composer_fixture_oracle.js`. Repo has no DOM library (no node_modules at all, Phase A bars adding packages), so I wrote a small selector-chain matcher scoped exactly to what `PROMPT_SELECTORS`/`SEND_SELECTORS` use (tag/#id/.class/[attr]/[attr*=]/descendant/:not) — validated it against a throwaway synthetic fixture (deleted after, not committed), confirmed real bugs (quoted-value tokenizer) before touching your real capture.

**Finding (Phase A Task 5 simplifies):** checked `build.js` — it does NOT generate a userscript monolith, it just copies `edge-extension/` into `dist/dev`+`dist/prod`. The actual maintained userscript is `Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js` (per AGENTS.md). I grepped it for prompt-textarea/Send/Dictate — **zero matches**. The paste-anywhere/send feature (#19) currently exists ONLY in `edge-extension/`, never ported to the userscript. So Task 5 has nothing to port there — smaller diff than the phase doc assumed. (There's also a stale `--- ChatGPT dev-1.7.user.js`, last touched March, not the live one — ignoring it.)

**Still BLOCKED on Task 2** — need your live DOM capture (see ask above: `copy(document.documentElement.outerHTML)` on chatgpt.com composer, or just the composer `<form>` outerHTML, saved to `captures/raw/2026-07-10/composer.html`). No connected browser on my end (Claude-in-Chrome extension not installed/signed in), can't drive your logged-in session. Everything else Phase-A-unblocked is done; next real step (diagnose + fix) needs that file.

## user comments
1. enabled the claude extension on the browser, see if you can use it. or else tell me what i need to do.
2. edge extension is the main thing. the direction in which we are going, all those things are not possible in tampermonkey scripts.


## 2026-07-10 agent response — browser still not connected + userscript confirmed out of scope

Re #2: matches what I found (userscript has zero paste/send code) — Phase A stays edge-extension-only, no porting.

Re #1: retried `list_connected_browsers` — still empty, extension not reachable from my side yet. Checklist:
1. Extension installed: https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn (confirm it's Edge-compatible install, or use Chrome if Edge blocks it).
2. Open the Claude side panel in that browser (icon in toolbar) and sign in with the **same Claude account** this session is running under (g.sriharsha746@gmail.com).
3. Keep chatgpt.com open in a tab in that same browser, logged in.
4. Tell me here once signed in — I'll retry.

If it still won't connect, simplest fallback: just paste the composer capture yourself (DevTools steps in my earlier note above) into `captures/raw/2026-07-10/composer.html` — either path unblocks Task 2 equally, whichever's less friction for you.

## user comments
1. logged into the claude browser extensions
2. i will disable other extensions and you can do more logging as well
3. you can get some historrical data from prompt queuw extenstion history of commits as well
4. use codex agents to do implementations

5. if you can do somwthing and wnat me to do ...let me know in Q and A and beep multiple times!!

6. it is edge browser, not

## 2026-07-10 agent response — Task 2/4 done, real DOM captured, one surprise

Browser connected. Did the whole capture myself — no manual DevTools paste needed.

Navigated to chatgpt.com, inspected the real composer via safe JS queries (raw outerHTML dump got auto-blocked by the secret filter as cookie/query-string-looking data — filter working correctly, so I built a sanitized attribute-allowlist skeleton instead). Real DOM:
- Composer: `<div id="prompt-textarea" contenteditable="true" role="textbox">` (ProseMirror).
- Send button: `<button data-testid="send-button" aria-label="Send prompt">` — only renders once there's text; empty composer shows a dictation/voice button instead.

Built `fixtures/chatgpt.com/2026-07-10-composer/composer.html` (oracle-marked, allowlisted attrs only), added a `.gitignore` negation so it survives the blanket `*.html` rule, secret-grepped it clean, ran `test_composer_fixture_oracle.js` for real. Committed `d74ff90`.

**Surprise: the oracle PASSES.** `findPromptArea()`/`findSendButton()` already match the live DOM exactly — selectors are NOT stale. So #19 isn't selector churn; Task 5 needs a different fix target than assumed.

I then tried to reproduce the reported symptom live: cleared composer, clicked blank page area, real Ctrl+V with real clipboard content — composer stayed empty, looks like a real repro. But couldn't fully trust it: zero console output across a fresh reload (every init step in `10-lifecycle.js` is wrapped in `safeInit()`, which always logs on error — silence either way is odd), and the extension's own floating control panel, visible once right after first navigating there, never reappeared on later reloads. Both are consistent with the extension not actually being the loaded/active one on this browser tab, which would make my repro meaningless.

Your #2 (disabling other extensions) and #6 (confirming it's Edge, not — cut off, what's the rest?) both bear directly on this. Once other extensions are disabled, I'll redo the clean repro test and check console again — if it's still silent, that itself is a new finding (extension present but inert) rather than a "wrong browser" issue.

Re #4: yes, routing the actual Task 5 selector/logic fix through codex-cli per standing instruction once we have a confirmed root cause.
Re #3: noted, will look at Prompt-queue commit history if it becomes relevant to this bug — not obviously connected to #19 yet, will ask before spending time there unless you mean something specific.

Continuing now: retrying the live test, and reading `99-bootstrap.js`'s entrypoint to check for any condition that could skip `init()` silently regardless of which browser this is.

## 2026-07-10 agent response — likely explanation for the silence found, independent of which browser

Read `edge-extension/modules/99-bootstrap.js:300-307`. Everything — panel, paste listener, all of it — only gets created inside the callback of `chrome.storage.sync.get(null, callback)`, and there's no timeout or fallback. If `chrome.storage.sync` ever stalls (sync turned off on that browser profile, not signed into browser sync, throttled, slow), that callback never fires and `TTSReader.init()` never runs — silently, no error, nothing in console, no panel, no paste listener attached. That matches every symptom I saw exactly. I can't verify this further myself: `chrome.storage` isn't reachable from a plain page-context JS eval (only from inside the extension's own execution context), so I can't directly check whether `sync.get` is hanging on this browser.

This matters regardless of the browser-profile question: if `chrome.storage.sync` occasionally stalls in your real day-to-day browser too, that would explain #19 as "the whole extension silently didn't start this session" rather than "selectors broke" — and would need a different fix (a timeout fallback to defaults + `chrome.storage.local`, so init always runs even if sync is slow/unavailable) rather than a selector fix.

Not building that fix without your go — it's a behavior change to the init path, not a selector tweak, and Task 5 in the phase doc assumed a selector fix. Two ways to move forward, tell me which:
1. You test manually in your real browser: reload the unpacked extension, open chatgpt.com, check whether the "TTS Reader" panel appears normally and whether paste-anywhere works for you day-to-day. If it works fine for you, my repro here was a browser/profile artifact and #19 may already be less severe than the issue assumed, or is intermittent (which would still point at the storage.sync stall theory).
2. Say go-ahead and I'll have codex-cli add a storage.sync timeout/local-storage fallback as a small hardening fix, test it against this same live setup once other extensions are disabled per your #2.
