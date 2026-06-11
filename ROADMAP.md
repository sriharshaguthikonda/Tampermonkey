# Roadmap

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
