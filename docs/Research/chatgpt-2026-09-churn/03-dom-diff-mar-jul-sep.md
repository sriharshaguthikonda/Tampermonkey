# ChatGPT DOM mapping: March → July → September 2026

September evidence is the live probe at `C:/Windows_software/Tampermonkey/docs/Research/chatgpt-2026-09-churn/00-live-dom-probe-2026-09-21.md` (`S`). Older evidence is structure-only: `C:/Windows_software/driftwatch/fixtures/chatgpt.com/2026-03-19-turns/turns.html` (`M`), `C:/Windows_software/driftwatch/fixtures/chatgpt.com/2026-07-15-turns/turns.html` (`J`), and `C:/Windows_software/driftwatch/fixtures/chatgpt.com/current/desktop/conversation.html` (`JF`, a hand-built frontier reflecting the 2026-07-28 live anatomy). July behavioral details come from `C:/Windows_software/driftwatch/docs/chatgpt-com-anatomy.md` (`A`). `?` means the cited evidence does not show the concept; it is not an inferred absence.

## DOM concept map

| concept | March 2026 selector | July 2026 selector | Sept 2026 selector | survived? | notes |
|---|---|---|---|---|---|
| conversation turn root | `article[data-testid^="conversation-turn-"]` (`M`) | `section[data-testid^="conversation-turn-"][data-turn-id][data-turn]` (`J`); tag-agnostic `[data-testid^="conversation-turn-"]` (`J`, `JF`) | `[data-turn-key]` (`S`) | No | March/July roots are one role turn; September root is one exchange containing both role units. The old selector vocabulary has zero live matches. |
| user message | `[data-message-author-role="user"]` (`M`) | `[data-message-author-role="user"]` inside `[data-turn="user"]` (`J`, `JF`) | `[data-content-search-unit-key$=":user"]`; bubble `[data-user-message-bubble="true"]` (`S`) | No | September separates the role unit from the bubble. |
| assistant message | `[data-message-author-role="assistant"]` (`M`) | `[data-message-author-role="assistant"]` inside `[data-turn="assistant"]` (`J`, `JF`) | `[data-content-search-unit-key$=":assistant"]` (`S`) | No | Old role attribute is gone live. |
| author role signal | `data-message-author-role` (`M`) | `data-turn` on the section plus `data-message-author-role` inside (`J`, `JF`) | suffix of `data-content-search-unit-key`: `:user` / `:assistant` (`S`) | No | Do not infer role from headings or content. |
| message id | `?` (`M`; only ordinal `data-testid` is retained) | `[data-turn-id]` / `[data-turn-id-container]` (`J`, `JF`) | `[data-content-search-unit-key]`; exchange identity `[data-turn-key]` (`S`) | No | September unit keys combine the exchange UUID, an observed numeric slot, and role. |
| markdown/text root | `?` (`M`; no stable attribute retained) | `?` (`J`, `JF`; no stable attribute retained); July live anatomy observed `main .markdown` (`A`) | `[data-markdown-text-style="assistant-message"]` (`S`) | No | September's attributed markdown root contains prose, lists, and code-block UI. |
| code block | `?` (`M`) | outer `pre:has(#code-block-viewer)`, inner `#code-block-viewer pre > code` (`J`) | `[data-markdown-copy="code-block"]`; completed editor `[contenteditable="true"][role="textbox"][aria-label="Edit code"][data-language]` (`S`) | No | September `pre`/`code` exist while streaming but disappear after the editor re-render. |
| response copy button | `button[data-testid="copy-turn-action-button"][aria-label="Copy"]` inside assistant `article` (`M`) | `[role="group"][aria-label="Response actions"] button[data-testid="copy-turn-action-button"][aria-label="Copy response"]` (`J`, `JF`) | response action-bar `button[aria-label="Copy"]` (`S`) | Partial | `data-testid` and the response-specific accessible name did not survive. Scope moved from the role turn to the exchange-level action bar. |
| per-turn action bar | assistant `article div:has(> button[data-testid="copy-turn-action-button"])` (`M`) | `[role="group"][aria-label="Response actions"]` (`J`, `JF`) | `[data-turn-key] div:has(> span > button[aria-label="Copy"]):has(> button[aria-label="More actions"])` (`S`) | No | September assistant actions are outside the assistant unit but inside the exchange root. |
| read-aloud control | `button[data-testid="voice-play-turn-action-button"][aria-label="Read aloud"]` (`M`) | `?` (`J`, `JF`) | `?` (`S`; no matching action-bar button) | No | September may place it in `More actions`; not opened by the live probe. |
| composer | `?` (`M`) | `form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"][role="textbox"]` (`JF`) | `form [data-composer-markdown][contenteditable="true"][role="textbox"]` (`S`) | Partial | The form survived; `#prompt-textarea` did not. |
| send button | `?` (`M`) | `button#composer-submit-button[data-testid="send-button"]` while sendable (`A`); intentionally absent in the completed-state fixture (`JF`) | `form button[type="submit"][aria-label="Send"]` (`S`) | No | September button appears only when the composer is non-empty. |
| stop button | `?` (`M`) | `form[data-type="unified-composer"] button#composer-submit-button[data-testid="stop-button"]` while generating (`A`); intentionally absent in the completed-state fixture (`JF`) | `form button[aria-label="Stop"]` (`S`) | Partial | Composer containment survived; id/testid did not. |
| streaming indicator | `?` (`M`) | no dedicated marker shown; the composer stop control is the observed running-state proxy (`A`, `JF`) | no dedicated marker shown; `form button[aria-label="Stop"]` exists during the measured streaming interval (`S`) | ? | Do not treat generic thinking/tool classes as a universal state signal. |
| scroll container | `?` (`M`) | `?` (`J`, `JF`) | `?` (`S`) | ? | `data-scroll-anchor` on March turns (`M`) identifies turn anchoring, not the container. |
| model switcher | `?` (`M`) | `button[aria-label="Switch model"]` is response-scoped in the captured action bar (`J`); composer model switcher not shown (`JF`) | composer-idle `button[aria-label="Select ChatGPT model"]` (`S`) | No | The July selector is not evidence for the composer control and must not be reused as one. |
| sidebar | `?` (`M`) | `nav[aria-label="Chat history"] #history` (`JF`) | `?` (`S`) | ? | September probe establishes sidebar separation/decoy risk but does not record a current sidebar selector. |

## Structural changes

- March used one `article` per role turn; July changed the tag to `section` while retaining one role per turn and adding `data-turn-id` / `data-turn` (`M`, `J`, `JF`). September replaced that model with one `[data-turn-key]` exchange containing separate user and assistant units (`S`).
- July duplicated the author signal on the turn and inner message (`data-turn` plus `data-message-author-role`); September encodes role only in the unit-key suffix (`J`, `JF`, `S`).
- March/July response actions live inside the corresponding role-turn root but outside the inner assistant message (`M`, `J`, `JF`). September preserves the sibling relationship but lifts both the assistant unit and its action bar under the shared exchange root (`S`).
- July code blocks are `pre` / `code` trees rooted around `#code-block-viewer` (`J`). September streams as `pre` / `code`, then replaces the finished block with a contenteditable code editor inside `[data-markdown-copy="code-block"]` (`S`).
- July's completed-state composer keeps `form[data-type="unified-composer"]` and `#prompt-textarea`, while the shared Send/Stop node is removed after completion (`JF`, `A`). September removes the editor id, distinguishes it with `data-composer-markdown`, and uses separate observable `Send` / `Stop` states without id/testid (`S`).
- September can contain two `[contenteditable][role="textbox"]` elements: the composer and a finished code editor. The composer therefore requires form / `data-composer-markdown` scoping (`S`).

## Proposed pack v2 strategies

Each numbered item is an ordered driftwatch strategy. Only `css`, `testid`, `attr`, and `role` forms are used. Requirements use only `connected`, `enabled`, `visible`, and `inside:<anchor>`.

### Existing anchors

- `conversationTurn` — deprecate as a cross-era semantic anchor. Keep legacy-only fallbacks for old fixtures: 1. `{testid:"conversation-turn-", op:"^", requires:["connected","visible"]}`; 2. `{attr:"data-turn-id", requires:["connected","visible"]}`; 3. `{attr:"data-turn", requires:["connected","visible"]}`. Do not add `[data-turn-key]`: an exchange is not a role turn.
- `assistantMessage` — migrate callers to `assistantUnit`; compatibility order: 1. `{css:"[data-content-search-unit-key$=\":assistant\"]", requires:["connected","visible","inside:exchangeRoot"]}`; 2. `{attr:"data-message-author-role", value:"assistant", requires:["connected","visible"]}`; 3. `{attr:"data-turn", value:"assistant", requires:["connected","visible"]}`.
- `copyResponseButton` — 1. `{css:"button[aria-label=\"Copy\"]", requires:["connected","enabled","visible","inside:responseActionBar"]}`; 2. `{css:"button[data-testid=\"copy-turn-action-button\"]", requires:["connected","enabled","visible","inside:responseActionBar"]}`; 3. `{css:"button[aria-label=\"Copy response\"]", requires:["connected","enabled","visible","inside:responseActionBar"]}`. **WRONG-ELEMENT RISK:** retire `button[aria-label^="Copy"]` scoped to an assistant message or whole exchange; it can select a code-block copy button, a user-message copy button, or multiple elements (`J`, `S`).
- `composer` — 1. `{css:"[data-composer-markdown][contenteditable=\"true\"][role=\"textbox\"]", requires:["connected","visible","inside:composerForm"]}`; 2. `{css:"#prompt-textarea[contenteditable=\"true\"][role=\"textbox\"]", requires:["connected","visible","inside:composerForm"]}`; 3. `{css:"div#prompt-textarea[contenteditable=\"true\"]", requires:["connected","visible","inside:composerForm"]}`. **WRONG-ELEMENT RISK:** remove bare `[contenteditable="true"][role="textbox"]`; it also matches the September code editor (`S`).
- `sendButton` — 1. `{css:"button[type=\"submit\"][aria-label=\"Send\"]", requires:["connected","enabled","visible","inside:composerForm"]}`; 2. `{testid:"send-button", requires:["connected","enabled","visible","inside:composerForm"]}`; 3. `{css:"button#composer-submit-button:not([disabled])", requires:["connected","enabled","visible","inside:composerForm"]}`; 4. `{css:"button[aria-label^=\"Send\"]:not([disabled])", requires:["connected","enabled","visible","inside:composerForm"]}`. Preserve state-conditioned expectations.
- `stopButton` — 1. `{css:"button[aria-label=\"Stop\"]", requires:["connected","enabled","visible","inside:composerForm"]}`; 2. `{css:"#composer-submit-button[data-testid=\"stop-button\"]", requires:["connected","enabled","visible","inside:composerForm"]}`; 3. `{css:"button[aria-label^=\"Stop\"]:not([disabled])", requires:["connected","enabled","visible","inside:composerForm"]}`. Preserve state-conditioned expectations; never use a document-wide `aria-label*="Stop"` fallback.

### New anchors required by the September DOM

- `exchangeRoot` — 1. `{attr:"data-turn-key", requires:["connected","visible"]}`. No legacy fallback has equivalent exchange semantics.
- `userUnit` — 1. `{css:"[data-content-search-unit-key$=\":user\"]", requires:["connected","visible","inside:exchangeRoot"]}`; 2. `{attr:"data-message-author-role", value:"user", requires:["connected","visible"]}`; 3. `{attr:"data-turn", value:"user", requires:["connected","visible"]}`.
- `assistantUnit` — 1. `{css:"[data-content-search-unit-key$=\":assistant\"]", requires:["connected","visible","inside:exchangeRoot"]}`; 2. `{attr:"data-message-author-role", value:"assistant", requires:["connected","visible"]}`; 3. `{attr:"data-turn", value:"assistant", requires:["connected","visible"]}`.
- `assistantMarkdownRoot` — 1. `{attr:"data-markdown-text-style", value:"assistant-message", requires:["connected","visible","inside:assistantUnit"]}`; 2. `{css:"[data-message-author-role=\"assistant\"] > div > div", requires:["connected","visible","inside:assistantUnit"]}`. The second is a structural legacy fallback, not a stable contract.
- `responseActionBar` — 1. `{css:"[data-turn-key] div:has(> span > button[aria-label=\"Copy\"]):has(> button[aria-label=\"More actions\"])", requires:["connected","visible","inside:exchangeRoot"]}`; 2. `{role:"group", name:"Response actions", requires:["connected","visible","inside:conversationTurn"]}`; 3. `{css:"article[data-testid^=\"conversation-turn-\"] div:has(> button[data-testid=\"copy-turn-action-button\"])", requires:["connected","visible","inside:conversationTurn"]}`.
- `codeBlock` — 1. `{attr:"data-markdown-copy", value:"code-block", requires:["connected","visible","inside:assistantMarkdownRoot"]}`; 2. `{css:"pre:has(#code-block-viewer)", requires:["connected","visible","inside:assistantMarkdownRoot"]}`.
- `composerForm` — 1. `{css:"form:has([data-composer-markdown])", requires:["connected","visible"]}`; 2. `{css:"form[data-type=\"unified-composer\"]", requires:["connected","visible"]}`. This anchor scopes sibling editor and action controls without pretending the buttons are inside the editor.

## Unverified

- Streaming state markers beyond the scoped Stop-control timeline, including reasoning/tool state and whether completion markers remain stable for long generations.
- Read-aloud's September location and selector, including whether it appears only after opening `More actions`.
- Mobile and narrow responsive layouts.
- Logged-out, free-tier, workspace, and account-variant layouts.
- Canvas / editor responses.
- Reasoning, thinking, browsing, tool-call, and deep-research blocks.
- Image and file attachments in prompts or responses.
- Multiple assistant units within one exchange (retries, branches, tool continuations, or variants).
- The meaning and future use of unit-key index `1`; only user index `0` and assistant index `2` were observed.
- Whether synthetic Enter submission remains unsupported or was a harness artifact.
- The September scroll container and sidebar anchors.
