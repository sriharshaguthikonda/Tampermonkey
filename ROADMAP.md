# Roadmap

## Active Phase (P0, users broken): ChatGPT 2026-09 churn repair (Churn Event #2)

- Plan: [PLAN.md](docs/plans/chatgpt-2026-09-churn/PLAN.md)
- Evidence: [docs/Research/chatgpt-2026-09-churn/](docs/Research/chatgpt-2026-09-churn/) (live DOM probe 2026-09-21, feature inventory, driftwatch gap analysis, Mar/Jul/Sep DOM diff)
- Why: the 2026-09 chatgpt.com redesign removed data-testid, data-message-author-role and #prompt-textarea; one exchange root now holds both user and assistant units; most TTS features stopped finding their targets.
- Approach: repair runs through driftwatch (pack v2) per the churn roadmap docs/plans/churn-resistant-framework/01-ROADMAP.md; edge extension first, then userscript parity.

Status:
- Planned 2026-09-21. Implementation not started.

## Active Phase: Auto-Read Navigation Controls

Goal: Add scoped automatic-reading start skip, single-message looping, separate arrow navigation skip, and editable shortcuts across Edge extension and Tampermonkey userscript.

Requirements:
- Auto-read can skip a configured count of characters, graphemes, words, or sentences at the start of a newly detected ChatGPT assistant message.
- Auto-read can loop only the current ChatGPT assistant message when configured.
- Left/right arrow navigation has its own configurable segment jump, separate from click/auto-read skip.
- All current TTS shortcut keys are editable in settings, and empty values disable the shortcut.
- Edge extension is implemented first, then parity is ported to `Tampermonkey_scripts/`.

Status:
- Planned 2026-06-11.
- Implementation in progress on branch `enhance-tts-functionality`.

Follow-up candidates:
- Per-site adapters with site-specific message detection and heuristic fallback for unknown pages.
- Explicit read modes: newest answer, current visible answer, selected text, clicked paragraph, current ChatGPT message, all assistant messages, only unread/new assistant messages.

Verification:
- Run JavaScript syntax checks on touched Edge and userscript files.
- Run focused repo tests where available.
- Check git diff for unrelated changes before commit.
