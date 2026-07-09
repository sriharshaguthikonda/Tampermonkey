# Prior Art — churn-resistant selector framework

Rule: don't reinvent. Vendor or copy patterns from these. All verified 2026-07-10.

## Build on (vendor / depend)

| Project | What | License | Use |
|---|---|---|---|
| [google/semantic-locators](https://github.com/google/semantic-locators) | Find elements by ARIA role + accessible name (`{button 'Send'}`), TS lib, browser-side, no deps | Apache-2.0 | Core resolution strategy #2 (role+name). Vendorable into userscript/MV3 bundle. |
| [pionxzh/chatgpt-exporter](https://github.com/pionxzh/chatgpt-exporter) | Userscript that reads ChatGPT `/backend-api/` (conversation JSON) instead of scraping DOM | MIT (verify) | Data-layer adapter for chatgpt.com: auth/session token pattern, conversation fetch, endpoint map. |
| [terminalcommandnewsletter/everything-chatgpt](https://github.com/terminalcommandnewsletter/everything-chatgpt) | Documentation of ChatGPT web app backend API calls | — (docs) | Endpoint reference for network intercept design. |
| [mozilla/fathom](https://mozilla.github.io/fathom/intro.html) | Ruleset language: score DOM nodes by declarative rules (used in Firefox password manager, Activity Stream) | MPL-2.0 | Pattern (and possibly vendored scorer) for heuristic fallback tier: "the element that looks most like a prompt box". |

## Steal patterns from (don't vendor)

| Project | Pattern |
|---|---|
| [uBlock Origin procedural filters](https://github.com/gorhill/ublock/wiki/Procedural-cosmetic-filters) | Selectors-as-data: procedural selector mini-language (`:has()`, `:has-text()`, chains) shipped as remotely-updatable filter *lists* with `Expires`/diff updates. Site change = list update, no code release. This is the model for our **selector packs**. |
| Healenium / autoheal ([headout/autoheal](https://github.com/headout/autoheal)) | Self-healing flow: fingerprint element at authoring time (attrs, role, text, structure) → on primary selector miss, score live candidates against fingerprint → adopt best match + log the heal. Server-side Selenium tools — flow is portable, code is not. |
| SponsorBlock / Dark Reader / Refined GitHub | Per-site config data + graceful-degradation discipline; refined-github's per-feature isolation = one feature breaking doesn't kill the rest. |
| Playwright locators / Testing Library `getByRole` | API shape: user-facing semantics first (`role`, `label`, `text`), CSS/XPath last resort. |

## Evaluated, rejected

- **Runtime LLM selector repair** (stagehand, browser-use): privacy (page content leaves browser), latency, cost. Use LLM only in the *offline* repair loop (CI snapshot → codex proposes pack update → human merges).
- **Selenium-side self-healing** (Healenium proper): requires backend/proxy; wrong runtime.
- **Full framework migration** (WXT/Plasmo rewrite of our scripts): ophel already on Plasmo; our repo stays plain JS + build.js. Framework churn ≠ selector churn; out of scope.

## External design review (2026-07-10, model bridge → cerebras zai-glm-4.7)

Incorporated into 00-DESIGN.md as D9–D11 + predicate/shadow additions:
- role+name outranks hashed CSS in authoring guidance (aria churns least).
- Shadow-DOM piercing needed as strategy option.
- Heuristic scoring only at resolve time w/ budget (jank risk).
- `interactable` predicate (overlay false-positive risk).
- Stream interception: strict tee/clone, MAIN-world content script for MV3.
- MV3 store policy: data-only remote packs are within the remote-data exemption; keep schema rigid/whitelisted (confirms D2).
- Pack schema naming: align with Playwright locator vocabulary.

Note: ChatGPT browser-channel deep research (submit_chatgpt_prompt) failed twice on 2026-07-10 (`claim_expired` / `job_unclaimed_expired` — worker tab likely broken by the same ChatGPT UI update this plan addresses). Coverage substituted by direct web research above + GLM review. Re-run the deep-research prompt (saved in scratchpad/session log) when the bridge worker is fixed — treat as P1 kickoff input, not a blocker.
