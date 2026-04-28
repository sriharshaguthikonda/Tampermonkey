# Tampermonkey — Agent Entry Point

## Active work

- **Open issues:** see [`TODO.md`](./TODO.md) for P0/P1-sorted index, or [GitHub Issues](https://github.com/sriharshaguthikonda/Tampermonkey/issues).
- **Working branch:** `enhance-tts-functionality` (non-default; default is `gemini-version`).

## Implementation order (required)

- For feature/bug changes that affect both codepaths, implement in `edge-extension/` first.
- Then translate/port the same change to `Tampermonkey_scripts/`.
- Keep behavior parity unless a platform-specific difference is explicitly required.

---

# Tampermonkey Update Workflow (GitHub Raw)

This repo uses GitHub raw URLs as the update source for Tampermonkey. The goal is:
`git push` -> Tampermonkey detects a higher `@version` -> auto-update installs.

## Key facts (from upstream docs/behavior)
- Update checks use the stored install URL unless `@updateURL`/`@downloadURL` are set.
- `@updateURL` is used for **checking** the version; `@downloadURL` is used for the **actual download**.
- Tampermonkey requires a higher `@version` to update.
- `file://` URLs do **not** update; use HTTPS.
- Optional: a `*.meta.js` file can be used to reduce bandwidth; otherwise you can point `@updateURL` at the full userscript.

## What to put in the userscript header
Add or keep these lines in the metadata block:

```js
// @version      2.5.1
// @updateURL    https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.user.js
// @downloadURL  https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.user.js
```

Notes:
- Prefer HTTPS to avoid blocked updates (some engines require secure update URLs by default).
- If the filename has spaces or special characters (like `&`), URL-encode them (`%20`, `%26`).
- Best practice is a `.user.js` filename, but a raw `.js` can still work if installed via Tampermonkey.

## Recommended local process
1. Edit the script.
2. **Bump `@version`** (e.g., `2.5.1`, `2.5.2`, etc.).
3. Push to GitHub.
4. In Tampermonkey, ensure updates are enabled for the script.

## Optional: split meta for faster checks
If the script grows large, add a `*.meta.js` file that only contains the metadata block, and point:

```js
// @updateURL   https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.meta.js
// @downloadURL https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.user.js
```

## Repo-specific reminder
Current script file (needs URL encoding for spaces and `&`):

```
ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js
```

If you choose to rename it to `*.user.js`, update both the file path and metadata URLs accordingly.

## Git hygiene rules (always follow)
- Commit often in small, focused chunks (one logical change per commit).
- Use clear commit messages in imperative style (example: `Add profile-based local defaults`).
- Before every push, sync first:
  1. `git fetch origin`
  2. `git pull --rebase origin <your-branch>` (or `git pull --rebase`)
- Resolve conflicts locally, re-run quick checks, then push.
- Do not mix unrelated files in the same commit.
- Avoid force-push on shared branches unless explicitly coordinated.
