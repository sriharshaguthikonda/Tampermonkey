# 0001 — Token-anchored class selectors; settings parity via export/import

Status: accepted 2026-10-08. Plan: [docs/plans/canvas-autoread-profiles/PLAN.md](../plans/canvas-autoread-profiles/PLAN.md).

## Decision 1 — never match class names by substring

Pack ignore selectors must anchor to class tokens: `[class~="code"]`, `[class^="code-"]`, `[class*=" code-"]`. The bare `[class*="code"]` matched the Tailwind token `--codex-base-accent` on `div[data-testid="chatgpt-writing-block"]` and hid the whole ChatGPT email card from the reader. Fixed upstream in driftwatch `packs/chatgpt.com.json` (4e95be3) with a lint test that rejects any bare `[class*=…]` selector in a pack; `22-driftwatch.js` is re-vendored from the built `dist/driftwatch.js`, never hand-edited (`tools/check-stamp.mjs` verifies).

Rejected: hand-patching the generated `22-driftwatch.js` (next re-vendor erases it); site-specific allow-list for the card only (leaves the same trap for any other `codex`/`codeblock`-like class).

## Decision 2 — the live editor is read-only for us

The email card body is a `contenteditable` draft and the Subject is a `textarea`. The reader may read them, and may highlight the body with the CSS Custom Highlight API, but must never insert nodes (word spans) or change a value. Selector: `closest('textarea, [contenteditable]:not([contenteditable="false"])')`. A blank Subject is skipped.

## Decision 3 — settings parity across Edge profiles

Settings live in `chrome.storage.sync`, which does not sync for unpacked extensions, so each Edge profile keeps its own copy (observed: auto-read ON in one profile, OFF in two). Different profiles also load different builds (source vs gitignored `dist/prod`).

Now: options-page Export / Import settings JSON (plain JSON, known keys only, type-checked, merged over defaults). Later, if drift keeps biting: ship defaults in the build and persist only diffs. Not done: a background sync service or a remote store (new infrastructure for a single-user tool).

Consequence: after any source change, rebuild (`node build.js`) and reload the extension in every profile that loads `dist/prod`.
