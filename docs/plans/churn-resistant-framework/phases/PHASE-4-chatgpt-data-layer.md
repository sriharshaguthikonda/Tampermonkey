# P4 — ChatGPT data layer (network intercept)

Depends: P1 (can run parallel with P3). Enhances: P3 features, P5 ophel features.
Design refs: 00-DESIGN.md "Data-layer adapter", D5. Rules: AGENT-RULES.md 9, 17.
Prior art to mine BEFORE coding: pionxzh/chatgpt-exporter (session/auth + endpoint handling), terminalcommandnewsletter/everything-chatgpt (endpoint map). Clone both into `C:/Windows_software/Chrome_extensions/_reference/` and study their current intercept code first — copy patterns, keep licenses.

## Goal
Features read structured conversation data (turns, roles, stream deltas, titles) from ChatGPT's own network traffic instead of scraping DOM. DOM remains only for UI mount points + input/send. Passive only — zero extra requests.

## Tasks
1. **Recorder first (test asset)** — devtools-assisted capture of real `/backend-api/` traffic (conversation load, new message stream, title gen) into sanitized JSON/SSE transcript fixtures. These are the golden tests; do this before any module code.
2. **Page-realm intercept module** — single file, injected into page context (MV3: content script registered `world: "MAIN"`; userscript: script-tag injection): wrap `window.fetch` (and Response body reader for SSE streams) filtered by URL allowlist (`/backend-api/conversation*` etc). Never blocks/modifies traffic; STRICT `response.clone()`/`tee()` — the page's original stream must never be consumed by us or React hangs (D11). Realm-safe messaging to content script (postMessage w/ namespaced envelope + origin check).
3. **Conversation model** — normalize intercepted payloads → `{conversationId, turns[{id, role, text, status}], activeStream}`; handles: initial load, delta stream, edit/regenerate, conversation switch. Unit tests replay fixture transcripts → golden model JSON.
4. **Event API** — `onTurnAdded`, `onStreamDelta`, `onTurnComplete`, `onConversationSwitch`. Contract doc for consumers (TTS auto-read = first consumer: "read newest assistant turn on onTurnComplete").
5. **Degradation contract** — if intercept sees no traffic (endpoint drift), module emits `dataLayer.unavailable`; consumers auto-fallback to DOM path (P3 wrappers already do this). Fault-injection test: rename endpoints in fixtures → fallback fires, no crash.
6. **Integrate one consumer** — TTS auto-read newest-message trigger switched to data-layer events behind flag `USE_DATA_LAYER` (default on, flag = rollback). Existing DOM trigger stays as fallback path.
7. **Privacy audit task** — checklist run: no storage of conversation text beyond in-memory model, no network egress, module code reviewed for accidental logging of content. Evidence in Q and A.md.

## Acceptance gates
- Transcript replay suite green (paste).
- Live manual smoke: open chatgpt.com, send a message, verify events fire + TTS reads from data layer (log evidence).
- Kill test: block `/backend-api` intercept (simulate drift) → DOM fallback works, single warning, no crash.
- Playwright network log shows zero non-allowlisted egress (TESTING.md §7).
