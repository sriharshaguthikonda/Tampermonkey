# Prior Art — churn-resistant selector framework

Rule: don't reinvent. Vendor or copy patterns from these. All verified 2026-07-10.

## Build on (vendor / depend)

| Project | What | License | Use |
|---|---|---|---|
| [google/semantic-locators](https://github.com/google/semantic-locators) | Find elements by ARIA role + accessible name (`{button 'Send'}`), TS lib, browser-side. CORRECTION 2026-07-10: npm package DOES depend on `accname@^1.1.0` (verified `npm view semantic-locators@2.1.0`) — not dependency-free as first stated. | Apache-2.0 | Pattern reference. v2 plan uses [dom-accessibility-api](https://www.npmjs.com/package/dom-accessibility-api) (MIT, zero-dep, testing-library's accname engine) instead of hand-rolling name computation. |
| [pionxzh/chatgpt-exporter](https://github.com/pionxzh/chatgpt-exporter) | Userscript that reads ChatGPT `/backend-api/` (conversation JSON) instead of scraping DOM | MIT (verify) | Data-layer adapter for chatgpt.com: auth/session token pattern, conversation fetch, endpoint map. FRAMING CORRECTION (first critique): proves internal-API *consumption*, not passive live stream interception — hence data layer is a go/no-go spike, not a locked decision. |
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

## ChatGPT deep-research merge (2026-07-10, `docs/Research/self_healign_selector_drop_in _chatgpt_research.txt`, full text preserved there)

Bottom line quote: *"There is no good drop-in self-healing selector library for a Manifest V3 content script or userscript."* — independently confirms our thesis (own kernel, not a vendored healer).

**Convergence check**: this research's "Final ranking" (own semantic-locator kernel on `dom-accessibility-api` → remote declarative locator data, Dark-Reader/uBlock style → generated-CSS fallback only as last resort → conservative similarity scorer, never live → optional ChatGPT `/backend-api` provider → LLM repair offline/CI only, never live resolver) matches our v2 architecture (anchor-core kernel, packs = remote data, risk-class-gated strategies, D4/D4b offline repair) point-for-point. No design changes needed; treat as independent validation.

New rows for "Build on" table:
| Project | What | License | Use |
|---|---|---|---|
| [@medv/finder](https://www.npmjs.com/package/@medv/finder) | Generates a compact, stable CSS selector for a given element (not a resolver — records a fallback path). 1.5 KB gzip. | MIT | Candidate for recording a generated-CSS fallback strategy in packs, cheaper than `css-selector-generator` (4.2 KB); only if we ever need generated (not authored) selectors — currently out of scope, authored selectors only. |

New rows for "Steal patterns" table:
| Project | Pattern |
|---|---|
| [Vimium](https://github.com/philc/vimium) | Discovers clickable/interactive elements at runtime by type + clickability + tabindex + visibility + geometry instead of a selector — "which visible element behaves like a button" vs "what CSS matches the button". Good fit for generic Copy/Regenerate/expand controls; not for message-boundary identification (needs site knowledge). MIT. |
| [Dark Reader](https://github.com/darkreader/darkreader) (detail) | Remote config + **packaged last-known-good fallback** on remote-fetch failure, parser separate from executor (data never executes), independent data categories, timeout+graceful-fallback. This is the concrete precedent for our pack loader's fallback-to-bundled-defaults behavior. MIT. |

Additions to "Evaluated, rejected": ROBULA+ (repo, unmaintained/academic), "ChatGPT-only pile of selector aliases" (no generalization, exactly what P0-era hotfixes degrade into if not disciplined), DOM Testing Library in production (37.9 KB gzip, test-only tool), ROBULA+/ Optimal Select / selector-observer (all superseded by narrower purpose-built pieces above).

Concrete numbers worth keeping for TESTING.md calibration if/when a similarity tier is ever un-demoted from diagnostics: starting thresholds `top score ≥ 0.85` AND `top − second ≥ 0.15` (explicitly flagged by the source as starting values to tune against fixtures, not universal constants) — matches our "diagnostics only, never live" stance (round-1 critique adoption), so these numbers are dormant unless that stance changes.

Legal note: Ophel is GPL-3.0-only; MIT/Apache/GPL sources are all workable for Ophel itself, but GPL code must not be copied into this repo's separately-licensed Tampermonkey scripts. Relevant if we ever port a GPL-derived pattern (e.g. uBlock procedural-filter shape) into `Tampermonkey_scripts/`.

Academic backing for the (rejected-as-runtime, useful-as-reference) similarity-repair idea: arXiv 2208.00677, 2301.03863, 2505.16424, 2310.02046 (web-element relocalization / visual-overlap robustness / LLM-assisted relocalization) — cite if a future phase revisits similarity scoring.
