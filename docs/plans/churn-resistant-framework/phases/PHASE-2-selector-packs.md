# P2 — Selector packs: schema, repo, loader

Depends: P1 (anchorlib API frozen). Blocks: P3, P5.
Design refs: 00-DESIGN.md "Selector pack", D2/D3. Rules: AGENT-RULES.md 8, 13.

## Goal
Selectors live as versioned remote JSON. Site change = pack bump; consumers pick it up within TTL; corrupt/malicious pack cannot brick consumers.

## Tasks
1. **Schema v1** — `schema/pack.schema.json` (ajv-compatible) formalizing 00-DESIGN.md sketch: `schema`, `site`, `version` (date-serial, regex-enforced), `minLib`, `elements{ critical, strategies[], validate[], cache }`. Commit with 3 valid + 5 invalid example fixtures and a validation test.
2. **Repo `selector-packs`** — create (public GitHub, MIT), CI: ajv validation, version-monotonicity vs previous commit, fixture-regression against pinned anchorlib version (downloads corpus artifact from anchorlib repo or vendors snapshots).
3. **Author `chatgpt.com.json` v1** — source of truth: fresh DOM snapshot (capture day-of) + historical snapshots. Elements v1 (from consumer needs): `prompt-box`, `send-button`, `stop-button`, `assistant-message`, `user-message`, `message-container`, `conversation-turn`, `main-scroll-container`, `voice/dictation-buttons` (to EXCLUDE from send matching — #19 lesson), plus TTS-needed nodes from P3 inventory and ophel-needed nodes from P5 inventory (TOC container, native toc items). Every element: ≥2 strategies + heuristic tail where sane; `critical` flags set.
4. **Consumer contract files** — `contracts/<consumer>.json` listing element ids each consumer requires; CI cross-checks pack covers all contracts (TESTING.md §6). Known consumers: `tampermonkey-extension`, `tampermonkey-userscript`, `ophel-fork`, `prompt-queue` (D8b — Prompt-queue integration is a small follow-on after P3, same loader pattern; add its required elements to the chatgpt pack when it onboards).
5. **Loader (consumer half, in anchorlib or small companion module)** — `fetchPack(siteId, {bakedPack, storage, fetcher})`: remote raw.githubusercontent (or jsdelivr SHA-pinned) → ETag/TTL (default 6h) → ajv-lite structural validation (subset validator, no dep) → version-gate vs baked + vs last-good → persist last-good → rollback on failure. Injectable `fetcher`/`storage` so userscript uses GM_xmlhttpRequest/GM storage and MV3 uses fetch/chrome.storage. Unit tests: all failure paths (TESTING.md §1).
6. **Kill switch / pin** — consumer-side setting `packPin: "<version>|baked"` honored by loader. Test.
7. **Docs** — packs repo README: how to bump a pack (the repair playbook: snapshot → edit → regression matrix → merge), schema reference, security model (data-only, what the lib refuses).

## Acceptance gates
- Both repos' CI green (paste).
- Resolution matrix: `chatgpt.com.json` resolves 100% of contract elements on newest snapshot, ≥90% across full corpus (S1 baseline recorded).
- Loader fault matrix all green: offline first-run (baked), corrupt remote, downgrade attempt, schema-invalid, TTL refresh, pin honored.
- End-to-end demo: edit pack in local clone → consumer test harness picks up new version → element resolves via new primary (log evidence).
