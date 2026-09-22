# S8 — Model MCP Bridge recovery = churn-detector field test (cross-repo, POST-RELEASE)

Status: **PLANNED — investigation done 2026-09-22, implementation not started.** Handoff point is [§9](#9-handoff-point).
Parent: [PLAN.md §S8](PLAN.md#s8--model-mcp-bridge-recovery--churn-detector-field-test-post-release-cross-repo). Scope set by the user: the **ChatGPT channel** of the bridge. This is also the first field test of driftwatch against a consumer other than the TTS Reader. The pack was right, the consumer never asked it, and nothing caught that. That gap is the point of this stage.

Child plans (each repo owns its own fixes):

| Repo | Child plan | Owns |
|---|---|---|
| Prompt-queue | [plans/incident-2026-09-22-bridge-channel-dead.md](file:///C:/Windows_software/Chrome_extensions/Prompt-queue/plans/incident-2026-09-22-bridge-channel-dead.md) | S8.1–S8.5 (re-enable, consumer contract test, composer + response via pack, error text) |
| mcp-model-bridge | [docs/plans/browser-channel-recovery-2026-09.md](file:///C:/AI/mcp-model-bridge/docs/plans/browser-channel-recovery-2026-09.md) | S8.6–S8.8 (missing tests L1/L3, dead-channel diagnostics, client config) |
| driftwatch | [docs/ROADMAP.md → Active: consumer contract](file:///C:/Windows_software/driftwatch/docs/ROADMAP.md) | S8.9 (generic consumer audit, only after a second consumer adopts the contract) |

## 1. Failure points, ranked by evidence

| # | Finding | Evidence | Tag |
|---|---|---|---|
| F1 | **Prompt-queue is disabled in Edge Profile 2** (the bridge profile) since 2026-09-22 12:38:12.794 IST, `disable_reasons: [1]` (Chromium list encoding: 1 = DISABLE_USER_ACTION; RELOAD would be 4). At 12:35:51 IST an agent session (00aa27c0) had asked the user to switch off TTS Reader in Profile 2 and *leave Prompt-queue on*. TTS Reader is still enabled (record rewritten 12:44:29, no disable reason). Most likely the wrong toggle was switched, while no agent was running. | `Profile 2/Secure Preferences` → `extensions.settings.fmhpbbcgcpcacndbeldedphdcfnombfn` (copy parsed read-only); session transcript `00aa27c0…jsonl` 07:05:51Z; Profile 2 LevelDB holds claimant `d42ce029-…` = the heartbeat writer | VERIFIED |
| F2 | Native host dead since 12:38:11, one second before F1. `run()` exits on stdin EOF **without logging** (`native_host.py:915-929`); heartbeats come from the watch thread (`:770-789`, 15 s). No process is running and no `watch start` line appears after 09-21 15:39. A disabled extension has no service worker, so neither the watchdog alarm (`background.js:4286-4316`) nor the reconnect (`:4894-4904`) can run. | process scan 13:12 and 13:40; heartbeat mtime; host log timeline | VERIFIED |
| F3 | **After re-enable, new-chat jobs fail at composer-ready.** The lazy new-chat page exposes only a zero-size `textarea#pending-home-input`. `waitForComposerReady()` needs a positive-size candidate and throws `"Composer did not become ready before timeout"` after 10 s (`content.js:375-395`). This is the 2026-09-21 job error. | driftwatch fixture `2026-09-21-synthetic-new-chat` (jsdom); WP4 | VERIFIED |
| F4 | **After re-enable, reply capture finds nothing.** `responseCandidateSelectors()` (`content.js:589-597`) = `[data-testid^="conversation-turn-"]`, `[data-message-author-role="assistant"]`, `main .markdown`, and each matches **0** on every Sept fixture **and on the live page** (`00-live-dom-probe-2026-09-21.md:19`). Bridge jobs set `requireCapturedResponse=true` (`content.js:1346,1388,2206`), so completion can never succeed. | grep counts on `fixtures/chatgpt.com/current/*`; live probe | VERIFIED |
| F5 | Existing-conversation jobs: `resolveTarget('promptInput')` takes the first `div[contenteditable][role="textbox"]` (`content-targets.js:15-31`). On Sept fixtures that is the negative-oracle **`Edit code`** editor, not the form-scoped composer. Whether that editor has a positive live rectangle (and so gets the text) is unmeasured. | WP4 jsdom probe | VERIFIED on fixtures; live INFERRED |
| F6 | **The pack was healthy all along**: vendored pack audit on Sept fixtures gives ok 11–12 / broken 0. Lazy new-chat gives 1 ok (`pendingComposerInput`) + expected-absent. Prompt-queue routes only stop/send/exchange/assistant-unit through it (`content-chat-state.js:115,237,503`); composer-ready and response extraction are literals. S6.1 re-vendored the pack but explicitly left "full migration" to Prompt-queue, and it never happened. | WP4 §3; PLAN.md S6.1 text | VERIFIED |
| F7 | The outage is **silent to callers**: `ask_chatgpt` defaults to `fallback=true` and returns a public-model answer with `fallback_used: true` (`server.py:209-224`). The failed jobs' error strings are lost: the bridge deletes the result after reading (`chatgpt_browser.py:178-184, 206-221`), and the host finish log line has id + status only (`native_host.py:386`). | WP2, WP3 | VERIFIED |
| F8 | (side, not ChatGPT path) The bridge launches with a relative `--config config/model_bridge.toml` and no `cwd` (`~/.claude.json` user scope, bridge `.mcp.json`), so from any other cwd the TOML is silently skipped. Effect today: only `ollama.default_model` and `ollama.timeout_seconds` are lost; ChatGPT settings are code defaults either way. | WP1 probes from both cwds | VERIFIED |
| F9 | (side) `~/.claude.json` `mcpServers.model_bridge.env` holds literal `${VAR}` placeholders (lengths match exactly). Vars absent from Claude Code's own environment probably reach the bridge as the literal text and shadow `.env`, because process env wins. Expected result: cohere/mistral/openai 401 and gemini 400, while the same `.env` keys return 200 directly. Also: nvidia default model EOL (410), cerebras 402 payment required, sambanova 429. | hash-prefix comparison 13:35; WP2b probes | mechanism INFERRED, probes VERIFIED |
| F10 | (low) Two bridge processes waiting on the same job can both read one result (`exists` → read → delete, `OSError` ignored). 5 bridge processes run concurrently (one per client session). | `chatgpt_browser.py:178-184,206-221` | INFERRED race |

Ruled out (VERIFIED):
- MCP transport, handshake and schemas: `mcp==1.23.1` as pinned, protocol `2024-11-05`, 12 tools, all object schemas, from both cwds.
- Native-messaging registry and manifest: HKCU Edge + Chrome → `native_host.json` → `run_host.bat` exists; `allowed_origins` matches.
- SW/host code since last-known-good: `git diff 8cf6a02..HEAD` is empty for `background.js`, `native_host.py`, `run_host.bat` and `manifest.json`.
- Bridge code: HEAD == `fbaaf9b`.
- driftwatch is content-script-only (`background.js:1981`), so a vendor change cannot throw in the SW.

## 2. Exact failure path (today, 2026-09-22 13:40 IST)

```
MCP ask_chatgpt (Claude Code, stdio)
 → model_bridge_mcp.server (config silently = defaults, F8; irrelevant for ChatGPT)
 → ChatGPTBrowserProvider: alive_instances() = 0  (newest heartbeat 12:38:11 > 45 s, chatgpt_browser.py:25/60/96)
 → ChannelDownError → server.py:209-224 → router.ask_best → PUBLIC MODEL ANSWER, fallback_used:true   ← caller sees "an answer" (F7)
   (fallback=false → error no_live_browser_instance)
UPSTREAM: Edge Profile 2 Prompt-queue disabled 12:38:12 (F1) → no SW → native port closed → native_host stdin EOF → silent exit (F2)
LATENT, behind F1 (the churn):
 SW connectNative → host watch start/heartbeat → job announce → claim → findOrCreateBridgeTab (background.js:5070; new_chat → '/')
 → content: waitForComposerReady (content.js:378)
     new chat: only zero-size pending stub → "Composer did not become ready before timeout" → send_failed → finish status=error (F3)
     existing chat: first textbox may be "Edit code" (F5) → if sent: responseCandidateSelectors all 0 → never complete → completion timeout / empty_response (F4)
 → result file → bridge wait() reads + deletes → error text survives only in the one MCP response (F7)
```

Reproducible failure cases:
- **RC1 (now):** `bridge_health` → `chatgpt_browser.reachable=false, error=no_live_browser_instance`. Cause visible read-only in Profile 2 `Secure Preferences` (`disable_reasons [1]`).
- **RC2 (after S8.1):** the S8.2 red test on the driftwatch Sept fixtures, deterministic, no browser; plus one live synthetic job in a temporary chat.

## 3. Map: repos, files, configs

| Layer | Repo / file | Notes |
|---|---|---|
| Client config | `~/.claude.json` `mcpServers.model_bridge` (user scope); `~/.codex/config.toml` (has `cwd`, OK); `C:/AI/mcp-model-bridge/.mcp.json` | F8, F9 |
| Bridge | `C:/AI/mcp-model-bridge` `src/model_bridge_mcp/{server.py,config.py,health.py,router.py,providers/chatgpt_browser.py}`; `config/model_bridge.toml`; `.env`; runbook `docs/CHATGPT_PROMPTING.md:135-157`; `docs/handoff/HANDOFF.md` | HEAD `fbaaf9b` = last known good |
| Job folder | `C:/AI/bridge_jobs/chatgpt_browser/{jobs,heartbeats,logs}` | heartbeat `d42ce029-….json` |
| Native host | `C:/Windows_software/Chrome_extensions/Prompt-queue/{native_host.py,run_host.bat,native_host.json}`; HKCU `Software\Microsoft\Edge\NativeMessagingHosts\com.aipromptqueue.transcription` | unchanged since `8cf6a02` |
| Extension | Prompt-queue `background.js` (SW), `background-prompt-jobs.js`, `content.js`, `content-targets.js`, `content-chat-state.js`, `content-input.js`, `vendor/driftwatch.js`, `vendor/driftwatch-pack-chatgpt.json`; branch `feature/bridge-chatgpt-roundtrip` | Edge **Profile 2**, unpacked, id `fmhpbbcgcpcacndbeldedphdcfnombfn` |
| Pack / fixtures | `C:/Windows_software/driftwatch` `packs/chatgpt.com.json`, `fixtures/chatgpt.com/{current/*,2026-07-28-desktop,2026-09-21-synthetic-*}`, `expected-status.json` | pack healthy (F6) |
| Reusable solution | Tampermonkey `edge-extension/modules/25-prompt-send-part1.js:173-199` (lazy composer: write the stub through the native value setter + input event → page mounts the real composer), `23-resolution.js` | live-verified 2026-09-21 |

Last known good: 2026-07-28 job `20260728T000637Z_3847b1e51ff71f5d`, done in 54 s. At that point the repos were bridge `fbaaf9b`, Prompt-queue `8cf6a02` and driftwatch `98c59cc`.

## 4. Gaps still needing probes

| Gap | Probe | Who | Blocks |
|---|---|---|---|
| G1 | Re-enable Prompt-queue in Profile 2; confirm a new `watch start` line + advancing heartbeat + `bridge_health` reachable. **2026-09-22:** Claude in Chrome cannot reach `edge://extensions` (it rewrites it to `https://edge://…`), and computer-use gives browsers read tier only. So it takes one user click. The orchestrator opens the card with `msedge.exe --profile-directory="Profile 2" "edge://extensions/?id=fmhpbbcgcpcacndbeldedphdcfnombfn"`. TRAP: the Edge display names do not match the folders. Folder `Default` shows as "Profile 1" (Prompt Queue ON), and folder `Profile 2` shows as **"Electronics"**, the bridge profile. The first ask sent the user to the wrong window. | user click, then the orchestrator verifies | S8.1 |
| G2 | Live rectangle of the `Edit code` editor on an existing conversation (F5): temp chat, synthetic prompt, booleans/counts only | orchestrator via Claude in Chrome | S8.3 scope |
| G3 | Confirm F9: spawn the bridge with `COHERE_API_KEY='${COHERE_API_KEY}'`, run live health → expect 401 | codex luna | S8.8 |
| G4 | Job-contract table with every timeout (claim deadline, completion wait, worst-case wall time). **DONE 2026-09-22 (ornith WP6).** Bridge side: claim deadline 60 s → `ChannelDownError`; response deadline 600 s. Extension side: `waitForTabComplete` 30 s, settle 2 s, composer-ready 10 s, send window 60 s, send-button observer 5 s. The completion wait is **unbounded by default**, so the bridge's 600 s is the binding limit. Host side: unclaimed TTL 1800 s; claim TTL 3600 s with requeue until attempts ≥ 2; results kept 86400 s. Two places lose the error text: the content `RESPONSE_COMPLETE` send fails silently (`content.js:2284`), and a claim-expiry requeue keeps only `attempts`. The `ChannelDownError` text still says "reload"; S8.7b fixes it to "enable". | ornith | S8.4, S8.7 |
| G5 | Full test counts in a writable env (codex read-only sandbox blocked pytest temp dirs and jest cache: 0 tests ran). **Bridge: 139 → 143 passed (S8.6/S8.7, `0f34e22`).** Prompt-queue count comes with S8.2–S8.4. | first implementation worker | baseline for every gate |

## 5. Minimal implementation sequence

Order is strict where marked →; ∥ may run in parallel lanes.

1. **S8.1 (Prompt-queue, ops)**: re-enable → G1 evidence. Expected: channel alive, jobs still fail (F3/F4). This gives the live reproducer RC2.
2. → **S8.2 (Prompt-queue)**: RED consumer contract test `tests/consumer-selector-audit.test.js` (~65 LOC, jest/jsdom, vendored pack, driftwatch Sept fixtures by path; no capture copied — privacy rule). It must fail on today's code for F3, F4 and F5.
3. → **S8.3 (Prompt-queue)**: route composer + response extraction through the pack:
   - composer via `composer` (form-scoped) first; legacy literals kept as fallbacks, never first;
   - lazy new chat via `pendingComposerInput` using the Tampermonkey stub-write technique;
   - reply via `assistantUnit` / `assistantMarkdownRoot`.
   S8.2 goes green.
4. ∥ **S8.4 (Prompt-queue)**: persist error text. Host finish log line carries the error string (`native_host.py:386`); `run()` logs its own exit (F2, F7).
5. ∥ **S8.6 (bridge)**: tests for untested layers L1/L3 (stdio launch + initialize from a foreign cwd), promoted from the WP1 probe.
6. ∥ **S8.7 (bridge)**: dead-channel diagnostics.
   - `bridge_health` and the `ask_chatgpt` fallback response say *why* (heartbeat age + "extension disabled or native host dead" hint);
   - the runbook `CHATGPT_PROMPTING.md` gains the disabled-extension check (Profile 2 `disable_reasons`);
   - keep `fallback=true` (user-chosen in `7a3129e`).
7. → **S8.5 (live gate, orchestrator)**: one synthetic job, `target_url=https://chatgpt.com/?temporary-chat=true`. Require `announce → claim → send → stop_observed → completion_decision → finish → result`, `status=done`, `text_chars>0`, `conversation_url` present (HANDOFF.md §Next steps). Then one existing-conversation job, the same way.
8. **S8.8 (bridge + user's client config, P2)**: absolute `--config` (or `cwd`) in `~/.claude.json` + `.mcp.json`; drop the `${VAR}` env block so `.env` loads (after G3). Also replace EOL/archived default models (nvidia, cerebras). Needs a client restart.
9. **S8.9 (driftwatch, deferred)**: lift the S8.2 contract into a generic `consumerAudit()` only once the Tampermonkey edge-extension adopts the same contract. WP4 advice: no CLI before a second consumer needs it.

## 6. Delegated work packages (implementation phase)

| WP | Step | Lane (routing rule 2026-09-21) | Brief essentials | ACCEPT |
|---|---|---|---|---|
| IP1 | S8.1 | orchestrator (browser) | toggle only, no reload of other extensions | G1 evidence lines |
| IP2 | S8.2 | Z Code `flash-worker` (GLM-5.3-Flash) | file path, route list, fixture paths, oracle names; test must be RED | `npx jest tests/consumer-selector-audit.test.js` exits 1 with F3/F4/F5 reasons |
| IP3 | S8.3 | Z Code main GLM-5.3 (LARGE, cross-file) | reuse `25-prompt-send-part1.js:173-199`; pack-first, literal fallback; no behavioural change outside composer/response | IP2 test green + full `npx jest --silent` + `node --check` touched files |
| IP4 | S8.4 | ornith edit-capable agent (`python-specialist`) with byte-exact old/new blocks | 2 edits in `native_host.py` | `python -m pytest tests/test_native_host_jobs.py` |
| IP5 | S8.6 | codex gpt-5.6-terra | promote WP1 probe to `tests/test_stdio_launch.py` | `python -m pytest -q` in a writable env |
| IP6 | S8.7 | codex gpt-5.6-sol | health/fallback text + runbook paragraph | tests green; runbook grep |
| IP7 | review | codex gpt-6-astra (**review only**) | diffs of IP2–IP6 | verdict ≠ REWORK |
| IP8 | S8.5 | orchestrator (browser + MCP) | synthetic prompts, temp chat only | gate sequence in §5.7 |

Claude Sonnet/Haiku subagents are a fallback only when Z Code and codex are both out, and any such fallback is recorded in Q&A.

## 7. QA matrix — verify each layer; "process started" is not proof

| Layer | Check | Today | Test that locks it |
|---|---|---|---|
| L1 launch | server starts from foreign cwd, reports config source | PASS (silent defaults, F8) | NEW `test_stdio_launch.py` (S8.6) |
| L2 discovery | intended client lists `model_bridge` | PASS | `smoke_mcp_stdio.py` |
| L3 handshake | `initialize` → `2024-11-05` | PASS | NEW (S8.6) |
| L4 tools | 12 tools, object schemas | PASS | `smoke_mcp_stdio.py` |
| L5 request reaches bridge | `submit_chatgpt_prompt` writes job json | PASS (mocked) | `test_chatgpt_browser.py` |
| L6 bridge reaches provider | heartbeat < 45 s, host claims job | **FAIL (F1/F2)** | `test_native_host_jobs.py` + S8.5 live |
| L7 response returns | `status=done`, `text_chars>0`, `conversation_url` | **FAIL (F3/F4)** | S8.2 (fixture) + S8.5 (live) |
| L8 diagnosable failures | error text persisted; host exit logged; fallback says why | **FAIL (F7)** | S8.4 + S8.7 tests |
| L9 reconnect/restart | disable → enable → heartbeat within 15 s; SW eviction → alarm reconnect | untested live | S8.5 step: toggle once, re-run gate |
| L10 original client | Claude Code `ask_chatgpt fallback=false` returns a real ChatGPT answer | **FAIL** | S8.5 |
| L11 DOM contract | consumer routes resolve the pack oracles on current fixtures | **FAIL (F3–F6)** | S8.2 |

Regression tests to add (name → layer → where):
- `consumer-selector-audit.test.js` → L11 → Prompt-queue `tests/`
- `test_native_host_logs_exit_and_error` → L8 → Prompt-queue `tests/test_native_host_jobs.py`
- `test_stdio_launch_foreign_cwd` + `test_initialize_handshake` → L1/L3 → bridge `tests/`
- `test_env_placeholder_treated_as_missing` → L6 (F9) → bridge `tests/test_env_loading.py`
- `test_ask_chatgpt_fallback_explains_channel_down` → L8 → bridge `tests/test_server_contract.py`
- live gate script (manual, synthetic, temp chat) → L6/L7/L10 → bridge `scripts/`, documented in HANDOFF.md

## 8. Churn-detector lessons (feed driftwatch)

- A healthy pack does not prove a healthy consumer. The missing check was "does the consumer's job path resolve through the pack", which S8.2 adds.
- Re-vendoring without a consumer contract test gives a false green: S6.1 passed jest 219/219 while the job path was dead.
- User-facing toggles in a shared browser profile are a failure source. The live-test instructions for Profile 2 have to name the extension card exactly (path + id), and the agent should re-check `disable_reasons` afterwards.

## 9. Handoff point

Planning ends here. Implementation starts at **S8.1/IP1** in a later turn when the user says go. Before IP2, clear G5 (a writable test env). Nothing in §5 has been started. The investigation reports are session scratch (not committed); every fact they provided is restated above with its evidence.
