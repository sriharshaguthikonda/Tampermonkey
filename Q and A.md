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