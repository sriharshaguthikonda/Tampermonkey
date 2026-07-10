# Phase A — Repair + evidence (this repo)

Depends: nothing. Blocks: M1, Phase B. Unblocks users NOW.
Binding rules: [AGENT-RULES.md](../AGENT-RULES.md) — especially 19 (raw captures are SECRETS), 25 (end-to-end verify), 26 (capture before fix). Design refs: [00-DESIGN.md](../00-DESIGN.md) D16.

## Context you need (read this, then you can work)

- The 2026-07-10 ChatGPT web update broke paste-anywhere/send: [#19](https://github.com/sriharshaguthikonda/Tampermonkey/issues/19). Users are broken RIGHT NOW.
- The code that breaks: `edge-extension/modules/25-prompt-send-part1.js`. Lines ~16–49 hold two ordered selector chains: PROMPT_SELECTORS (find the composer input) and SEND_SELECTORS (find the send button). The current chain targets `div#prompt-textarea.ProseMirror[contenteditable=true][role=textbox]` with textarea fallback, and send-labeled buttons. One or both no longer match the live DOM.
- The #19 failure mode to never repeat: a loose send-button selector matched the **Dictate/Voice** button and clicked it. Any fix MUST keep the dictation exclusion.
- The same selectors exist in the userscript monolith (repo root `.user.js`, built by `node build.js` from `edge-extension/modules/`). Check `build.js` to see how modules map into the userscript before editing the monolith by hand.
- Existing test pattern: `test_auto_read_navigation_controls.js` in repo root — Node script, no framework, builds a fake DOM, loads module code in a VM, asserts, exits non-zero on failure. Copy that pattern.
- This phase is an EMERGENCY FIX. Do not build the framework, do not create descriptor tables, do not add packages. That is Phase B.

## Prerequisites checklist

- [ ] You are on a feature branch (never `gemini-version`/`main` directly).
- [ ] You can load the unpacked extension in Edge/Chrome (`edge://extensions` → developer mode → load `edge-extension/`).
- [ ] You are logged in to chatgpt.com in that browser.

## Tasks (commit after each; suggested commit messages given)

### Task 1 — Capture raw DOM FIRST
1. Add to `.gitignore` (repo root): `captures/raw/` — commit this line FIRST, before any capture exists. Commit: `chore: git-ignore captures/raw (raw DOM captures are secrets)`.
2. On chatgpt.com (logged in, one conversation open, composer visible), in DevTools console:
   - `copy(document.documentElement.outerHTML)` → save as `captures/raw/2026-07-10/page.html`.
   - Select the composer `<form>` (or nearest container holding input + send + dictate buttons) in Elements → Copy outerHTML → `captures/raw/2026-07-10/composer.html`.
3. NEVER stage anything under `captures/raw/`. It contains session tokens, user identity, conversation text. Verify: `git status` shows nothing from that dir.

### Task 2 — Sanitise → committed fixture
1. Create `fixtures/chatgpt.com/2026-07-10-composer/composer.html` FROM the raw composer subtree by hand-editing a copy:
   - Delete every `<script>`, `<style>`, `<link>`, `<iframe>`.
   - Replace ALL text content with placeholder text — EXCEPT UI labels (button texts, aria-labels, placeholders — those are what selectors match).
   - Strip every `href`/`src`/url-ish attribute value → `#`.
   - Rewrite ids that look session/user-generated (long random strings) → `x1`, `x2`… KEEP structural ids like `prompt-textarea`.
   - Delete any attribute whose value contains an email, username, or token-looking string.
2. Add oracle markers to the sanitised copy (these drive Task 4's test):
   - `data-oracle="composer-input"` on the real composer input element.
   - `data-oracle="send-button"` on the real send button.
   - `data-oracle-negative="dictation"` on the Dictate/Voice button(s) and any other button a loose selector might hit (attach-files, etc. — mark every sibling button).
3. Secret check before committing (all must return nothing):
   ```bash
   grep -riE "(bearer|token|session|sk-[a-z0-9]|@gmail|@outlook|authorization)" fixtures/chatgpt.com/2026-07-10-composer/
   ```
   Plus eyeball the whole file once.
4. Commit: `test(fixtures): sanitised 2026-07-10 composer fixture with oracle markers`.

### Task 3 — Diagnose #19 against the fixture
1. Open the fixture and `25-prompt-send-part1.js:16-49` side by side. For each selector in each chain, answer: does it still match? What attribute/class/structure changed?
2. Write the finding as a comment on issue #19 (what churned, old vs new). One paragraph is enough.
3. No commit (no code change yet).

### Task 4 — Regression oracle test
1. Create repo-root `test_composer_fixture_oracle.js` following the `test_auto_read_navigation_controls.js` VM-harness pattern:
   - Load `fixtures/chatgpt.com/2026-07-10-composer/composer.html` into the harness DOM.
   - Import/extract the PROMPT_SELECTORS + SEND_SELECTORS chains from `25-prompt-send-part1.js` (load the module the same way existing tests load modules).
   - Assert: prompt chain's first matching element has `data-oracle="composer-input"`.
   - Assert: send chain's first matching element has `data-oracle="send-button"`.
   - Assert: NO element matched by the send chain carries `data-oracle-negative` (loop every selector in the chain — not just the winner; a fallback that can hit Dictate is a live bug waiting for the primary to churn).
2. Run it — it should FAIL right now (selectors are broken). That failing run is your baseline evidence.
3. Commit: `test: composer fixture oracle for #19 (red)`.

### Task 5 — Fix prompt/send (extension + userscript)
1. In `25-prompt-send-part1.js`: add the new working primary selector(s) found in Task 3 at the TOP of each chain. KEEP old selectors below as fallbacks. KEEP/extend the dictation exclusion.
2. Run `node test_composer_fixture_oracle.js` → green.
3. `node build.js` → regenerates the userscript. If the monolith holds its own copy of the chains (check!), port the same edit there, rebuild, and confirm parity test passes.
4. Run the full existing gate set (all must pass):
   ```bash
   node --check edge-extension/modules/25-prompt-send-part1.js
   node test_composer_fixture_oracle.js
   node test_auto_read_navigation_controls.js
   node test_userscript_navigation_skip_parity.js
   node test_voicelink_integration.js
   ```
5. Commit: `fix(chatgpt): #19 paste/send selectors for 2026-07-10 DOM (fallbacks + dictation exclusion kept)`.

### Task 6 — Verify live (AGENT-RULES 25)
1. Reload the unpacked extension. On chatgpt.com: paste text anywhere → composer populated; trigger send → message sends; Dictate button NOT activated; TTS auto-read still reads the reply.
2. Copy the relevant console/log lines as evidence.
3. Post to `Q and A.md`: gate commands + one-line results + evidence snippet + "awaiting user confirm on #19".

## Acceptance gates (all required)
- `node test_composer_fixture_oracle.js` green; the four pre-existing suites green.
- Live smoke evidence posted. **DONE-gate: user confirms paste/send works on chatgpt.com** (close #19 only after that).
- `captures/raw/` git-ignored before first capture; committed fixture passed the grep + eyeball secret check.
- Diff contains ONLY: gitignore line, fixture, one test, selector edits. No new modules, no shim, no descriptor table, no package.

## If things go wrong
- Selector fix works on fixture but not live → the fixture is stale or you sanitised away a load-bearing attribute; recapture (Task 1) and re-diff.
- Can't find any stable attribute for send → prefer form semantics: the submit-capable button inside the composer `<form>` (`button[type=submit]`, `btn.form === input.form`) over class names.
- Existing tests fail for unrelated reasons → STOP, write it in Q and A.md with your default, continue only on unblocked tasks (AGENT-RULES 6).
