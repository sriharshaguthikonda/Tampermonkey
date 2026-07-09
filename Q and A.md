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