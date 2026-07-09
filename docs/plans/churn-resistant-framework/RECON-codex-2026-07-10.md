# Read-Only Exploration Report

No files modified. No `git fetch` run.

## 1. OPHEL ARCHITECTURE

### Overall Structure

Repo: `C:/Windows_software/Chrome_extensions/ophel`

Local git state:
- Branch: `main`
- Tracking: `origin/main`
- Ahead/behind local tracked remote: `0 / 0`
- Remote configured: `origin https://github.com/sriharshaguthikonda/ophel.git`
- `package.json` repository points to upstream canonical repo: `https://github.com/urzeye/ophel.git`
- No `upstream` remote exists locally, so drift from `github.com/urzeye/ophel` cannot be measured without network/fetch.
- Last local commits:
  - `508b4da chore: release v1.1.3`
  - `eaa9fb8 docs: add sriharshaguthikonda as a contributor for code (#757)`
  - `22e1344 fix(tab): prevent duplicate title fragments`
  - `3b91e77 fix(claude): prevent userscript export click failures (#755)`
  - `40f4964 feat(layout): add panel-aware layout avoidance (#752)`

Architecture:
- Core app/UI: `src/components/*`, `src/core/*`, `src/stores/*`, `src/utils/*`.
- Site adapters: `src/adapters/*`.
- Adapter registry: `src/adapters/index.ts:24-52` creates concrete adapter instances and selects first `adapter.match()`.
- Adapter contract: `src/adapters/base.ts:357-379` defines required methods like `match()`, `getSiteId()`, `getTextareaSelectors()`, `insertPrompt()`.
- Shared DOM resolver helper: `src/utils/dom-toolkit.ts`.
  - Shadow-aware query: `src/utils/dom-toolkit.ts:449-475`
  - Async get with polling + observer: `src/utils/dom-toolkit.ts:575-645`
  - Watch APIs: `src/utils/dom-toolkit.ts:729-825`
- Extension build: Plasmo MV3 via `package.json` scripts `dev`, `build`, `build:firefox`, `package`.
- Userscript build: Vite + `vite-plugin-monkey` via `vite.userscript.config.ts`.
  - Entry: `src/platform/userscript/entry.tsx` at `vite.userscript.config.ts:436-438`
  - Userscript matches: `vite.userscript.config.ts:446-463`
  - GM grants/connect/resources: `vite.userscript.config.ts:464-514`
  - Userscript platform aliases/polyfills: `vite.userscript.config.ts:524-558`
- Extension content entry: `src/contents/ui-entry.tsx`.
  - Host matches include ChatGPT/OpenAI and other AI sites at `src/contents/ui-entry.tsx:11-30`
  - ChatGPT/Grok/Claude delayed mount + `MutationObserver` remount logic at `src/contents/ui-entry.tsx:76-123`

### Selector Locations

Selector use is mostly adapter-local, not centralized. There is no single selector registry/config for host sites. The closest shared abstractions are:
- `SiteAdapter` methods returning selector arrays/configs.
- `DOMToolkit.query/get/watch`.
- `SUPPORTED_AI_PLATFORMS` host patterns in `src/constants/defaults.ts:141-170`.

Approximate selector/API counts from `querySelector`, `querySelectorAll`, XPath, `.closest`, `.matches`, `getElement*` in host-relevant source files:

| Count | Lines | File |
|---:|---:|---|
| 208 | 4876 | `src/adapters/gemini.ts` |
| 135 | 3271 | `src/adapters/aistudio.ts` |
| 117 | 3353 | `src/adapters/chatgpt.ts` |
| 114 | 2140 | `src/adapters/grok.ts` |
| 108 | 2080 | `src/adapters/qwen-studio.ts` |
| 106 | 2280 | `src/adapters/claude.ts` |
| 94 | 2511 | `src/adapters/deepseek.ts` |
| 86 | 1586 | `src/adapters/yuanbao.ts` |
| 81 | 1817 | `src/adapters/kimi.ts` |
| 72 | 2071 | `src/adapters/doubao.ts` |
| 72 | 1427 | `src/adapters/zai.ts` |
| 64 | 1531 | `src/adapters/gemini-enterprise.ts` |
| 61 | 1420 | `src/adapters/chatglm.ts` |
| 59 | 1542 | `src/adapters/qianwen.ts` |
| 51 | 1071 | `src/adapters/ima.ts` |
| 35 | 1278 | `src/core/assistant-mermaid-renderer.ts` |
| 27 | 1731 | `src/adapters/base.ts` |
| 26 | 614 | `src/core/copy-manager.ts` |
| 22 | 982 | `src/utils/dom-toolkit.ts` |
| 20 | 947 | `src/utils/exporter.ts` |
| 15 | 1270 | `src/core/watermark-remover.ts` |
| 14 | 904 | `src/core/layout-manager.ts` |
| 12 | 475 | `src/core/inline-bookmark-manager.ts` |
| 11 | 489 | `src/core/quick-quote-utils.ts` |
| 10 | 1182 | `src/core/theme-manager.ts` |
| 9 | 660 | `src/core/user-query-markdown.ts` |
| 8 | 1208 | `src/core/usage-counter-manager.ts` |
| 7 | 485 | `src/contents/main.ts` |
| 7 | 139 | `src/utils/toast.ts` |
| 4 | 492 | `src/core/quick-quote-marker.ts` |
| 3 | 799 | `src/core/webdav-sync.ts` |
| 3 | 199 | `src/core/policy-retry-manager.ts` |
| 3 | 424 | `src/core/prompt-manager.ts` |
| 2 | 320 | `src/utils/scroll-helper.ts` |
| 2 | 88 | `src/contents/iframe-scroll-main.ts` |
| 2 | 156 | `src/utils/icons.ts` |
| 2 | 102 | `src/core/outline/dom-outline.ts` |
| 1 | 199 | `src/contents/aistudio-preload.ts` |
| 1 | 337 | `src/core/queue-dispatcher.ts` |
| 1 | 331 | `src/core/gemini-mystuff-bridge.ts` |

### ChatGPT Adapter

Primary file: `src/adapters/chatgpt.ts`.

Core selectors/constants:
- Model button: `button[class*="__composer-pill"][aria-haspopup="menu"]` at `src/adapters/chatgpt.ts:114-117`
- Model menu: `[data-radix-popper-content-wrapper] [role="menu"][data-radix-menu-content]` at `src/adapters/chatgpt.ts:120-123`
- Sponsored card clean-mode selector at `src/adapters/chatgpt.ts:124-125`
- Conversation links: `a[data-sidebar-item="true"][href^="/c/"]` at `src/adapters/chatgpt.ts:126`
- Deep research iframe selector at `src/adapters/chatgpt.ts:146`
- Response container: `#thread, main#main, .markdown.markdown-new-styling` at `src/adapters/chatgpt.ts:1210-1215`
- User query selector: `[data-message-author-role="user"]`, with Codex task fallback at `src/adapters/chatgpt.ts:1227-1236`
- Export selectors: `[data-message-author-role="user"]`, `[data-message-author-role="assistant"]`, `[data-testid^="conversation-turn"]` at `src/adapters/chatgpt.ts:1426-1442`
- Prompt area: `#prompt-textarea`, `textarea[data-id="root"]`, `[contenteditable="true"]` at `src/adapters/chatgpt.ts:1109-1111`
- Submit buttons: `[data-testid="send-button"]`, `button[aria-label="Send prompt"]`, `button[aria-label="发送"]` at `src/adapters/chatgpt.ts:1113-1119`
- Stop buttons include `[data-testid="stop-button"]` plus unified composer `aria-label*="Stop"/"停止"` at `src/adapters/chatgpt.ts:3540-3545`

Strategies:
- Adapter class uses method overrides rather than external config injection.
- It reads conversations from sidebar links and title descendants: `src/adapters/chatgpt.ts:319-335`.
- It uses virtual-scroll export snapshots for long conversations; the comment explains dedupe and hidden snapshot DOM at `src/adapters/chatgpt.ts:129-135`.
- It uses native ChatGPT TOC rail detection:
  - Prompt aria label parsing: `src/adapters/chatgpt.ts:2335-2340`
  - Native TOC button shape heuristic: class contains `h-0.5` and `w-4.5` at `src/adapters/chatgpt.ts:2343-2352`
  - Rail lookup via `.no-scrollbar button[aria-label]` at `src/adapters/chatgpt.ts:2354-2374`
  - Hover target fallbacks: `.no-scrollbar`, parent, `.relative.flex.items-start`, `.fixed`, first button at `src/adapters/chatgpt.ts:2376-2389`
  - Page-realm/correct-window `PointerEvent`/`MouseEvent` for hover reveal at `src/adapters/chatgpt.ts:2420-2455`
  - Dynamic label cache and reveal retry at `src/adapters/chatgpt.ts:2546-2569`
  - Text extraction from revealed layer and fallback cache at `src/adapters/chatgpt.ts:2571-2611`
  - `data-toc-active` active item reads at `src/adapters/chatgpt.ts:2684-2699`
- It resolves outline navigation through native TOC first, clicks TOC when needed, then waits for remounted target: `src/adapters/chatgpt.ts:3121-3152`.
- It caches/merges outline data across virtualized turns: `src/adapters/chatgpt.ts:3183-3211` and subsequent cache merge path.

Issue-specific code evidence:
- `#514` virtualized outline/export: commit exists locally as `86124bb fix(chatgpt): repair virtualized outline and dedupe export under 2025 DOM (#514)`. Current code shows the snapshot/dedupe design at `src/adapters/chatgpt.ts:129-135`, export lifecycle at `src/adapters/chatgpt.ts:1448+`, and turn/message collection around `src/adapters/chatgpt.ts:1627-1761`.
- `#642` dynamic native TOC labels: commit `e6332d6`. Current code caches native TOC labels per button signature and reveals labels on hover: `src/adapters/chatgpt.ts:225-230`, `2392-2418`, `2546-2569`.
- `#643` userscript cross-realm hover event crash: commit `cdbd4a6`. Current code gets the element’s owner window before constructing events: `src/adapters/chatgpt.ts:2420-2421`, then uses that `PointerEvent`/`MouseEvent` constructor at `src/adapters/chatgpt.ts:2439-2461` and conceal path around `2481-2492`.
- `#708` outline scroll highlight with native TOC: commit `243c3bd`. Current code maps active native TOC via `data-toc-active` and returns synthetic outline IDs: `src/adapters/chatgpt.ts:2688-2699`; navigation uses native TOC entry resolution at `src/adapters/chatgpt.ts:3121-3134`. Changelog notes scroll highlight stability at `CHANGELOG.md:73`.

### Tests / CI

No conventional unit/e2e test files found in Ophel source tree:
- Search for `describe(`, `it(`, `test(`, `vitest`, `jest`, `playwright`, `cypress`, `.spec`, `.test` found no real test suite.
- No DOM fixtures for host-site pages found.

CI:
- `.github/workflows/ci.yml` runs:
  - `pnpm format:check`
  - `pnpm lint:check`
  - `pnpm typecheck`
  - `pnpm build`
- Release workflow builds extension/userscript artifacts and userscript assets.

Contributing / maintainer constraints:
- `.github/CONTRIBUTING.md:131-157`: Node/pnpm setup, `pnpm dev`, `pnpm dev:userscript`, verify with format/lint/build.
- `.github/CONTRIBUTING.md:165-178`: Conventional Commits.
- `.github/copilot-instructions.md:7-13`: describes TypeScript strict, React 18, Zustand, and expected checks.

Pluggability:
- Adapters are pluggable at source level through `SiteAdapter`, but current registry instantiates concrete classes directly in `src/adapters/index.ts:24-40`.
- A third-party selector resolver could be injected with small core changes if added to `SiteAdapter`/`DOMToolkit`, but today there is no runtime plugin interface or dependency injection point for selector resolution without changing core.

## 2. TAMPERMONKEY REPO

Repo: `C:/Windows_software/Tampermonkey`

Local git state:
- Branch: `enhance-tts-functionality`
- Remote: `origin https://github.com/sriharshaguthikonda/Tampermonkey.git`
- Dirty/untracked files present before this task: `Q and A.md`, `.serena/`, `artifacts/`, `docs/Research/`, etc.

### Inventory

Userscripts:

| Lines | File | Target |
|---:|---|---|
| 4207 | `Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js` | `chat.openai.com`, `chatgpt.com`, `file://` |
| 1021 | `Tampermonkey_scripts/--- ChatGPT dev-1.7.user.js` | `chatgpt.com/c/*`, `chatgpt.com/g/*` |
| 502 | `Tampermonkey_scripts/old Highlight and Trigger TTS from Cursor with Auto-Reading.js` | `chatgpt.com/c/*` |

Main extension files:

| Lines | File |
|---:|---|
| 99 | `edge-extension/manifest.json` |
| 715 | `edge-extension/background.js` |
| 172 | `edge-extension/profile.js` |
| 619 | `edge-extension/popup.js` |
| 751 | `edge-extension/options.js` |
| 384 | `edge-extension/modules/00-namespace.js` |
| 366 | `edge-extension/modules/05-diagnostics.js` |
| 212 | `edge-extension/modules/08-observer-bus.js` |
| 65 | `edge-extension/modules/10-lifecycle.js` |
| 284 | `edge-extension/modules/15-playback-lock.js` |
| 888 total | `edge-extension/modules/20-smart-copy-part1/2/3.js` |
| 459 total | `edge-extension/modules/25-prompt-send-part1/2.js` |
| 1960 | `edge-extension/modules/70-auto-read.js` |
| 468 | `edge-extension/modules/99-bootstrap.js` |

Extension target sites:
- `edge-extension/manifest.json:12-19`: host permissions for `https://chatgpt.com/*`, `https://chat.openai.com/*`, localhost/127.0.0.1, and `file:///*`.
- Content scripts are loaded on same targets at `edge-extension/manifest.json:33-74`.

### ChatGPT/OpenAI Selectors

Main userscript metadata:
- `Tampermonkey_scripts/ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js:7-15`
  - `https://chat.openai.com/c/*`
  - `https://chat.openai.com/g/*`
  - `https://chat.openai.com/?*`
  - `https://chat.openai.com/*`
  - `https://chatgpt.com/c/*`
  - `https://chatgpt.com/g/*`
  - `https://chatgpt.com/?*`
  - `https://chatgpt.com/*`
  - `file:///*`

Main userscript selectors:
- Conversation availability:
  - `[data-message-author-role="assistant"], [data-message-author-role="user"]` at `Tampermonkey_scripts/...js:361-363`
  - `section[data-turn="assistant"], section[data-turn="user"]` at `...:361-364`
- Message role and fallback:
  - `[data-message-author-role]` via direct/closest at `...:377-392`
  - `section[data-turn]` at `...:390-392`
- Preferred content:
  - `.whitespace-pre-wrap, .markdown` at `...:398-400`
- Turn ordering:
  - `section[data-testid*="conversation-turn-"], [data-testid*="conversation-turn-"]` at `...:403-418`
- Smart copy allowlist:
  - `[data-message-author-role]`
  - `[data-message-author-role] *`
  - `[data-message-author-role] .markdown`
  - `[data-message-author-role] .whitespace-pre-wrap`
  - `section[data-turn]`
  - `section[data-turn] *`
  - `section[data-turn] .markdown`
  - `section[data-turn] .whitespace-pre-wrap`
  - all at `...:423-434`
- Action cleanup:
  - `[data-tmx-control]`, `.tmx-copy-row`, `.tmx-copy-button`, `[data-tts-ui]`, `.sr-only`, `button`
  - `[data-testid="copy-turn-action-button"]`
  - `[data-testid*="turn-action"]`
  - `[aria-label="Response actions"]`
  - `[aria-label="Your message actions"]`
  - `[role="group"][aria-label*="actions"]`
  - all at `...:441-457`
- Paragraph candidates:
  - `this.CONFIG.CANDIDATE_SELECTORS` read by `document.querySelectorAll` at `...:2362-2364`
- User message skip:
  - `[data-message-author-role="user"]` at `...:2351-2355`
- Auto-read observer:
  - `[data-message-author-role="assistant"]` at `...:2734-2785`
- CSS allowlist repeats at `...:4149-4156`.

Extension shared config:
- `edge-extension/modules/00-namespace.js:256`: `CANDIDATE_SELECTORS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, .markdown, article'`
- `edge-extension/modules/00-namespace.js:258`: `IGNORE_SELECTORS = '.settings-header, nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-tts-ui], .sr-only, pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token, #thread-bottom-container, #content-root, #content-root *'`
- `edge-extension/modules/00-namespace.js:289`: `USER_MESSAGE_SELECTORS = '[data-message-author-role="user"], section[data-turn="user"], [data-turn="user"]'`
- `edge-extension/modules/00-namespace.js:292`: `REFERENCE_SELECTORS = '[data-testid="webpage-citation-pill"], [data-testid*="citation"], .webpage-citation-pill, .citation-pill, [data-source], cite'`

Extension prompt/send selectors:
- `edge-extension/modules/25-prompt-send-part1.js:16-35`
  - `#prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]`
  - `div.ProseMirror[contenteditable="true"][aria-label="Chat with ChatGPT"]`
  - `div[role="textbox"][contenteditable="true"][aria-label="Chat with ChatGPT"]`
  - `form div.ProseMirror[contenteditable="true"][data-virtualkeyboard="true"]`
  - `#prompt-textarea[contenteditable="true"]`
  - `div[contenteditable="true"][id="prompt-textarea"]`
  - `div[data-testid="prompt-textarea"][contenteditable="true"]`
  - `textarea#prompt-textarea`
  - `textarea[name="prompt-textarea"]:not([style*="display: none"])`
  - `textarea[data-testid="prompt-textarea"]`
  - `textarea[aria-label="Chat with ChatGPT"]`
- `edge-extension/modules/25-prompt-send-part1.js:38-49`
  - `form button[aria-label="Send prompt"]`
  - `form button[aria-label="Send message"]`
  - `form button[data-testid="send-button"]`
  - `button.composer-submit-button-color[aria-label="Send prompt"]`
  - `button.composer-submit-button-color[aria-label="Send message"]`
  - `button[aria-label="Send prompt"]`
  - `button[aria-label="Send message"]`
  - `button[data-testid="send-button"]`
  - `button.btn.relative.btn-primary:not([aria-label="Dictate button"])`

Extension smart-copy selectors mirror userscript:
- Conversation selectors at `edge-extension/modules/20-smart-copy-part1.js:38-49`
- Role/turn fallback at `edge-extension/modules/20-smart-copy-part1.js:54-78`
- Turn index at `edge-extension/modules/20-smart-copy-part1.js:80-98`
- Allowlist at `edge-extension/modules/20-smart-copy-part1.js:100-115`
- Cleanup action selectors at `edge-extension/modules/20-smart-copy-part1.js:118-134`

Extension auto-read:
- Observer bus subscription selector `[data-message-author-role="assistant"], section[data-turn="assistant"]` at `edge-extension/modules/70-auto-read.js:18-45`
- Latest assistant message selector `[data-message-author-role="assistant"]` at `edge-extension/modules/70-auto-read.js:56-60`.

### build.js

`build.js` is extension-only:
- Source: `edge-extension`
- Output: `dist/dev` and/or `dist/prod`
- Copies the whole extension directory.
- Writes generated `modules/01-build-info.js`.
- Injects that module after `modules/00-namespace.js` in manifest content script order.
- Dev build appends ` (DEV)` to manifest name.
- Relevant code:
  - Channel validation: `build.js:6-7`
  - Build info creation: `build.js:15-23`
  - Manifest JS injection: `build.js:25-36`
  - Copy/write output: `build.js:38-62`
  - Default builds both `dev` and `prod`: `build.js:66-73`

### Tests

Root tests:
- `test_auto_read_navigation_controls.js` - 591 lines. VM-loads extension modules, stubs DOM, tests auto-read/navigation behavior; see VM setup at `test_auto_read_navigation_controls.js:8-58`.
- `test_userscript_navigation_skip_parity.js` - 228 lines. VM-loads userscript and exposes `TTSReader` for parity checks; see `test_userscript_navigation_skip_parity.js:9-67`.
- `test_voicelink_integration.js` - 107 lines. Browser-console style mock integration for VoiceLink.

No package manager/test runner config found; tests are plain Node scripts.

### Shared/Common Module Status

Extension:
- Has a shared namespace object: `edge-extension/modules/00-namespace.js`.
- Has a shared observer bus: `edge-extension/modules/08-observer-bus.js`.
  - Single document/body `MutationObserver`: `edge-extension/modules/08-observer-bus.js:175-188`
  - Subscriber filtering by selector/relevant callback: `edge-extension/modules/08-observer-bus.js:55-78`
  - Debounced idle flush: `edge-extension/modules/08-observer-bus.js:81-149`
  - Public `ns.observerBus.subscribe`: `edge-extension/modules/08-observer-bus.js:200-229`
- Has shared config selector strings in `00-namespace.js`.
- Still has many inline selectors inside feature modules.

Userscript:
- Single monolithic file with section comments.
- Duplicates a lot of extension logic, but lacks `observerBus`; it uses direct document-wide `MutationObserver` for smart copy at `Tampermonkey_scripts/...js:349-356` and auto-read at `...:2734-2785`.

## 3. SEAMS FOR A SHARED RESILIENT-SELECTOR LAYER

### Ophel Insertion Points

Lowest-diff seams:
1. `src/utils/dom-toolkit.ts:449-475`
   - Replace/augment `DOMToolkit.query(selector|string[], options)` with resolver support.
   - Existing callers already pass selector arrays and filters.
2. `src/adapters/base.ts:706-717`
   - `findTextarea()` loops `getTextareaSelectors()`.
   - Could call `resolver.resolve("composer.input", descriptors, { root: document, visible: true })`.
3. `src/adapters/base.ts:1650+`
   - Model/menu search already has selector arrays, visibility checks, menu container scoring.
   - Existing behavior is close to “fallback selector chain + scoring”.
4. `src/adapters/chatgpt.ts`
   - Native TOC button discovery at `src/adapters/chatgpt.ts:2354-2374`.
   - Prompt/send selectors at `src/adapters/chatgpt.ts:1109-1119`.
   - Export/message selectors at `src/adapters/chatgpt.ts:1426-1442`.
   - Model selector/menu selectors at `src/adapters/chatgpt.ts:114-123`, `3548-3568`.

Minimal Ophel API sketch:

```ts
type ResolverDescriptor = {
  id: string
  selectors: string[]
  role?: string
  text?: RegExp | string
  attrs?: Record<string, string | RegExp>
  visible?: boolean
  within?: ParentNode | Element
  score?: (el: Element) => number
}

resolver.one("chatgpt.composer.input", descriptor): HTMLElement | null
resolver.all("chatgpt.messages.assistant", descriptor): HTMLElement[]
resolver.watch("chatgpt.nativeToc", descriptor, callback): () => void
```

Ophel already half-built:
- Selector arrays in each adapter.
- Shadow-aware `DOMToolkit.query`.
- Visibility filtering in `SiteAdapter.findVisibleElementBySelectors`.
- Menu container scoring in `SiteAdapter.pickBestMenuContainer`.
- ChatGPT native TOC label cache/signature logic at `src/adapters/chatgpt.ts:2392-2418`.

### Tampermonkey Insertion Points

Lowest-diff seams:
1. `edge-extension/modules/00-namespace.js`
   - Add `ns.selectorResolver` and central descriptors beside `CONFIG` selector strings.
2. `edge-extension/modules/25-prompt-send-part1.js:16-58`
   - Replace local prompt/send loops with `ns.selectorResolver.one("chatgpt.promptArea")` and `.one("chatgpt.sendButton")`.
3. `edge-extension/modules/20-smart-copy-part1.js:38-49`
   - Replace conversation surface/message discovery with resolver descriptors.
4. `edge-extension/modules/70-auto-read.js:18-60`
   - Reuse resolver for assistant message subscription and latest message.
5. `edge-extension/modules/08-observer-bus.js`
   - Already provides mutation invalidation; resolver can cache results and invalidate by subscriber selector.
6. Userscript monolith:
   - Introduce a small in-file resolver object near config, then port same descriptor table manually.
   - Replace repeated sections at `Tampermonkey_scripts/...js:361-434`, `2351-2364`, `2734-2799`.

Minimal Tampermonkey API sketch:

```js
ns.selectorResolver = {
  one(key, options) {},
  all(key, options) {},
  matches(key, element) {},
  closest(key, element) {},
  subscribe(key, onFlush) {}
};

ns.selectorDescriptors = {
  "chatgpt.promptArea": {
    selectors: [/* current prompt selectors */],
    visible: true,
    usable: (el) => ns.TTSReader.isUsablePromptArea(el)
  },
  "chatgpt.sendButton": {
    selectors: [/* current send selectors */],
    visible: true,
    usable: (el) => ns.TTSReader.isSendButtonReady(el)
  },
  "chatgpt.assistantMessage": {
    selectors: ['[data-message-author-role="assistant"]', 'section[data-turn="assistant"]']
  },
  "chatgpt.userMessage": {
    selectors: ['[data-message-author-role="user"]', 'section[data-turn="user"]', '[data-turn="user"]']
  }
};
```

Tampermonkey already half-built:
- Central config strings in `edge-extension/modules/00-namespace.js:256-292`.
- Fallback selector chain for prompt/send in `edge-extension/modules/25-prompt-send-part1.js:16-49`.
- Shared mutation bus in `edge-extension/modules/08-observer-bus.js:1-230`.
- Selector parity between extension and userscript, but manually duplicated.
- Plain Node parity tests can cover resolver behavior by extending the existing VM harnesses in `test_auto_read_navigation_controls.js` and `test_userscript_navigation_skip_parity.js`.

### Shared Library Needs Across Both Repos

Both repos need:
- Ordered selector fallback chains.
- Visibility/usability predicates.
- Host/domain-specific descriptors.
- Optional semantic scoring, especially for:
  - prompt editor vs hidden textarea
  - send button vs dictation/voice button
  - model menu item vs unrelated menu
  - ChatGPT native TOC rail vs other `.no-scrollbar` rails
- Mutation-aware cache invalidation.
- “Current document realm” event construction for hover/click probes.
- Debug telemetry: which selector won, which failed, and why.

A practical shared layer should not start as a large framework. The actual call sites suggest three primitives are enough:
- `one(descriptor)`
- `all(descriptor)`
- `watch(descriptor, callback)`

The biggest risk is that Ophel is TypeScript/React/Plasmo/Vite and Tampermonkey is plain JS/userscript plus extension modules. A shared package would need either:
- a tiny framework-free ESM/CJS/browser bundle, or
- duplicated source generated into each repo.

The minimal-diff route is to first standardize descriptor shape locally in each repo, then extract once the descriptor/API has stabilized.