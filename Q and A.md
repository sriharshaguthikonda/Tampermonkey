# Q and A

## 2026-06-11T22:50:38+05:30

Status: Working.

Current assumptions:
- Implement `skip x` for automatic reading as character skip, not phoneme skip. Browser SpeechSynthesis and current server TTS path do not expose phoneme boundaries; character offsets already exist.
- Keep existing click/selection skip setting separate. New skip setting applies only when auto-read starts a new ChatGPT assistant message.
- Add separate left/right arrow jump option distinct from click/auto-read skip.
- Make existing shortcut keys editable in settings, including empty values to disable a shortcut.

Questions needing user answer:
- None blocking. If you want phoneme-level skipping later, we need a TTS backend that returns phoneme timing/boundaries.

Next:
- Update roadmap/plan docs.
- Implement Edge extension first.
- Port same behavior to Tampermonkey userscript.
- Verify, then commit/push in small logical commits.
