# Row triage — 73 inventory rows -> route-via-driftwatch / own-UI-keep / delete

Purpose: PLAN.md S3.2 — classify every DOM-dependency row from
[01-feature-dom-inventory.md](01-feature-dom-inventory.md) so S3.3-S3.12 migrate the right
rows and delete the rest. Date: 2026-09-21.

Three classes: **route-via-driftwatch** = the row's element lookup moves to a
`dw.resolve(anchor, scope)` call against a pack-v2 anchor, or to a new pack-data key when the
row is a site-specific list/value rather than a single element. **own-UI-keep** = a genuinely
local invariant (own panels/ids, observer-bus noise filter, hostname gate, Dictate/Voice
exclusion, ARIA-role paste guards, or a generic/native extraction rule) that stays in code
unchanged. **delete** = the selector is confirmed 0-match against the live Sept DOM (probe /
S0 evidence) and is removed outright, not commented out.

R7 relabel rule (D-S3, binding): rows carrying site-specific selector knowledge — Edit button,
citation pills, exclusion lists, legacy candidate/fallback arrays — are route-via-driftwatch /
pack-data even when the code "looked own"; only the six named local-invariant categories above
stay in code.

Source of the 73-row count: [01-feature-dom-inventory.md](01-feature-dom-inventory.md) §2
footer ("Row count: **73**"); verified by re-counting every subsection table below (8+20+1+8+8+6+5+2+5+3+7 = 73).
Pack-v2 anchor names verified live against `C:/Windows_software/driftwatch/packs/chatgpt.com.json`
(`version: 2`, read 2026-09-21) — anchors that already exist there: `exchangeRoot`, `userUnit`,
`assistantUnit`, `assistantMarkdownRoot`, `responseActionBar`, `codeBlock`, `copyResponseButton`,
`editMessageButton`, `composerForm`, `composer`, `sendButton`, `stopButton`, plus legacy-only
`assistantMessage`/`conversationTurn`. The pack has no `data` section yet — every "pack data:
<key>" cell below names a key that does not exist in the file today (footer list).

---

### 2.1 Prompt send / paste-anywhere — driftwatch-routed (feature 6, was §2.1 in 01)

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `25-prompt-send-part1.js:35` | 6 | `#prompt-textarea` (composer strategy 3, id) | route-via-driftwatch | composer (`composer.prompt-textarea`) | S3.8 — done (S3a) | kept as trailing Jul fallback in pack v2 per D-S2; still resolved via `dw.resolve('composer', document)` |
| `25-prompt-send-part1.js:35` | 6 | `[contenteditable="true"][role="textbox"]` (bare, composer strategy 2) | route-via-driftwatch | composer | S3.8 — done (S3a) | this exact bare strategy is DELETED from pack v2 (D-S2: ambiguous with code-block editor, probe §3.3); call site still routes via driftwatch, now resolves through `composer.markdown-textbox`/`composer.prompt-textarea` scoped `inside:composerForm` |
| `25-prompt-send-part1.js:35` | 6 | `div#prompt-textarea[contenteditable="true"]` (composer strategy 1) | route-via-driftwatch | composer (`composer.prompt-textarea-div`) | S3.8 — done (S3a) | kept as trailing fallback in pack v2 |
| `25-prompt-send-part1.js:50` | 6 | `button[data-testid="send-button"]` (sendButton strategy) | route-via-driftwatch | sendButton (`send.testid`) | S3.8 — done (S3a) | retained as trailing fallback; pack v2 puts `send.submit-aria` FIRST (Sept-correct) per D-S2 |
| `25-prompt-send-part1.js:50` | 6 | `button#composer-submit-button:not([disabled])` | route-via-driftwatch | sendButton (`send.composer-submit-id`) | S3.8 — done (S3a) | retained as trailing fallback, now `inside:composerForm` |
| `25-prompt-send-part1.js:50` | 6 | `form button[aria-label^="Send"]:not([disabled])` | route-via-driftwatch | sendButton (`send.aria-prefix`) | S3.8 — done (S3a) | retained as trailing fallback |
| `25-prompt-send-part1.js:69` | 6/13 | `form[data-type="unified-composer"] #composer-submit-button[data-testid="stop-button"]` | route-via-driftwatch | stopButton (`stop.composer-submit-testid`) | S3.8 — done (S3a) | retained as trailing fallback, `unified-composer` itself confirmed dead (S0.12 findings) but kept per D-S2 "keep dated strategies as trailing fallbacks" |
| `25-prompt-send-part1.js:69` | 6/13 | `main form button[aria-label^="Stop"]:not([disabled])` | route-via-driftwatch | stopButton (`stop.aria-prefix`) | S3.8 — done (S3a) | retained as trailing fallback; pack v2 puts `stop.aria-exact` FIRST |

### 2.2 Prompt send — hardcoded fallback arrays (feature 6, was §2.2, 20 rows)

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `25-prompt-send-part1.js:103` | 6 | `#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]` | delete | n/a | S3.8 — done (S3a) | PLAN.md S3.2 names `:103-133` explicitly: every entry confirmed 0-match live |
| `25-prompt-send-part1.js:104` | 6 | `div.ProseMirror[contenteditable="true"][aria-label="Chat with ChatGPT"]` | delete | n/a | S3.8 — done (S3a) | dead — aria-label is now `"Ask ChatGPT"` (01 §4) |
| `25-prompt-send-part1.js:105` | 6 | `div[role="textbox"][contenteditable="true"][aria-label="Chat with ChatGPT"]` | delete | n/a | S3.8 — done (S3a) | dead, same stale aria-label |
| `25-prompt-send-part1.js:106` | 6 | `form div.ProseMirror[contenteditable="true"][data-virtualkeyboard="true"]` | delete | n/a | S3.8 — done (S3a) | dead attribute vocabulary, 0-match |
| `25-prompt-send-part1.js:107` | 6 | `#prompt-textarea[contenteditable="true"]` | delete | n/a | S3.8 — done (S3a) | `id="prompt-textarea"` confirmed gone (01 §4) |
| `25-prompt-send-part1.js:108` | 6 | `div[contenteditable="true"][id="prompt-textarea"]` | delete | n/a | S3.8 — done (S3a) | dead, same reason |
| `25-prompt-send-part1.js:109` | 6 | `div[data-testid="prompt-textarea"][contenteditable="true"]` | delete | n/a | S3.8 — done (S3a) | `data-testid` vocabulary gone site-wide (probe §1) |
| `25-prompt-send-part1.js:110` | 6 | `textarea#prompt-textarea` | delete | n/a | S3.8 — done (S3a) | dead, composer is not a `<textarea>` |
| `25-prompt-send-part1.js:111` | 6 | `textarea[name="prompt-textarea"]:not([style*="display: none"])` | delete | n/a | S3.8 — done (S3a) | dead |
| `25-prompt-send-part1.js:112` | 6 | `textarea[data-testid="prompt-textarea"]` | delete | n/a | S3.8 — done (S3a) | dead |
| `25-prompt-send-part1.js:113` | 6 | `textarea[aria-label="Chat with ChatGPT"]` | delete | n/a | S3.8 — done (S3a) | dead |
| `25-prompt-send-part1.js:125` | 6 | `form button[aria-label="Send prompt"]` | delete | n/a | S3.8 — done (S3a) | live aria-label is exactly `"Send"` (01 §4), not `"Send prompt"` |
| `25-prompt-send-part1.js:126` | 6 | `form button[aria-label="Send message"]` | delete | n/a | S3.8 — done (S3a) | dead, same reason |
| `25-prompt-send-part1.js:127` | 6 | `form button[data-testid="send-button"]` | delete | n/a | S3.8 — done (S3a) | `data-testid` gone |
| `25-prompt-send-part1.js:128` | 6 | `button.composer-submit-button-color[aria-label="Send prompt"]` | delete | n/a | S3.8 — done (S3a) | dead class + dead label |
| `25-prompt-send-part1.js:129` | 6 | `button.composer-submit-button-color[aria-label="Send message"]` | delete | n/a | S3.8 — done (S3a) | dead |
| `25-prompt-send-part1.js:130` | 6 | `button[aria-label="Send prompt"]` | delete | n/a | S3.8 — done (S3a) | dead |
| `25-prompt-send-part1.js:131` | 6 | `button[aria-label="Send message"]` | delete | n/a | S3.8 — done (S3a) | dead |
| `25-prompt-send-part1.js:132` | 6 | `button[data-testid="send-button"]` | delete | n/a | S3.8 — done (S3a) | dead |
| `25-prompt-send-part1.js:133` | 6 | `button.btn.relative.btn-primary:not([aria-label="Dictate button"])` | delete | n/a | S3.8 — done (S3a) | dead selector; its embedded Dictate-exclusion INTENT is preserved as a fresh code-level guard in the S3.8 migration (S0.10 finding 3, "Dictate/Voice exclusion" stays own-UI-keep), not via this CSS `:not()` |

### 2.3 Diagnostics app-root probe (feature 14, was §2.3, 1 row)

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `05-diagnostics.js:54` | 14 | `#__next, #root, main, [data-testid="conversation-turn"]` | own-UI-keep | n/a | n/a (no S3.x task; feature 14 stays own, badge moves to S7) | diagnostics-only app-mounted sanity probe, not a gating selector; `main`/`#__next`/`#root` are generic landmarks (still match), only the dead `[data-testid="conversation-turn"]` OR-clause is stale and harmless |

### 2.4 Auto-read new assistant messages (feature 3, was §2.4, 8 rows) — S3.4

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `70-auto-read.js:22` | 3 | `[data-message-author-role="assistant"], section[data-turn="assistant"]` (bus subscription) | route-via-driftwatch | assistantUnit + exchangeRoot | S3.4 — done (S3b) | both attrs confirmed 0-match (probe §1, S0.2); subscription re-keyed on `exchangeRoot` mutations per S3.4 |
| `70-auto-read.js:30-32` | 3 | `[data-message-author-role="assistant"]` (matches/closest) | route-via-driftwatch | assistantUnit | S3.4 — done (S3b) | dead attribute, replaced by per-exchange `assistantUnit` resolve |
| `70-auto-read.js:57` | 3 | `[data-message-author-role="assistant"]` (query-all latest) | route-via-driftwatch | assistantUnit | S3.4 — done (S3b) | dead attribute, replaced by exchange enumeration + `assistantUnit` per exchange |
| `70-auto-read.js:321` | 3 | `data-message-author-role !== 'assistant'` guard | delete | n/a (superseded by assistantUnit) | S3.4 — done (S3b) | attribute confirmed absent (S0.2: `data-message-author-role` = 0); redundant once eligibility runs against an already-resolved `assistantUnit` element |
| `70-auto-read.js:323` | 3 | `data-message-type` regex `/thinking\|analysis\|tool\|status/` | own-UI-keep | n/a | S3.4 — done (S3b) | attribute-VALUE heuristic applied post-resolution, not a selector; S0.6 = "not triggered — carried to S4", unverified not confirmed dead |
| `70-auto-read.js:325` | 3 | `aria-label` contains `"thinking"` | own-UI-keep | n/a | S3.4 — done (S3b) | same — local eligibility heuristic, re-validated in S4 (S0.6) |
| `70-auto-read.js:328` | 3 | text-prefix regex `/^(thinking\|analyzing\|searching)\b/i` | own-UI-keep | n/a | S3.4 — done (S3b) | same — text heuristic, not a chatgpt selector, unverified pending S4 |
| `70-auto-read.js:343` | 3 | `AUTO_READ_STABLE_MS` mutation-quiet debounce | own-UI-keep | n/a | S3.4 — done (S3b) | own timing/debounce logic, no chatgpt DOM dependency at all |

### 2.5 Smart Copy / transcript (feature 5, was §2.5, 8 rows) — S3.5

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `20-smart-copy-part1.js:39` | 5 | `[data-message-author-role="assistant"], [data-message-author-role="user"]` (surface check) | route-via-driftwatch | exchangeRoot | S3.5 — done (S3b) | dead attrs; "any messages present" check becomes an `exchangeRoot` enumeration length check |
| `20-smart-copy-part1.js:40` | 5 | `section[data-turn="assistant"], section[data-turn="user"]` (surface check) | route-via-driftwatch | exchangeRoot | S3.5 — done (S3b) | dead attrs, same replacement |
| `20-smart-copy-part1.js:60` | 5 | `element.closest('[data-message-author-role]')` | route-via-driftwatch | userUnit / assistantUnit | S3.5 — done (S3b) | dead attribute; role resolution moves to the per-exchange unit anchors |
| `20-smart-copy-part1.js:67` | 5 | `element.closest('section[data-turn]')` | route-via-driftwatch | exchangeRoot | S3.5 — done (S3b) | dead selector; boundary resolution moves to `exchangeRoot` |
| `20-smart-copy-part1.js:77` | 5 | `.whitespace-pre-wrap, .markdown` (extraction root) | route-via-driftwatch | assistantMarkdownRoot | S3.5 — done (S3b) | `.markdown`/`.prose` confirmed 0-match (probe §1); content root becomes `assistantMarkdownRoot` |
| `20-smart-copy-part1.js:82` | 5 | `closest('section[data-testid*="conversation-turn-"], [data-testid*="conversation-turn-"]')` | delete | n/a (replaced by exchangeRoot DOM order) | S3.5 — done (S3b) | confirmed dead (probe §1: testid-prefix strategy 0/0/0/0); S3.5 task explicitly replaces this parse with exchange enumeration order, not a new selector |
| `20-smart-copy-part1.js:85` | 5 | regex `/conversation-turn-(\d+)/i` on testid | delete | n/a | S3.5 — done (S3b) | depends entirely on the dead `:82` selector; same replacement |
| `20-smart-copy-part1.js:102-109` | 5 | 8-entry native-selection content allowlist (`[data-message-author-role]`, `.markdown`, `.whitespace-pre-wrap`, `section[data-turn]` combinations) | route-via-driftwatch | pack data: `nativeSelectionAllowlist` (NEW) | S3.5 — done (S3b) | R7 named category ("legacy candidate arrays" / site-specific list); D-S3 explicitly: "keep native-selection allowlist SEMANTICS but source its site-specific entries from pack data" |

### 2.6 Prompt history + global paste guard (features 7/8, was §2.6, 6 rows)

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `25-prompt-send-part2.js:37` | 7 | `data-message-author-role === 'user'` | route-via-driftwatch | userUnit | S3.10 | dead attribute; role check via `userUnit` resolve |
| `25-prompt-send-part2.js:38` | 7 | `.whitespace-pre-wrap` (preferred text node) | route-via-driftwatch | userUnit | S3.10 | old extraction class, paired with confirmed-dead `.markdown` sitewide; content read directly off resolved `userUnit` |
| `25-prompt-send-part2.js:47` | 7 | `[data-message-author-role="user"]` (hydrate history) | route-via-driftwatch | userUnit | S3.10 | dead attribute; hydration source becomes per-exchange `userUnit` |
| `25-prompt-send-part2.js:241` | 8 | `[role="dialog"]` visible-check | own-UI-keep | n/a | S3.10 | ARIA-role paste guard — named local invariant (R7); redesign-resistant, untouched |
| `25-prompt-send-part2.js:249` | 8 | `[role="menu"], [role="listbox"]` visible-check | own-UI-keep | n/a | S3.10 | ARIA-role paste guard — same named invariant |
| `25-prompt-send-part2.js:252` | 8 | `.bg-token-main-surface-tertiary textarea` (edit-box guard) | route-via-driftwatch | pack data: `editSurfaceForm` (NEW) | S3.10 | confirmed DEAD (S0.10: 0 in edit mode); replacement `[data-turn-key] form [data-composer-markdown]` needs a new pack anchor/data key — `composerForm` strategy 2 deliberately EXCLUDES exchange-scoped forms (`:not([data-turn-key] form)`), so this is not yet coverable by an existing anchor |

### 2.7 Double-click-to-edit + usage-limit auto-close (features 11/12, was §2.7, 5 rows)

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `35-server-tts.js:372` | 11 | `.group\/conversation-turn, [data-message-author-role="user"]` (event.target.closest) | route-via-driftwatch | userUnit | S3.9 | dead Tailwind class + dead attr; hit-test moves to "userUnit containing the event target", exchanges enumerated (R6/S3.9) |
| `15-playback-lock.js:297` | 11 | `.group\/conversation-turn, .group\/turn-messages, [data-message-author-role]` (bus subscribe) | route-via-driftwatch | userUnit / exchangeRoot | S3.9 | dead selectors; listener attachment migrates to per-`userUnit` under `exchangeRoot` (R6 finding 10) |
| `35-server-tts.js:374` | 11 | `button[aria-label="Edit message"]` | route-via-driftwatch | editMessageButton | S3.9 | exact 1:1 match to pack-v2 `editMessageButton` (`edit.aria-exact`, `inside:userUnit`) — the R7 "Edit button" named example |
| `35-server-tts.js:404` | 12 | `button[data-testid="close-button"]` (find/click-target) | route-via-driftwatch | pack data: `usageLimitClose` (NEW) | S3.11 — done (S3c; pack has no `usageLimitClose` list yet, so a no-op until the dialog is seen live) | R7 named example ("usage-limit close"); live status unverified (S0.10 — no dialog occurred, never manufactured, carried to S4); `data-testid` is otherwise gone from Sept vocab so this needs re-verification when authored |
| `15-playback-lock.js:306` | 12 | `button[data-testid="close-button"]` (bus subscribe) | route-via-driftwatch | pack data: `usageLimitClose` (NEW) | S3.11 — done (S3c; pack has no `usageLimitClose` list yet, so a no-op until the dialog is seen live) | same control, same new key |

### 2.8 Custom copy-button injection (feature 10, was §2.8, 2 rows) — S3.7

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `35-server-tts.js:280` | 10 | `[data-testid="copy-turn-action-button"], button[aria-label="Copy message"]` (native-action presence gate) | route-via-driftwatch | copyResponseButton | S3.7 | native-copy presence check becomes `resolve('copyResponseButton', exchangeEl)` per S3.7 |
| `35-server-tts.js:290-300` | 10 | reuses feature-5 role/content-node resolution (`insertAdjacentElement('afterend', target)`) | route-via-driftwatch | responseActionBar (placement) + assistantMarkdownRoot (content) | S3.7 | R6 split: today ONE target serves placement AND content extraction; migrated placement anchors to `responseActionBar`, content source to `assistantMarkdownRoot` |

### 2.9 Highlighting (feature 2) + selection-seek (feature 4) — was §2.9, 5 rows

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `60-highlight.js:114,121` | 2 | `span[data-tts-word="1"]` (own-injected, read back) | own-UI-keep | n/a | n/a (no S3.x task) | own-injected marker element, not a chatgpt.com selector (AGENT-RULES 15) |
| `60-highlight.js:17`; `90-scroll.js:106`; `87-ui.js:94` | 2 | `.tts-current-sentence`, `.tts-current-word` (own classes) | own-UI-keep | n/a | n/a | own classes injected by the extension, not chatgpt selectors |
| `55-selection.js:165` | 4 | `CONFIG.CANDIDATE_SELECTORS` (`p, li, h1...blockquote, .markdown, article`) via `querySelectorAll` | own-UI-keep | n/a | n/a (no dedicated F4 task) | mostly generic HTML-tag extraction rule (D-S3 carve-out: "code keeps generic extraction rules"); the `.markdown` entry is confirmed dead (probe §1) and should be dropped when this list is next touched, but the rule itself is not chatgpt-specific |
| `55-selection.js:157` | 4 | `CONFIG.IGNORE_SELECTORS` via `closest` | route-via-driftwatch | pack data: `ignoreSelectors` (NEW) | n/a (no dedicated F4 task; consumption wired — done (S3b)) | exclusion list — R7 named category; consumes `00-namespace.js:258` (source of truth, see 2.11 row) |
| `80-flow.js:328` | 4 | `#thread-bottom-container` (click-to-read ignore-guard) | delete | n/a | n/a | confirmed DEAD, 0 on every page in all 3 consumers (S0.10); guard already fails open (subtle, not throwing) — remove the dead selector rather than leave a silently-inert guard |

### 2.10 Text extraction pipeline (feature 17, was §2.10, 3 rows) — S3.6

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `50-text.js:120` | 17 | `CONFIG.REFERENCE_SELECTORS` (citation/reference exclusion) | route-via-driftwatch | pack data: `citationExclusions` (NEW) | S3.6 — done (S3b) | R7 named example ("citation exclusions"); S0.10 — `[data-testid*="citation"]` clause still LIVE (matches `chatgpt-citation`/`chatgpt-library-file-citation`), `[data-testid="webpage-citation-pill"]` clause dead — needs re-authoring, not deletion |
| `50-text.js:338` | 17 | `CONFIG.USER_MESSAGE_SELECTORS` (`isUserMessageElement`) | route-via-driftwatch | userUnit | S3.6 — done (S3b) | dead attrs (`data-message-author-role`, `data-turn`); primary user-message detection becomes `userUnit` resolve per S3.6 |
| `50-text.js:347-375` | 17 | `h4.sr-only` + "You said" text-prefix heuristic (archived/saved-HTML fallback) | own-UI-keep | n/a (unaddressed by S3.6) | S3.6 — done (S3b) | fallback layer for saved/archived HTML, not itself covered by S3.6's task text; S0.10 found it now structurally MISPLACED (the heading sits outside the user unit, inside the exchange) so it can misattribute an assistant-unit `h4.sr-only` — flagged as a known gap, not fixed by this migration, kept in code pending a follow-up decision |

### 2.11 UI injection / own-DOM (feature 16) + shared config (infra) — was §2.11, 7 rows

| inventory ref | feature | current selector/logic | class | target pack anchor | sub-stage | reason |
|---|---|---|---|---|---|---|
| `00-namespace.js:256` | 16 | `CONFIG.CANDIDATE_SELECTORS` (readable-node source of truth) | own-UI-keep | n/a | n/a | source of truth for the 2.9 `55-selection.js:165` row — same disposition: generic tag rule kept, dead `.markdown` entry dropped (S3b) |
| `00-namespace.js:258` | 16 | `CONFIG.IGNORE_SELECTORS` (incl. `#thread-bottom-container`, `#content-root`) | route-via-driftwatch | pack data: `ignoreSelectors` (NEW) | S3.3 — done (S3b) | exclusion list, R7 named category; source of truth for 2.9's `55-selection.js:157` row; `#thread-bottom-container` confirmed dead (S0.10), `#content-root` status not live-verified this session |
| `87-ui.js:91,131,240,250` | 16 | own ids `#tts-pointer`, `#tts-control-panel`, `#tts-diagnostics-panel`, `#tts-progress-panel` appended to `document.body` | own-UI-keep | n/a | n/a | own panels/ids — named local invariant (AGENT-RULES 15, R7) |
| `87-ui.js:47-54` | 16 | forced `user-select` CSS targeting `[data-message-author-role]`/`section[data-turn]` + `.markdown`/`.whitespace-pre-wrap` combinations | route-via-driftwatch | userUnit/assistantUnit + assistantMarkdownRoot | S3.12 — done (S3c; pack data `styleTargetSelectors`) | S3.2 task text is explicit: retarget to unit-key + `assistantMarkdownRoot` selectors, "selector literals from pack data" (R7); own panel ids stay untouched |
| `10-lifecycle.js:59-60` | 1/16 | hostname check `chat.openai.com` / `chatgpt.com` | own-UI-keep | n/a | n/a | hostname gate — named local invariant (R7), not a DOM selector at all |
| `40-voice.js:250` | 15 | `[role="img"][aria-label], img[alt], [aria-label][data-testid*="emoji"]` (leading speaker emoji strip) | own-UI-keep | n/a | n/a | generic ARIA/alt-based detection, not a chatgpt-specific structural selector |
| `08-observer-bus.js:14-30` | infra | own-UI `IGNORE_SELECTOR` list (`.tmx-copy-row`, `[data-tmx-control]`, `#tts-*` ids) | own-UI-keep | n/a | S3.3 — done (S3a) | observer-bus noise filter — named local invariant (R7); S3.3 extends bus subscriptions for `exchangeRoot`/`assistantUnit` while keeping this filter as-is |

---

## Footer

**Row count check** (counted with `grep -cE '\| (route-via-driftwatch|own-UI-keep|delete) \|' 05-row-triage.md`, not hand-summed): **73** data rows total, matching 01's stated total (8+20+1+8+8+6+5+2+5+3+7 = 73 across the eleven subsections above).

**Counts per class** (grep-verified against the tables above, not hand-summed):
- route-via-driftwatch: **33**
- own-UI-keep: **16**
- delete: **24**
- 33 + 16 + 24 = 73.

**Counts per migrating sub-stage** (grep-verified; route-via-driftwatch + delete rows carry a
real S3.x stage, own-UI-keep rows with no S3.x task are `n/a`):
- S3.3 (infra): 2 (`00-namespace.js:258`, `08-observer-bus.js:14-30`)
- S3.4 (auto-read): 8 (4 route + 1 delete + 3 own-UI-keep heuristic rows tagged with this stage for co-location — see §2.4)
- S3.5 (smart-copy): 8 (6 route + 2 delete)
- S3.6 (text extraction): 3 (2 route + 1 own-UI-keep, co-located)
- S3.7 (copy-button injection): 2 (both route)
- S3.8 (prompt send/composer): 28 (8 route in §2.1 + 20 delete in §2.2)
- S3.9 (double-click-edit): 3 (all route)
- S3.10 (prompt history/paste guard): 6 (4 route + 2 own-UI-keep ARIA guards, co-located)
- S3.11 (usage-limit): 2 (both route)
- S3.12 (style targeting): 1 (route)
- n/a / no dedicated S3.x task: **10** rows — feature 14 diagnostics (1), feature 2 highlighting own classes (2), feature 4 selection-seek (`CANDIDATE_SELECTORS`/`IGNORE_SELECTORS`/`#thread-bottom-container`, 3 — PLAN.md's S3.4-S3.12 list has no dedicated feature-4 stage), feature 16 own-ids/hostname-gate/voice-emoji (4).
- Sum of the ten stage counts above (63) + the 10 n/a rows = 73.

**New pack anchors / pack-data keys needed beyond pack v2's current anchor set** (driftwatch
follow-up; pack v2 as read from `C:/Windows_software/driftwatch/packs/chatgpt.com.json` today
has an `anchors` object only, no `data` section):

1. `pack data: citationExclusions` — `50-text.js:120` (REFERENCE_SELECTORS); partially live, needs re-authoring against Sept `chatgpt-citation`/`chatgpt-library-file-citation` testids.
2. `pack data: ignoreSelectors` — `00-namespace.js:258` / `55-selection.js:157`; `#thread-bottom-container` confirmed dead, `#content-root` unverified.
3. `pack data: nativeSelectionAllowlist` — `20-smart-copy-part1.js:102-109`.
4. `pack data: editSurfaceForm` — `25-prompt-send-part2.js:252` replacement; needs a strategy for the exchange-scoped edit form that today's `composerForm` anchor deliberately excludes (`:not([data-turn-key] form)`).
5. `pack data: usageLimitClose` — `35-server-tts.js:404` / `15-playback-lock.js:306`; still unverified live (S0.10, carried to S4), no confirmed Sept selector yet.
6. `pack data: styleTargetSelectors` — `87-ui.js:47-54`; a pre-composed list of CSS-injectable selector literals (unit-key + `assistantMarkdownRoot`) for a forced `user-select` `<style>` rule, since a `<style>` block needs selector strings, not resolved elements.

No new *anchor* (as opposed to pack-data key) is needed — every element-level row maps onto an
anchor pack v2 already defines.
