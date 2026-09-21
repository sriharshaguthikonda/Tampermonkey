# Live DOM probe — chatgpt.com, 2026-09-21

Evidence for the [Sept 2026 churn repair plan](../../plans/chatgpt-2026-09-churn/PLAN.md).
Method: Claude in Chrome (user's logged-in Chrome, ChatGPT TTS Reader extension loaded),
**temporary chat** (`/?temporary-chat=true`, not saved to history), harmless test prompt
(3 paragraphs + 4-item list + Python code block), then a second exchange. All probes were
`querySelectorAll(...).length` or attribute-name dumps — **no page text was extracted**.
UUIDs replaced with `<uuid>`, React ids with `<rid>`.

Re-run: open a temporary chat, paste the probe from §6 into DevTools.

## 1. driftwatch `packs/chatgpt.com.json` against the live page

Counts per strategy, in pack order. idle = after completion; streaming = 2 s after send.

| anchor | strategies (pack order) | live counts | verdict |
|---|---|---|---|
| `conversationTurn` | testid `conversation-turn-` ^ / `[data-turn-id]` / `[data-turn]` / `article[...]` | 0 / 0 / 0 / 0 | **broken** |
| `assistantMessage` | `[data-message-author-role="assistant"]` / `[data-turn="assistant"]` | 0 / 0 | **broken** |
| `copyResponseButton` | `button[data-testid="copy-turn-action-button"]` / `button[aria-label^="Copy"]` inside turn | 0 / (turn broken → `-2`) | **broken** (inside: unresolvable) |
| `composer` | `#prompt-textarea` / `[contenteditable="true"][role="textbox"]` / `div#prompt-textarea[...]` | 0 / **2** / 0 | **ambiguous-in-effect**: strategy 2 also matches the new code-block editor (see §3) |
| `sendButton` (idle) | `button[data-testid="send-button"]` / `button#composer-submit-button:not([disabled])` / `form button[aria-label^="Send"]:not([disabled])` | 0 / 0 / 1 | **fail-closed** — winner is index 2, `degradeLimit: 1` |
| `stopButton` (streaming) | `form[data-type="unified-composer"] #composer-submit-button[data-testid="stop-button"]` / `main form button[aria-label^="Stop"]:not([disabled])` | 0 / 1 | **degraded** (index 1, within limit) |

Page-wide: `[data-testid]` count on a new-chat page = **1** (`app-shell-header-context-menu-surface`).
The `data-testid` vocabulary ChatGPT used since 2024 is essentially gone from the thread and composer.
A hyphenated `data-test-id` exists but only on 2 header slots (`header-shell-slot`).
`<section>` elements now exist only in the sidebar/notifications — no turn uses `section` or `article`.

## 2. New vocabulary (candidate anchors)

| concept | new selector | notes |
|---|---|---|
| exchange root (user + assistant) | `[data-turn-key]` | one per **exchange**, not per message. 2 exchanges → 2 roots. |
| exchange root (alt) | `[data-content-search-turn-key]` | direct child of `[data-turn-key]`; same count |
| user message unit | `[data-content-search-unit-key$=":user"]` | value `<uuid>:0:user`; uuid shared with its assistant unit, differs per exchange |
| assistant message unit | `[data-content-search-unit-key$=":assistant"]` | value `<uuid>:2:assistant` (index 1 unused in this test) |
| assistant markdown root (text-read root) | `[data-markdown-text-style="assistant-message"]` | inside the assistant unit; contains `p`, `ul/li`, code block. Replaces `.markdown` / `.prose` (both 0) |
| user bubble | `[data-user-message-bubble="true"]` | |
| assistant turn start marker | `span[data-chatgpt-agent-turn-start]` | sibling just before the assistant unit |
| screen-reader role headings | `h4` (sr-only) | one per unit; text not read |
| code block | `[data-markdown-copy="code-block"]`, editor `div[contenteditable="true"][role="textbox"][aria-label="Edit code"][data-language]` | **`pre`/`code` exist only while streaming** (pre=1 at 6.6 s, pre=0 after 14 s) |
| exclude-from-copy regions | `[data-markdown-copy="exclude"]` | code-block toolbars |
| user action bar | `button[aria-label="Copy message"]`, `button[aria-label="Edit message"]` | inside user unit |
| assistant action bar | `Copy`, `Rate response`, `Regenerate response`, `More actions` (aria-labels) | **outside** the assistant unit, inside the exchange root, after both units |
| code-block buttons | `Enable word wrap`, `Run code`, `Copy`, `Scroll to bottom` | inside the assistant unit — `button[aria-label^="Copy"]` inside the unit hits the code-block copy, not the response copy |
| composer | `form [contenteditable="true"][role="textbox"][data-composer-markdown]`, `aria-label="Ask ChatGPT"`, still `.ProseMirror` | no `id`; ancestors carry `data-composer-*` layout attrs |
| send | `form button[type="submit"][aria-label="Send"]` | no id, no testid; appears only when composer non-empty |
| stop | `form button[aria-label="Stop"]` | no id, no testid; visible ~0–9.6 s in this test |
| composer idle buttons | `Add files and more`, `Select ChatGPT model`, `Dictate`, `Start Voice` | |
| read aloud | none on the action bar (`button[aria-label*="Read aloud" i]` = 0) | may live inside `More actions` menu — unverified |

## 3. Behaviour changes that break logic, not just selectors

1. **Turn ≠ message.** Anything assuming "last turn = last assistant message" or "turn has an author role" is wrong. The exchange root holds both units; role is encoded only in the unit-key suffix.
2. **Response copy button is not inside the message.** The assistant action bar is a sibling region of the units. `closest(message)` then `querySelector('button[aria-label^=Copy]')` finds the *code-block* copy button (or nothing).
3. **Two contenteditable textboxes on any page with a code block.** Composer strategies keyed on `[contenteditable][role=textbox]` alone now pick between the composer and a code editor. Paste/insert logic must scope to `form` / `[data-composer-markdown]`.
4. **Code blocks leave `pre`/`code` after streaming.** Text extraction or skip rules that key on `pre` / `code` miss finished code blocks.
5. **Enter did not submit** a synthetic `type` into the new composer in this test; clicking `Send` did. (May be a test-harness artefact — recheck in the implementation smoke.)

## 4. Streaming timeline (first exchange, ms after send click)

```
3666   stop=1 copy=1(user msg)            ← streaming
6654   + pre=1 code=1                     ← code block streaming as <pre>
9657   stop=0 send=1 copy=2               ← completion: send back, response copy appears
13802  copy=3 (code-block copy)
14061  pre=0 code=0                        ← code block re-rendered as editor
```

Completion signal candidates, in order of robustness: stop button disappears ∧ response
`Copy` appears in the exchange's action bar ∧ `More actions` present.

## 5. Extension observations (not conclusive)

- Extension loads: `#tts-control-panel`, `#tts-pointer`, `#tts-progress-panel`, `#tts-diagnostics-panel`, `canvas#tts-navigation-trail` present.
- Panel toggles at probe time: `highlight=1 gap-trim=1 read-user=0 read-refs=0 chat-style=1 low-gap=1 server-precache=1 auto-read=1 loop=0 autoscroll=1 smart-copy=1 nav-start-skip=0`.
- After the second exchange completed: `speechSynthesis.speaking=false`, `<audio>` count 0, no extension console output (debugLogging defaults to off). Consistent with auto-read not triggering, **not proof** — server TTS may play from a background/offscreen document. Confirm with `debugLogging=true` in the implementation smoke.

## 6. Probe snippet

```js
const q = s => document.querySelectorAll(s).length;
({
  oldTurn: q('[data-testid^="conversation-turn-"]'), roleAsst: q('[data-message-author-role="assistant"]'),
  exchange: q('[data-turn-key]'), userUnit: q('[data-content-search-unit-key$=":user"]'),
  asstUnit: q('[data-content-search-unit-key$=":assistant"]'),
  mdRoot: q('[data-markdown-text-style="assistant-message"]'),
  ceTextbox: q('[contenteditable="true"][role="textbox"]'), composer: q('form [data-composer-markdown]'),
  send: q('form button[aria-label="Send"]'), stop: q('form button[aria-label="Stop"]'),
  moreActions: q('button[aria-label="More actions"]'), pre: q('pre'),
})
```

## 7. Sanitized skeleton — one exchange (idle)

`(div×N)` = N attribute-less wrapper divs collapsed. Text nodes dropped.

```
div[data-turn-key="<uuid>"]
  div[data-content-search-turn-key="<uuid>"]
    (div×2) div
      div
        div
          h4                                  (sr-only)
          (div×1) div[data-content-search-unit-key="<uuid>:0:user"]
            div
              div[data-user-message-bubble="true"]
              (div×2) div
                span[data-state="closed"] > button[aria-label="Copy message"]
                span[data-state="closed"] > button[aria-label="Edit message"]
        div
          span[data-chatgpt-agent-turn-start]
          div[data-content-search-unit-key="<uuid>:2:assistant"]
            h4                                (sr-only)
            (div×1) div[data-selected-text-overlay-target="<rid>"][data-markdown-text-style="assistant-message"]
              p  p  p
              ul > li ×4
              div[data-markdown-copy="code-block"][data-theme="dark"]
                div[data-markdown-copy="exclude"]      (toolbar: word wrap / Run code / Copy)
                div > div[contenteditable="true"][role="textbox"][aria-label="Edit code"][data-language="python"]
                button[aria-label="Scroll to bottom"]
      (div×1) div                              (assistant action bar)
        span > button[aria-label="Copy"]
        span > button[aria-label="Rate response"]
        button[aria-label="Regenerate response"]
        button[aria-label="More actions"]
```
