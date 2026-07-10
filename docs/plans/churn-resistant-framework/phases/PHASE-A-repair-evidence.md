# Phase A — Repair + evidence (this repo)

Depends: nothing. Blocks: M1, Phase B. Unblocks users NOW.
Design refs: 00-DESIGN.md (D16 privacy). Recon: RECON-codex-2026-07-10.md §2. Rules: AGENT-RULES.md 19, 25, 26.

## Goal
Re-fix what the 2026-07-10 ChatGPT update broke (at minimum [#19](https://github.com/sriharshaguthikonda/Tampermonkey/issues/19) paste-anywhere/send). **Emergency fix only — NO framework work, NO descriptor-table migration during an outage** (that starts in Phase B). Leave behind: one sanitised fixture + one regression oracle.

## Tasks
1. **Capture raw FIRST** — current chatgpt.com DOM (logged in, one conversation, composer visible) into `captures/raw/2026-07-10/` (add dir to `.gitignore` in the same commit as the fixture — raw is SECRET, never committed).
2. **Sanitise → fixture** — allowlist-sanitise the composer subtree (scripts stripped, conversation text replaced, URLs stripped, IDs rewritten, UI labels kept) into `fixtures/chatgpt.com/2026-07-10-composer/`. Manual sanitisation acceptable this once (the projector tool comes later); eyeball + grep for tokens/emails before committing.
3. **Diagnose #19 against fixture** — systematic-debugging: compare failing chains in `edge-extension/modules/25-prompt-send-part1.js:16-49` (prompt) and `:38-49` (send) against the fixture; identify exactly what churned. Record finding in issue comment.
4. **Fix prompt/send only** — update the existing chains in `25-prompt-send-part1.js` (new primary, old selectors retained as fallbacks; dictation/voice exclusion preserved). Port the same fix to the userscript monolith. Nothing else.
5. **Regression oracle** — `test_composer_fixture_oracle.js` (existing VM-harness pattern): loads the fixture, asserts prompt chain resolves the marked composer node and send chain resolves the marked send button AND does NOT match the marked dictation/voice nodes (negative exclusion). This is the corpus + oracle seed.
6. **Verify live** — `node build.js`, load dev extension, on chatgpt.com: paste populates composer, send works, dictation NOT clicked, TTS auto-read unaffected. Evidence into Q and A.md.

## Acceptance gates
- `node test_composer_fixture_oracle.js` green (evidence linked).
- Existing suites still green: `node test_auto_read_navigation_controls.js`, `node test_userscript_navigation_skip_parity.js`, `node test_voicelink_integration.js`.
- Live smoke evidence posted; **DONE-gate: user confirms paste/send works on chatgpt.com.**
- `captures/raw/` git-ignored; committed fixture passes eyeball+grep secret check.
- Diff small: selectors + fixture + one test. No new modules, no shim, no descriptor table.
