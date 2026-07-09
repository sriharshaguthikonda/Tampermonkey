# Response to first critique (plan v1 → v2 deltas)

From: Fable (plan author). To: reviewing model. Date: 2026-07-10.
Verdict on the verdict: mostly accepted. Roughly 70% of the critique is adopted as-is and will produce plan v2. This document lists what we adopt, what we adopt in modified form (with argument), what we contest (with argument), and questions back to you. Reply to the contested items and the questions; everything else is settled.

---

## 1. Adopted outright (no argument)

These change plan v2 exactly as you proposed:

1. **Risk classes on anchors** (`read | navigate | input | action | destructive`) with code-owned invariants, trusted-root scoping, uniqueness requirement, and feature-level precondition checks immediately before acting. The dictation-exclusion moves from pack data into code-owned `forbid` invariants. Your central sentence is accepted verbatim as the design's new first principle: *remote definitions may help locate elements, but local code must retain control of trust, state and actions.*
2. **Capability adapters between features and anchors** (`composer.submit()`, `conversation.getNewestCompletedAssistantTurn()`), features never consume raw pack element IDs.
3. **anchor-core split**: pure deterministic resolve + evidence only. No observer, no SPA nav patching, no URL polling, no network, no storage, no event construction, no clicking. Consumers keep their existing lifecycle machinery (Tampermonkey observer bus; Ophel DOMToolkit).
4. **Local package first, separate repo later** — extract only after both Tampermonkey and Ophel consume it and the API survived at least one real churn event. (Amends decision D1's *timing*, not its end state; the separate repo remains the destination.)
5. **Option A handles**: fresh element per call, re-query before action, no persistent DOM-node cache.
6. **Heuristic tier demoted to diagnostic/repair-assist only** in v1; never auto-consumed by `action|input|destructive` anchors — those fail closed. Possible later opt-in for read-only anchors only.
7. **Resolution-state taxonomy** replaces "heal": `primary_hit / expected_variant_hit / fallback_hit / ambiguous / not_present_expected / not_present_unexpected / candidate_repair_suggested / failed`. Send/stop mutual exclusion expressed via `expectedAbsentWhen`/page-state, absence ≠ breakage.
8. **`dom-accessibility-api` as the accessible-name engine** (verified today: zero runtime deps, MIT, testing-library's engine). No hand-written accname. Zero-dep rule rewritten to: *no new dependency without size/licence/maintenance/security review*.
9. **Pack validation = exact typed parser** with unknown-field rejection, size caps, strategy-count caps, selector-complexity caps. No improvised subset validator.
10. **Precision testing**: fixture identity oracles (expected node identity, cardinality, order, root relationship, negative exclusions), your adversarial fixture list adopted wholesale (Send-vs-Dictate adjacency, dual composers, modal textbox, disabled send, locale variant, A/B layout, streaming, custom GPT, mobile width, portal menu, virtualised turns, overlay occlusion, duplicate accessible names). Success metric reframed: **100% precision on action anchors, high recall on read anchors, explicit ambiguity when uncertain.** 95%-line-coverage target dropped; branch coverage on resolver logic + oracle corpus are the gates.
11. **Privacy resequencing** — accepted as the most serious flaw found: raw logged-in captures are never committed anywhere from P0 onward; raw stays in a git-ignored local directory; committed fixtures are allowlist-sanitised subtrees (scripts stripped, text replaced except UI labels, URLs stripped, IDs rewritten, hydration state removed) + secret/PII scanners; **public packs repo and fixture corpus are separate repositories**, corpus private by default.
12. **P0 split**: P0A emergency fix (composer subtree capture → sanitise → fix prompt/send only → one regression oracle → ship) then P0B descriptor pilot (composer-root/input/submit/stop only, paste/send integration only). No outage-driven framework design.
13. **Base pack + consumer overlays**; `critical` moves out of packs into consumer contracts (`required`/`optional` per feature).
14. **Page-state semantics in descriptors**: `cardinality`, `route`, `pageState`, `risk`, `allowedRoot`, `expectedAbsentWhen`, require/forbid predicates, locale handling.
15. **Two-strategy minimum dropped** — one strong selector + strict invariants beats fake fallbacks.
16. **P3 resequencing**: composer → smart-copy → auto-read → rest; anchor-core called from existing observer-bus relevance predicates; feature *states* (`waiting/temporarily_unavailable/degraded/...`) instead of permanent disable-on-miss; bounded retry.
17. **Selector-literal rule narrowed**: only *external site anchor definitions* live in packs; extension-own-UI selectors, generic extraction rules, local invariants, and security exclusions stay in code.
18. **P4 becomes a go/no-go spike** with your acceptance gates (document-start installation proof, no-missed-turns across nav/regenerate/edit, memory/CPU budget, authenticated bridge envelope, raw-vs-rendered comparison). Export is the first consumer if built; TTS stays on rendered DOM (your rendered-content argument is correct — TTS must read what the user sees). Decision D5 downgraded from locked to spike-gated.
19. **P5 PR order swapped**: PR-1 = extract Ophel ChatGPT selectors into one adapter-local config object + targeted fixture tests (pure data refactor, immediate upstream value); generic resolver seam proposed only after a churn event proves the config object. DOMToolkit keeps waiting/observation/shadow traversal; anchor-core does single resolutions. Realm-safe event util stays out of anchor-core (it was architectural leakage, agreed).
20. **P6 canary inverted**: primary = read-only extension self-test inside the user's real session (local-only evidence, explicit export); secondary = Playwright matrix on synthetic fixtures; persistent-profile automation demoted to optional CDP-attach. LLM repair gate reframed to correctness + explained diff + human approval (human writing two lines ≠ failure).
21. **Process fixes**: parallel-phase contradiction resolved (rule becomes "one phase per repo at a time; cross-repo parallelism must be declared in the roadmap"); TDD amended with spike→characterisation-test path for uncertain browser integration; commits = green vertical slices; Q&A gets links to CI artifacts, not pasted logs.
22. **Factual corrections**: semantic-locators dependency claim verified against npm today — you were right (`semantic-locators@2.1.0` → `accname@^1.1.0`); PRIOR-ART.md corrected. "Other sites trivial after P2" retracted → "cheaper: new pack + new capability adapter; adapters are real work." Fathom = MPL-2.0, pattern-inspiration only, clean-room note added. chatgpt-exporter repositioned as evidence for *API consumption*, not passive interception (hence the spike).
23. **Estimate honesty**: per-phase "days" removed; phases exit on acceptance gates, not calendar. No delivery-date claims.

---

## 2. Adopted with modification (argument attached)

**2.1 Signed release manifest — deferred, not adopted for v1.**
Your hardening list conflates two threat models. Against *accidental corruption*, the existing gates (typed parser, caps, version gate, preflight-before-activation, last-good retention) are sufficient and all adopted. Against *repo compromise*, an ed25519 manifest only helps if the signing key lives in a different compromise domain than the repo credentials. For a solo maintainer, key and repo credentials live on the same machine and same account recovery path — signing then adds key-management ritual with near-zero real attack-surface reduction. What actually bounds the damage is what we adopted from you: risk classes mean a hostile pack can, at worst, mis-target *read* anchors; action/input/destructive anchors are gated by code-owned invariants and capability preconditions regardless of pack content. Plus: SHA-pinned jsdelivr URLs offered as an opt-in strict mode, and max-size/complexity caps as adopted. Full signing becomes a hardening phase item when there is >1 maintainer or store-scale distribution. If you disagree, name the concrete attack that signing stops *for a solo maintainer* that risk-classes + pinning don't.

**2.2 "Delete DOM element caching" — narrowed, not deleted.**
Agreed: no cross-mutation, session-lived node cache (that was Option-B thinking; we took your Option A). Retained: (a) memoisation *within one synchronous feature operation* (resolve composer once, use for input+submit checks in the same tick — re-querying between the assert and the click reintroduces the TOCTOU you're warning about elsewhere); (b) winning-strategy-index caching, which your Option A explicitly endorses. So: nodes are never cached across ticks; strategy indices are.

**2.3 Static fixtures — kept, with your oracles; structural-JSON added as complement, not replacement.**
Your limits are real (no React state, no CSS-dependent visibility, no closed shadow DOM, no streaming transitions) and the plan already ran its integration tier in real Chromium via Playwright — only unit tests used happy-dom, and `interactable`-class predicates now explicitly require Chromium. But pure structural-JSON fixtures cannot test the CSS/layout-dependent predicates either — your own text concedes synthetic *browser* fixtures are needed for those. v2 therefore uses: sanitised-subtree HTML fixtures + identity oracles for locator precision; structural-JSON for cheap adversarial permutations; live self-test (your P6 design) for everything fixtures can't represent.

**2.4 Mutation testing — optional, not gate.**
For a solo/hobby-scale codebase the cost-benefit is thin; the precision gate that actually catches wrong-element selection is your oracle + adversarial corpus, which we adopted. Mutation testing goes in as a nice-to-have on resolver logic only.

**2.5 "anchorlib is becoming a second Playwright" — outcome accepted, framing overstated.**
We cut what you told us to cut. But note the capability layer you propose *is* Ophel's existing `SiteAdapter` (match/insertPrompt/etc.) and this repo's existing feature modules — v1's P3/P5 always routed through them; the plan failed to *name* that layer, which is a documentation defect more than an architecture rewrite. Effort delta of v2-vs-v1 is therefore smaller than the critique implies. Stated for estimation honesty, not as a defence of v1's wording.

---

## 3. Contested — answer these

**3.1 Action anchors: "exact-only, no remote heuristics" is adopted — but your `remotePolicy: "exact-only"` needs one clarification, because taken literally it kills the system's main value.**
The elements that churn most and hurt most *are* the action anchors (send button churns constantly; that is this week's actual breakage). If remote packs cannot update action-anchor strategies at all, every send-button churn is back to being a code release, and the framework only protects the anchors that rarely break. Our proposed boundary:
- Remote packs MAY update action-anchor strategies, but only from the *exact-match* strategy vocabulary: attribute-equals, role + accessible-name-equals/oneOf. No substring, no text-contains, no heuristic, no structural guessing.
- Code-owned invariants (`forbid` Dictate/Voice, must-be-HTMLButtonElement, enabled, inside trusted composer root, unique) and capability preconditions still gate every act, and cannot be modified remotely.
- Preflight: a new pack version must resolve action anchors to nodes passing all invariants before it can activate.
So the pack proposes *candidates*; code decides *trust*. Question: do you accept "remote may update exact strategies for action anchors under code-owned invariants", or do you maintain action anchors must be fully code-frozen — and if the latter, what is your churn story for the send button?

**3.2 Role+name locale criticism vs role+name in your own v1 core.**
You list "labels change with locale and wording experiments" as a prior-art weakness, yet your recommended v1 core includes role + accessible name, and your recommended descriptor uses `name.oneOf ["Send prompt", "Send message"]`. We agree with your descriptor, and note the `oneOf` name lists are pack *data* — meaning locale/wording churn is repaired by pack update, which is the system working as designed, and attr-equals strategies sit above role+name in authoring guidance anyway. Confirm this resolves your own tension, or say what you'd change.

**3.3 Extension self-test cadence/perf envelope.**
Adopted as primary canary. Constraint we're adding: probe is read-only, local-only, runs at most once per browser session at idle, hard budget ≤50ms main-thread total, and never touches action anchors' click paths. Anything you'd change about that envelope?

**3.4 Your Phase G placement.**
You call the data-layer spike a separate go/no-go project, which we adopt — but the spike is cheap (recorder + hook + comparison harness) and its recorder artefacts are exactly what the export feature and future fixtures need. We intend to run it in parallel with Phase D/E rather than after F. Any objection beyond scheduling taste?

---

## 4. Revised roadmap (v2) — adopting your A–G shape

- **A — Repair + evidence** (= old P0A): sanitised composer fixture, prompt/send hotfix, exact regression oracle, live smoke. DONE-gate: user confirms paste/send on chatgpt.com.
- **B — Local anchor contract** (= old P0B+P1 cut down): `packages/anchor-core/` in the Tampermonkey repo; css + attr-equals + role/name (dom-accessibility-api); root scoping, cardinality, invariants, evidence, ambiguity rejection. Composer capability + one contrasting read consumer (smart-copy ownership). Exit: two features share the core without special cases.
- **C — Ophel proof** (= old P5 part A reordered): centralise Ophel ChatGPT selectors into adapter-local config (also = upstream PR-1), targeted fixture tests, integrate anchor-core; DOMToolkit keeps lifecycle. Exit: same API in both repos. Only now extract anchor-core to its own repo (D1 fulfilled).
- **D — Pack format + overlays** (= old P2 hardened): public schema+packs repo, private sanitised corpus repo, base+overlay, typed parser, caps, preflight+atomic activation, last-two retention, pin/kill switch. Exit: a real selector-only breakage fixed by pack change.
- **E — Remote rollout + lightweight canary** (= old P3 tail + P6 head): stale-while-revalidate loader, extension self-test canary, action-anchor restrictions live.
- **F — Repair assistance** (= old P6 tail): candidate-report generator, selector-generator, optional LLM ranking, human-approved patch, no auto-merge.
- **G — Data-layer spike** (= old P4): go/no-go per §1.18; export-first if go. Runs parallel to D/E (see 3.4).

Milestones M1–M4 survive with metrics updated to the precision/recall framing.

---

## 5. Bookkeeping

Plan-doc edits implementing all §1 items are staged for after this exchange settles (single v2 rewrite instead of churning the docs twice). PRIOR-ART.md factual fixes (semantic-locators/accname, chatgpt-exporter framing, Fathom clean-room note) apply regardless of round 2.
