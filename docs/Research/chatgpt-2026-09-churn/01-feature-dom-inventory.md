# Feature -> chatgpt.com DOM dependency inventory (Sept 2026 churn)

Scope: `edge-extension/modules/*.js` (26 content-script modules, manifest order in
`edge-extension/manifest.json:44-71`) plus the parity userscript
`Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js`
(confirmed as the live parity target via `test_userscript_navigation_skip_parity.js:7`).
Baseline for delta: `docs/plans/churn-resistant-framework/RECON-codex-2026-07-10.md`.
Live-DOM evidence: `docs/Research/chatgpt-2026-09-churn/00-live-dom-probe-2026-09-21.md`
(temporary-chat probe, 2026-09-21, no page text captured — cited below as "probe §N").
Read-only research; no source files edited.

## 1. Feature list (derived from code, cross-checked against `edge-extension/README.md`)

| # | Feature | Primary module(s) |
|---|---|---|
| 1 | Text-to-speech playback / navigation (sentence nav, crosshair start, pointer arrow) | `75-queue.js`, `80-flow.js`, `90-scroll.js`, `45-paragraph.js` |
| 2 | Word/sentence highlighting (CSS Custom Highlight API + class fallback) | `60-highlight.js`, `65-prewrap.js` |
| 3 | Auto-read new assistant messages | `70-auto-read.js` |
| 4 | Selection-seek / click-to-start-reading | `55-selection.js`, `80-flow.js` |
| 5 | Smart Copy / transcript export | `20-smart-copy-part1.js`, `-part2.js`, `-part3.js` |
| 6 | Prompt send / paste-anywhere (composer injection + send click) | `25-prompt-send-part1.js` |
| 7 | Prompt history navigation + native-Enter/send capture | `25-prompt-send-part2.js` |
| 8 | Global paste guard (blocks paste-anywhere while a dialog/menu/edit-box is open) | `25-prompt-send-part2.js` |
| 9 | Cross-tab playback lock | `15-playback-lock.js` (no chatgpt DOM dependency) |
| 10 | Custom copy-button injection (fallback when native per-turn copy actions are absent) | `35-server-tts.js` |
| 11 | Double-click-to-edit shortcut | `35-server-tts.js`, wired from `15-playback-lock.js:297` |
| 12 | Usage-limit warning auto-close | `35-server-tts.js`, wired from `15-playback-lock.js:306` |
| 13 | Driftwatch selector self-audit (diagnostics only, no user action) | `25-prompt-send-part1.js:59-88` |
| 14 | Diagnostics / debug logging (`window.__TTSDiag`) | `05-diagnostics.js` |
| 15 | Emoji-skip for speech (leading speaker emoji stripped from TTS text) | `40-voice.js` |
| 16 | ChatGPT-page text-selection styling + own UI injection (panels, pointer) | `87-ui.js`, `10-lifecycle.js` |
| 17 | Text extraction pipeline (reference/citation exclusion, user-message detection, archived-HTML fallback) | `50-text.js` |
| 18 | Shared MutationObserver bus (infra for #3, #5, #11, #12, #16) | `08-observer-bus.js` |

Features 9 and 13-14 have no chatgpt.com DOM dependency and are excluded from the
dependency table below (playback-lock is cross-tab via `chrome.runtime`; diagnostics
reads its own ring buffer; the audit *consumes* driftwatch anchors already covered
under features 6-7).

## 2. Dependency table

70 rows. `purpose` values: find / click / observe / read-attr / read-text / exclude /
inject-into. Driftwatch column: `y (anchor.strategy-id)` or `n`. Userscript column:
exact `file:line` in the `.js` file above, or `n` (confirmed absent by grep — see §4).

### 2.1 Prompt send / paste-anywhere (feature 6) — driftwatch-routed anchors

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 6 | `25-prompt-send-part1.js:35` -> `driftwatch/packs/chatgpt.com.json:37` | `#prompt-textarea` | find | y (composer.prompt-textarea-id) | n |
| 6 | `25-prompt-send-part1.js:35` -> `chatgpt.com.json:38` | `[contenteditable="true"][role="textbox"]` | find | y (composer.contenteditable-textbox) | n |
| 6 | `25-prompt-send-part1.js:35` -> `chatgpt.com.json:39` | `div#prompt-textarea[contenteditable="true"]` | find | y (composer.prompt-textarea-contenteditable) | n |
| 6 | `25-prompt-send-part1.js:50` -> `chatgpt.com.json:51` | `button[data-testid="send-button"]` | click | y (sendButton.send.testid) | n |
| 6 | `25-prompt-send-part1.js:50` -> `chatgpt.com.json:52` | `button#composer-submit-button:not([disabled])` | click | y (sendButton.send.composer-submit-id) | n |
| 6 | `25-prompt-send-part1.js:50` -> `chatgpt.com.json:53` | `form button[aria-label^="Send"]:not([disabled])` | click | y (sendButton.send.aria-label-prefix) | n |
| 6/13 | `25-prompt-send-part1.js:69` -> `chatgpt.com.json:65` | `form[data-type="unified-composer"] #composer-submit-button[data-testid="stop-button"]` | observe (audit) | y (stopButton.stop.composer-submit-id) | n |
| 6/13 | `25-prompt-send-part1.js:69` -> `chatgpt.com.json:66` | `main form button[aria-label^="Stop"]:not([disabled])` | observe (audit) | y (stopButton.stop.aria-label-prefix) | n |

### 2.2 Prompt send / paste-anywhere (feature 6) — hardcoded fallback arrays (used only if driftwatch resolves nothing usable)

| Feature | Module file:line | Selector | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 6 | `25-prompt-send-part1.js:103` | `#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:104` | `div.ProseMirror[contenteditable="true"][aria-label="Chat with ChatGPT"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:105` | `div[role="textbox"][contenteditable="true"][aria-label="Chat with ChatGPT"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:106` | `form div.ProseMirror[contenteditable="true"][data-virtualkeyboard="true"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:107` | `#prompt-textarea[contenteditable="true"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:108` | `div[contenteditable="true"][id="prompt-textarea"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:109` | `div[data-testid="prompt-textarea"][contenteditable="true"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:110` | `textarea#prompt-textarea` | find | n | n |
| 6 | `25-prompt-send-part1.js:111` | `textarea[name="prompt-textarea"]:not([style*="display: none"])` | find | n | n |
| 6 | `25-prompt-send-part1.js:112` | `textarea[data-testid="prompt-textarea"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:113` | `textarea[aria-label="Chat with ChatGPT"]` | find | n | n |
| 6 | `25-prompt-send-part1.js:125` | `form button[aria-label="Send prompt"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:126` | `form button[aria-label="Send message"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:127` | `form button[data-testid="send-button"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:128` | `button.composer-submit-button-color[aria-label="Send prompt"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:129` | `button.composer-submit-button-color[aria-label="Send message"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:130` | `button[aria-label="Send prompt"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:131` | `button[aria-label="Send message"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:132` | `button[data-testid="send-button"]` | click | n | n |
| 6 | `25-prompt-send-part1.js:133` | `button.btn.relative.btn-primary:not([aria-label="Dictate button"])` | click | n | n |

### 2.3 Diagnostics app-root probe (observe only)

| Feature | Module file:line | Selector | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 14 | `05-diagnostics.js:54` | `#__next, #root, main, [data-testid="conversation-turn"]` | observe | n | n (extension-only module) |

### 2.4 Auto-read new assistant messages (feature 3)

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 3 | `70-auto-read.js:22` | `[data-message-author-role="assistant"], section[data-turn="assistant"]` | observe (bus subscription) | n | y `:2748-2764` (equivalent, inline) |
| 3 | `70-auto-read.js:30-32` | `[data-message-author-role="assistant"]` (matches/closest) | find | n | y `:2762-2764` |
| 3 | `70-auto-read.js:57` | `[data-message-author-role="assistant"]` (query-all latest) | find | n | y `:2798` |
| 3 | `70-auto-read.js:321` | `data-message-author-role !== 'assistant'` guard | read-attr | n | y `:2878` |
| 3 | `70-auto-read.js:323` | `data-message-type` regex `/thinking\|analysis\|tool\|status/` | read-attr (non-selector eligibility heuristic) | n | not checked |
| 3 | `70-auto-read.js:325` | `aria-label` contains `"thinking"` | read-attr | n | not checked |
| 3 | `70-auto-read.js:328` | text-prefix regex `/^(thinking\|analyzing\|searching)\b/i` | read-text (non-selector heuristic) | n | not checked |
| 3 | `70-auto-read.js:343` | `AUTO_READ_STABLE_MS` mutation-quiet debounce | observe (completion signal — **not** stop-button based) | n | not checked |

### 2.5 Smart Copy / transcript (feature 5)

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 5 | `20-smart-copy-part1.js:39` | `[data-message-author-role="assistant"], [data-message-author-role="user"]` | observe (surface-available check) | n | y `:362` |
| 5 | `20-smart-copy-part1.js:40` | `section[data-turn="assistant"], section[data-turn="user"]` | observe | n | y `:363` |
| 5 | `20-smart-copy-part1.js:60` | `element.closest('[data-message-author-role]')` | read-attr | n | y `:383-384` |
| 5 | `20-smart-copy-part1.js:67` | `element.closest('section[data-turn]')` | read-attr | n | y `:390` |
| 5 | `20-smart-copy-part1.js:77` | `.whitespace-pre-wrap, .markdown` | read-text (extraction root) | n | y `:400` |
| 5 | `20-smart-copy-part1.js:82` | `closest('section[data-testid*="conversation-turn-"], [data-testid*="conversation-turn-"]')` | read-attr | n | y `:405` |
| 5 | `20-smart-copy-part1.js:85` | regex `/conversation-turn-(\d+)/i` on testid | read-attr (non-selector parse) | n | y `:408` |
| 5 | `20-smart-copy-part1.js:102-109` | 8-entry content allowlist (`[data-message-author-role]`, `.markdown`, `.whitespace-pre-wrap`, `section[data-turn]` combinations) | find (native-selection allowlist) | n | y `:425-432` |

### 2.6 Prompt history + global paste guard (features 7-8)

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 7 | `25-prompt-send-part2.js:37` | `data-message-author-role === 'user'` | read-attr | n | n |
| 7 | `25-prompt-send-part2.js:38` | `.whitespace-pre-wrap` (preferred text node) | read-text | n | n |
| 7 | `25-prompt-send-part2.js:47` | `[data-message-author-role="user"]` (hydrate history) | find | n | n |
| 8 | `25-prompt-send-part2.js:241` | `[role="dialog"]` visible-check | observe (blocking guard) | n | n |
| 8 | `25-prompt-send-part2.js:249` | `[role="menu"], [role="listbox"]` visible-check | observe (blocking guard) | n | n |
| 8 | `25-prompt-send-part2.js:252` | `.bg-token-main-surface-tertiary textarea` | observe (blocking guard, edit-box) | n | n |

### 2.7 Double-click-to-edit (feature 11) and usage-limit auto-close (feature 12)

| Feature | Module file:line | Selector | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 11 | `35-server-tts.js:372` | `.group\/conversation-turn, [data-message-author-role="user"]` | find (event.target.closest) | n | n |
| 11 | `15-playback-lock.js:297` | `.group\/conversation-turn, .group\/turn-messages, [data-message-author-role]` | observe (bus subscribe) | n | n |
| 11 | `35-server-tts.js:374` | `button[aria-label="Edit message"]` | find/click-target | n | n |
| 12 | `35-server-tts.js:404` | `button[data-testid="close-button"]` | find/click-target | n | n |
| 12 | `15-playback-lock.js:306` | `button[data-testid="close-button"]` | observe (bus subscribe) | n | n |

### 2.8 Custom copy-button injection (feature 10)

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 10 | `35-server-tts.js:280` | `[data-testid="copy-turn-action-button"], button[aria-label="Copy message"]` | observe (native-action presence check, gates injection) | n | n |
| 10 | `35-server-tts.js:290-300` | reuses feature-5 role/content-node resolution (rows in §2.5) | inject-into (`insertAdjacentElement('afterend', row)`) | n | n |

### 2.9 Highlighting (feature 2) and selection-seek (feature 4)

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 2 | `60-highlight.js:114,121` | `span[data-tts-word="1"]` (own-injected, read back to unwrap) | read/observe | n | y `:2449,2456` |
| 2 | `60-highlight.js:17`; `90-scroll.js:106`; `87-ui.js:94` | `.tts-current-sentence`, `.tts-current-word` (own classes) | read/observe | n | y `:2391,4196,4581` |
| 4 | `55-selection.js:165` | `CONFIG.CANDIDATE_SELECTORS` consumed via `querySelectorAll` | find | n | y `:2363` (different string, see §4) |
| 4 | `55-selection.js:157` | `CONFIG.IGNORE_SELECTORS` consumed via `closest` | exclude | n | y `:2349` |
| 4 | `80-flow.js:328` | `#thread-bottom-container` | exclude (click-to-read ignore-guard) | n | y `:3889` |

### 2.10 Text extraction pipeline (feature 17)

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 17 | `50-text.js:120` | `CONFIG.REFERENCE_SELECTORS` = `[data-testid="webpage-citation-pill"], [data-testid*="citation"], .webpage-citation-pill, .citation-pill, [data-source], cite` | exclude/read | n | n (grep confirms no citation/reference handling in userscript) |
| 17 | `50-text.js:338` | `CONFIG.USER_MESSAGE_SELECTORS` = `[data-message-author-role="user"], section[data-turn="user"], [data-turn="user"]` | read-attr (`isUserMessageElement`) | n | y (inline, not CONFIG-driven) `:362-390` |
| 17 | `50-text.js:347-375` | `h4.sr-only` + "You said" text-prefix heuristic (archived/saved-HTML fallback role detection) | read-text | n | n (grep confirms absent) |

### 2.11 UI injection / own-DOM (feature 16) and shared config (infra)

| Feature | Module file:line | Selector / assumption | Purpose | Driftwatch | Also in userscript |
|---|---|---|---|---|---|
| 16 | `00-namespace.js:256` | `CONFIG.CANDIDATE_SELECTORS` = `p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, .markdown, article` | find (readable-node source of truth) | n | y (different string) `:120` |
| 16 | `00-namespace.js:258` | `CONFIG.IGNORE_SELECTORS` (incl. `#thread-bottom-container`, `#content-root`) | exclude (source of truth) | n | y (same string) `:122` |
| 16 | `87-ui.js:91,131,240,250` | own ids `#tts-pointer`, `#tts-control-panel`, `#tts-diagnostics-panel`, `#tts-progress-panel` appended to `document.body` | inject-into | n/a | y (own UI, structurally present) |
| 16 | `87-ui.js:47-54` | forced `user-select` CSS targeting `[data-message-author-role], [data-message-author-role] *, section[data-turn], section[data-turn] *, [data-message-author-role] .markdown, [data-message-author-role] .whitespace-pre-wrap, section[data-turn] .markdown, section[data-turn] .whitespace-pre-wrap` | inject-into (style targeting chatgpt nodes) | n | y `:4149-4156` |
| 1/16 | `10-lifecycle.js:59-60` | hostname check `chat.openai.com` / `chatgpt.com` (site-profile gate for all of the above) | observe (context detection, not a DOM selector) | n | y (equivalent gate present) |
| 15 | `40-voice.js:250` | `[role="img"][aria-label], img[alt], [aria-label][data-testid*="emoji"]` | read-attr (leading speaker emoji strip) | n | y `:1626` |
| infra | `08-observer-bus.js:14-30` | own-UI `IGNORE_SELECTOR` list (`.tmx-copy-row`, `[data-tmx-control]`, `#tts-*` ids, etc.) | exclude (mutation-noise filter for the extension's *own* injected nodes, not a chatgpt assumption) | n/a | n (userscript predates the shared observer bus, issue #12) |

Row count: **73**. Driftwatch-routed rows: **8** (all under composer/sendButton/stopButton
anchors, §2.1). The `assistantMessage` and `conversationTurn` anchors exist in the pack
(`chatgpt.com.json:5-23`) but **no extension module calls `dw.resolve('conversationTurn'|
'assistantMessage', ...)`** — grep of `edge-extension/modules/*.js` for `resolve(.'conversationTurn'` /
`resolve(.'assistantMessage'` returns zero hits outside `22-driftwatch.js` itself. Features
3/5/10/17 still hardcode `data-message-author-role`/`section[data-turn]` directly (§2.4-2.5,
§2.8, §2.10) even though driftwatch ships anchors that could serve them — that migration
(commit 61ff874, 2026-07-27) only covered composer + send button.

## 3. Driftwatch coverage

Pack: `driftwatch/packs/chatgpt.com.json` (71 lines), 6 anchors. Live status per
probe §1 (temporary chat, 2026-09-21):

| Anchor | Strategies (pack order) | Live verdict (probe §1) | Consumed by extension? |
|---|---|---|---|
| `conversationTurn` | testid-prefix / `data-turn-id` / `data-turn` / legacy `article` | **broken** — 0/0/0/0 | no (defined, unused) |
| `assistantMessage` | `data-message-author-role="assistant"` / `data-turn="assistant"` | **broken** — 0/0 | no (defined, unused) |
| `copyResponseButton` | testid `copy-turn-action-button` / `aria-label^="Copy"` inside turn | **broken** — depends on `conversationTurn`, which is broken | no (defined, unused) |
| `composer` | `#prompt-textarea` / `[contenteditable][role=textbox]` / `div#prompt-textarea[...]` | **ambiguous-in-effect** — strategy 2 (0/**2**/0) also matches the new in-message code-block editor (probe §3.3) | yes — §2.1 rows 1-3 |
| `sendButton` | testid / `#composer-submit-button` / `aria-label^="Send"` | **fail-closed to strategy 3** — 0/0/**1** | yes — §2.1 rows 4-6 |
| `stopButton` | `#composer-submit-button[data-testid=stop-button]` / `aria-label^="Stop"` | **degraded to strategy 2** — 0/**1** | yes (audit-only) — §2.1 rows 7-8 |

Net: driftwatch is currently keeping `composer` and `sendButton` functional in production
only because of their last-resort, least-specific strategies (`[contenteditable][role=textbox]`
and `aria-label^="Send"`); both anchors are one further redesign away from their
`degradeLimit: 1` fail-closed state. `conversationTurn`/`assistantMessage`/`copyResponseButton`
are already fully broken and were never wired into any extension module, so their breakage
has zero present-day effect on shipped features — it only means the July 2026 investment in
those three anchors bought no coverage for the modules that actually needed them (auto-read,
smart-copy, copy-injection, text extraction — §2.4, §2.5, §2.8, §2.10).

## 4. Delta vs `RECON-codex-2026-07-10.md`

**Code-level delta (extension source, July 10 -> today):** none of the selector strings
changed. RECON's own citations match current line numbers exactly:
`00-namespace.js:256/258/289` (RECON:252-254), the 11-entry prompt-area array and 9-entry
send-button array (RECON:259-278), and the auto-read/observer selectors (RECON:289-290,
419-422) are byte-identical to what's in the tree today. `git log -S` on the prompt-area,
send-button, and CANDIDATE/IGNORE/USER_MESSAGE/REFERENCE selector strings shows no commits
touching them since or before the recon within the window checked. The two real code changes
since July 10 are:
1. Driftwatch wrapper added for composer/sendButton (commits `61ff874`, `a2866c4`,
   2026-07-27) — RECON predates driftwatch entirely (zero mentions in the recon doc).
2. `[data-state="open"]` dropped from the paste-guard's blocking-element check (commit
   `5f05938`, 2026-07-15, refs #19) — `25-prompt-send-part2.js:244-248` documents why
   (Radix keeps `data-state="open"` on persistent chrome, so the guard always fired).

**Live-DOM delta (chatgpt.com production, July -> Sept 2026):** this is the actual churn,
and RECON — being a static-analysis recon of the extension, not a live-DOM capture — has no
baseline to diff it against directly. Per probe §1-§3, since driftwatch's July composer/send
migration:
- `data-testid` is gone from the composer, send button, and turn/message level (page-wide
  `[data-testid]` count on a fresh chat = 1, an unrelated header menu — probe §1).
- `id="prompt-textarea"` is gone from the composer.
- `aria-label` on the composer changed from `"Chat with ChatGPT"` to `"Ask ChatGPT"`
  (confirmed live, this session, via `javascript_tool` before the probe file existed).
- `aria-label` on the send button is exactly `"Send"`, not `"Send prompt"` / `"Send message"`.
- `section[data-turn]` / `article[data-testid^="conversation-turn-"]` no longer exist
  anywhere in the DOM — replaced by `[data-turn-key]` (one per **exchange**, not per
  message) with `[data-content-search-unit-key$=":user"|":assistant"]` children (probe §2).
- `.markdown` / `.prose` no longer exist; the assistant text root is now
  `[data-markdown-text-style="assistant-message"]` (probe §2).
- The response `Copy` button is no longer inside the message/turn element; it lives in a
  sibling "exchange action bar" alongside Rate/Regenerate/More actions (probe §3.2) — this
  breaks any `closest(turn).querySelector('button[aria-label^=Copy]')` pattern (used nowhere
  in this extension currently, since feature 10's native-check at `35-server-tts.js:280`
  queries the whole document, not a turn-scoped subtree — but see risk #7 below for turn
  scoping used elsewhere).

## 5. Top risk list (ranked, highest first)

1. **`conversationTurn`/`assistantMessage`/`data-message-author-role`/`section[data-turn]` are empirically confirmed dead** (probe §1-§2: 0 matches for every strategy), and they are the selectors that auto-read (§2.4), smart-copy (§2.5), copy-button injection (§2.8), and text extraction (§2.10) all key off directly — this is the highest-blast-radius break and it is **not** covered by any driftwatch anchor in active use.
2. **The `sendButton` anchor is fail-closed to a single last-resort strategy** (`aria-label^="Send"`, probe §1) with `degradeLimit: 1` already spent — any further label change (e.g. localization, or ChatGPT reusing "Send" elsewhere in the form) breaks prompt-send/paste-anywhere (feature 6) with no remaining fallback in the pack, and the hardcoded array (§2.2 rows 12-20) is *also* dead since none of its `aria-label`/`data-testid`/`id` variants match live DOM.
3. **`composer` anchor's surviving strategy (`[contenteditable="true"][role="textbox"]`) is now ambiguous**: probe §1/§3.3 shows it matches 2 elements on any page with a code block (the real composer and the in-message code-block editor), so `dw.resolve('composer')` can silently hand back the wrong element — `pick`/`degradeLimit` policy in the pack does not disambiguate by `form` scope.
4. **Turn ≠ message is now a false invariant baked into the code.** Every "closest turn -> read role -> read content" chain (smart-copy §2.5, copy-injection §2.8, double-click-edit §2.7) assumes one element carries both a turn boundary and a role; live DOM has role encoded only in a unit-key suffix (`:user`/`:assistant`) two levels below a shared exchange root (probe §3.1) — this is a logic break, not just a selector break, so patching selector strings alone will not fix it.
5. **`copyResponseButton`'s `inside:conversationTurn` requirement is structurally broken**, independent of the anchor's own selectors, because the response Copy button now lives in a sibling action-bar region outside the message unit (probe §3.2) — any future `inside:turn` scoping added to feature 10 or 11 would silently fail the same way.
6. **`REFERENCE_SELECTORS` (`50-text.js:120`) and the h4.sr-only "You said" heuristic (`50-text.js:347-375`) are unverified against live DOM this session** and were not part of the RECON baseline either — genuinely unknown risk, and citation-pill markup is exactly the kind of surface a redesign touches first.
7. **`data-testid*="conversation-turn-"` used for turn-index parsing (`20-smart-copy-part1.js:82,85`) is confirmed dead** (probe §1: testid-prefix strategy = 0 matches), silently degrading `getConversationTurnIndex()` to always return non-matching/`NaN`, which downstream smart-copy ordering logic does not appear to null-check explicitly.
8. **`#thread-bottom-container` (3 independent consumers: `00-namespace.js:258` IGNORE_SELECTORS, `80-flow.js:328` click-guard, and the userscript equivalent) was not re-verified live this session** — probe did not check it; if removed, `80-flow.js:328`'s guard silently stops firing (fail-open, not fail-closed) rather than throwing, so the symptom would be subtle (clicks inside a removed structural element now trigger reading-start) rather than an obvious break.
9. **The paste-guard's blocking-element check (`25-prompt-send-part2.js:241,249,252`) relies on ARIA role presence (`[role="dialog"]`, `[role="menu"]`, `[role="listbox"]`) which is comparatively redesign-resistant**, but `.bg-token-main-surface-tertiary textarea` (line 252) is a raw Tailwind-generated class name — exactly the pattern that broke composer/send elsewhere — and was not live-checked this session.
10. **Driftwatch's own `audit()` only runs once per page load and only logs anchor names** (`25-prompt-send-part1.js:59-88`) for the 3 anchors actually wired in; there is no live telemetry surfacing the `conversationTurn`/`assistantMessage`/`copyResponseButton` breakage from risk #1 to any diagnostics consumer, so the highest-impact break in this list is also the one the extension's own audit tooling cannot currently see.
