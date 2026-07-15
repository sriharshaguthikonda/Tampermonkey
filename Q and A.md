# Q and A

(older sessions archived to `Q and A archive.md`)

## 2026-07-15 session: FIX #19 EXECUTION (plan approved)

Plan lives in repo: `docs/plans/issue-19-global-paste/PLAN.md` (per your #8).

Root cause found — TWO independent silent-failure layers, both confirmed:
1. **Init death**: `99-bootstrap.js` — everything runs inside `chrome.storage.sync.get` callback, no timeout. Stall = no panel, no listener, total silence. (Your reload symptom.)
2. **Guard false-positive — confirmed against YOUR capture** (`TTS Edge Extension Bug.html`, thanks, exactly what was needed): idle chatgpt.com has 7× `data-state="open"` incl. the always-visible sidebar → `hasBlockingOpenElements` fires on every page → paste silently aborts even when extension alive. Selectors themselves healthy (oracle passes).

ChatGPT bridge reviewed both fixes, concurred + hardened them (lastError handling, safeInit around settings-apply, stronger visibility check). Your settings-chain note (#3: global paste / nice paste / auto send linked) — fixes don't touch that chain, defaults only apply if storage stalls.

Now executing, codex agents doing implementation (your #5/#10 — testing their usability right now):
- [ ] issue #21 filing (storage.sync silent death)
- [ ] Fix 1: bootstrap fail-open + node test (codex)
- [ ] Fix 2: drop `[data-state="open"]` from guard + node test (codex)
- [ ] remaining issues incl. your NEW #4: smart-copy/copy overlay buttons unreadable in system-theme-light (CSS) — filing as GitHub issue
- [ ] push branch; live verify; only then close #19/#21

Your #9 (repo maps/serena, token burn) — heard. Edit targets pinned to file:line in plan; codex+serena do the edits, no broad rereads.

Nothing blocking. Answer inline anytime; I keep working.


## user comments
1. if you can use parallel codex agents, do it.






