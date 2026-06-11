# Plan: Auto-Read Navigation Controls

## Scope

Codepaths:
- `edge-extension/` first.
- `Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js` second.

## Tasks

1. Add Edge defaults, settings UI, storage plumbing, and content-script config for:
   - `autoReadStartSkipChars`
   - `autoReadStartSkipAmount`
   - `autoReadStartSkipUnit`
   - `autoReadLoopCurrentMessage`
   - `navArrowJumpSegments`
   - editable hotkey fields
2. Add Edge runtime behavior:
   - auto-read starts from message-local character offset
   - auto-read skip unit resolves character, grapheme, word, and sentence counts to the existing character-offset playback API
   - optional loop is limited to the current assistant message
   - left/right arrows use `navArrowJumpSegments`
   - empty hotkeys do not match
3. Port equivalent defaults, overlay/settings behavior, and runtime behavior to Tampermonkey userscript.
4. Verify with syntax checks and focused tests.
5. Commit/push docs and code as small logical commits.

## Non-Goals

- Phoneme-level skip. Current browser/server TTS APIs in this repo do not expose phoneme boundaries.
- Broad refactor of TTS playback.
