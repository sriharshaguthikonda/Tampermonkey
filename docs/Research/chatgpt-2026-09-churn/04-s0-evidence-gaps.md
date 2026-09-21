# S0 evidence gaps — live probe 2026-09-21 (churn event #2)

Stage S0 write-up for [PLAN.md](../../plans/chatgpt-2026-09-churn/PLAN.md); live DOM evidence in [00-live-dom-probe-2026-09-21.md](./00-live-dom-probe-2026-09-21.md).

Method: user's logged-in Chrome, temporary chat (`/?temporary-chat=true`), agent-authored synthetic prompts only (two tiny code blocks; 12 primes list; web-search one-sentence Python version; one-word colour of a synthetic 16x16 blue PNG). Evidence = counts, attribute names, aria-labels of UI controls. No conversation text. The Chrome window reported `document.visibilityState === "hidden"` throughout (window occluded); that matters for S0.3.

## S0.1 Read-aloud location — ANSWERED
- `button[aria-label="More actions"]` in the response action bar opens a Radix menu: `[role="menu"][data-radix-menu-content]` (no aria-label, no data-testid on the menu).
- Items: 2 × `[role="menuitem"]`, neither has aria-label nor data-testid. One is a timestamp row, the other is the "Read aloud" item — identifiable only by its visible UI label. Native read-aloud still exists, one level deeper than before.
- Feature-10 impact: native-Copy presence check unaffected (Copy is still a direct action-bar button).

## S0.2 Saved conversation, ≥3 exchanges — ANSWERED
- Saved (non-temporary) conversation with 5 exchanges: `[data-turn-key]` = 5, user units 5, assistant units 5, `[data-markdown-text-style="assistant-message"]` = 5, More-actions bars = 5. Unit order `:user` before `:assistant` in every exchange (compareDocumentPosition).
- NEW: in a saved conversation loaded from history, unit keys are `fallback-turn-<n>:<idx>:<role>` (e.g. `fallback-turn-2:3:assistant`), NOT `<uuid>:<idx>:<role>` as in live temporary chat. `data-turn-key` stays `<uuid>`. Role suffix `:user` / `:assistant` is stable in both shapes → `[data-content-search-unit-key$=":user"]` / `$=":assistant"` hold; never parse the prefix.
- `data-message-author-role` = 0; page `[data-testid]` = 21, all of them: `chatgpt-citation` (18, inside exchanges), `chatgpt-library-file-citation` (2, inside exchanges), `app-shell-header-context-menu-surface` (1, header).
- Saved-conversation action bar adds a `Share` button; user unit adds `Share prompt`.
- Sidebar conversation items are `div[role="button"]` inside `div[role="listitem"][data-pinned-content-tab-drop-key="chatgpt:conversation:<uuid>"]`; titles are `span[data-thread-title="true"]`. No `<a href="/c/...">` links in the sidebar any more.

## S0.3 Multiple code blocks — PARTIAL — carried to S4
- Temporary chat, 2 code blocks: `[data-markdown-copy="code-block"]` = 2; saved conversation: 8 wrappers.
- With the window hidden, finished code blocks stayed `pre` > `code` inside the wrapper (pre = 2 / 8), zero `[aria-label="Edit code"]` editors, zero buttons inside the wrapper. The 00-probe (visible window) saw finished code blocks as contenteditable editors. Conclusion: the code block's inner shape depends on hydration/visibility; `codeBlock` must anchor on the wrapper `[data-markdown-copy="code-block"]`, never on `pre`/`code` or the editor.
- Composer disambiguation holds in all observed states: `[contenteditable="true"][role="textbox"]` page-wide = 1 when idle (hidden window) and `form[data-chatgpt-composer] [data-composer-markdown]` = 1.
- Carried to S4: count of `div[contenteditable="true"][role="textbox"][aria-label="Edit code"]` vs composer in a VISIBLE window.

## S0.4 Sidebar "Stop" decoy — ANSWERED
- During streaming: `form[data-chatgpt-composer] button[aria-label="Stop"]` = 1, page-wide `button[aria-label^="Stop"]` = 1 (the same button; not in nav/aside). No sidebar Stop decoy exists in the Sept DOM (temporary chat and saved conversation both 0 outside the form).
- Decision for S1: sidebar Stop decoy = synthetic adversarial fixture per TESTING.md, not a live capture.

## S0.5 Enter-to-submit — ANSWERED
- Real CDP key events with the composer focused: `Enter` inserts a newline (composer length +1, exchange count unchanged, Send stays). `Ctrl+Enter` submits (exchange count 0→1, Stop appears, composer empties). Clicking the form Send button also submits.
- So probe §3.5 was NOT a harness artefact: ChatGPT (for this account) now sends on Ctrl+Enter, and plain Enter is newline. The extension's Enter-to-send feature (`25-prompt-send-part1.js:280`, `handleEnterToSend`) did not fire a send either → S3.8 must restore it by resolving `composer` + `sendButton` (state `composing`) via driftwatch.

## S0.6 Reasoning / thinking blocks — NOT TRIGGERED — carried to S4
- A "think carefully first" prompt on the account's default model produced no extra unit and no index-1 key: units `:0:user` + `:2:assistant`, one `[data-markdown-text-style]` (value `assistant-message`), no buttons/details/summary outside the markdown root inside the assistant unit.
- `70-auto-read.js:321-328` eligibility heuristics read `data-message-author-role` / `data-message-type` (both absent in Sept) → dead as written; eligibility must key on the `assistantUnit` suffix. Visible-reasoning shape still unverified — carried to S4.

## S0.7 Image attachment — ANSWERED
- Exchange with a synthetic image: units still `:0:user` + `:2:assistant`. The image is NOT inside the user unit: it sits inside the exchange, BEFORE the user unit in DOM order, wrapped in a `div[role="button"][aria-haspopup][aria-expanded][aria-controls][data-state]` preview trigger; `img` attrs: `referrerpolicy`, `alt`, `data-state`. User unit has 0 `img`, 0 contenteditable; user-unit buttons: `Copy message`, `Edit message`.
- Impact: userUnit text extraction is unaffected by attachments; any "user bubble" hit-test must not assume the attachment belongs to the user unit.

## S0.8 Unit-key index 1 — ANSWERED
- Over 4 temporary exchanges + 5 saved exchanges: indices seen = 0 (user), 2 (assistant), 3 (assistant, one saved exchange). Index 1 never seen. Indices vary → never parse them; only the role suffix carries meaning.

## S0.9 jsdom `:has()` support — ANSWERED
- jsdom 24.1.3 in driftwatch supports `:has()`, including `:has(> ...)` child combinators (`form:has([data-composer-markdown])` → true; `div:has(> span > button[aria-label="Copy"]):has(> button[aria-label="More actions"])` → true). Pack v2 may use `:has()` freely; the jsdom-blind-strategy risk is closed (R14).

## S0.10 Secondary unverified inventory rows — PARTIAL — carried to S4
- `REFERENCE_SELECTORS` (`50-text.js:120`, value at `00-namespace.js:292`): Sept citation pills are `a[data-testid="chatgpt-citation"]` (inside a bare `span`, with an aria-label) and `chatgpt-library-file-citation`; both still match the existing `[data-testid*="citation"]` part → LIVE. `[data-testid="webpage-citation-pill"]` part is dead.
- `h4.sr-only`: 2 per exchange — one inside the exchange but OUTSIDE the user unit (the "you said" heading), one INSIDE the assistant unit. The heuristic at `50-text.js:347-375` that treats an `h4.sr-only` as part of the user message will not find it inside the user unit.
- `#thread-bottom-container`: 0 on every page → DEAD in all 3 consumers (`80-flow.js:328`, `00-namespace.js:258` ignore list).
- Paste-guard edit box `.bg-token-main-surface-tertiary textarea` (`25-prompt-send-part2.js:252`): 0 in edit mode → DEAD. Edit mode renders a SECOND `form` (no attributes) INSIDE the user unit containing `div[contenteditable="true"][role="textbox"][data-composer-markdown][aria-label="Edit message"]` plus `Cancel` (type=button) and a `Send` submit button WITHOUT aria-label. Replacement check: `[data-turn-key] form [data-composer-markdown]` (edit surface = composer-shaped editor inside an exchange).
- Usage-limit dialog close control (`35-server-tts.js:404`, `button[data-testid="close-button"]`): no limit dialog occurred; never manufactured → still unverified — carried to S4 (observational only). Note data-testid is otherwise gone from the Sept vocabulary except citations/header.

### S0.12 Extension self-service probe — ANSWERED: NO
- The user's browser is Microsoft Edge (Claude in Chrome extension running in Edge). Both `chrome://extensions` and `edge://extensions/` are refused: navigation rewrites to `https://…` and screenshots fail with "Cannot access chrome:// and edge:// URLs". The agent cannot toggle/reload the unpacked extension itself → S4.0's dev-only self-reload hook is REQUIRED.

## Findings for pack v2 and S3

1. `composerForm`: edit mode creates a second `form:has([data-composer-markdown])` inside the exchange (form count 2), so `form:has([data-composer-markdown])` alone is AMBIGUOUS. The main composer form carries `data-chatgpt-composer`, `data-composer-placement` (`home` | `thread`), `data-thread-find-composer="true"`; the edit form has no attributes. Strategy 1 = `form[data-chatgpt-composer]` (count 1 in every state); strategy 2 = `form:has([data-composer-markdown]):not([data-turn-key] form)` (Chrome count 1 during edit mode; jsdom support to be verified in S2). `form[data-type="unified-composer"]` = 0 → DEAD, drop it.
2. `sendButton` inside `composerForm`: `button[type="submit"][aria-label="Send"]` = 1 when composing; the edit form's Send is `button[type="submit"]` WITHOUT aria-label, so it never matches the aria-label strategy — but a bare `button[type="submit"]` strategy would hit it if composerForm were ambiguous.
3. Composer-form buttons (idle, thread): `Add files and more`, `Select ChatGPT model`, `Dictate`, and Send when non-empty. File inputs are exposed as `Attach photos or videos` / `Attach photos` / `Attach files`.
4. Exchange action bar children: `span > button[aria-label="Copy"]`, `span > button[aria-label="Rate response"]`, `button[aria-label="Regenerate response"]`, `button[aria-label="More actions"]` (+ `Share` in saved conversations). A rating prompt with buttons `Yes` / `No` / `Dismiss rating prompt` can appear inside an exchange (decoys for any loose button selector).
5. During streaming the user unit exists alone first (`Copy message` only, no Edit), then the assistant unit appears; the action bar appears only after completion.
6. New keyboard finding (user report, Q&A 2026-09-21): ChatGPT's type-anywhere moves focus to the composer on keydown, so the extension's bubble-phase document hotkeys (Shift+U etc., `85-events.js:65-73`) never fire. Fix in flight: window capture-phase hotkey listener + stopImmediatePropagation for handled keys.
