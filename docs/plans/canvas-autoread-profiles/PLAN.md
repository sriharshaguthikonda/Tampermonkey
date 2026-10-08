# Email/canvas card reading + cross-profile auto-read — plan

Started 2026-10-08. Branch `enhance-tts-functionality`. Owner asks (Q&A + chat): the TTS extension must read the ChatGPT email "text box" card, auto-read must behave the same in every Edge profile, and Ophel interactions must be understood. Delegate to codex luna + ornith (no Claude subagents); ChatGPT via the bridge is the second brain; prior art before new code.

## Findings (live-verified 2026-10-08, three Edge profiles via Claude-in-Chrome, `tts-dev-ping` probe)

| Browser | Edge profile (dir / name) | TTS build loaded | Ophel | Auto-read new | hiddenTabPolicy |
|---|---|---|---|---|---|
| B1 | `Default` / "Profile 1" | `edge-extension/` source (id `bckenhfp…`) | Ophel Atlas 1.2.11 (store, Plasmo shadow root present) | **ON** | never |
| B2 | `Profile 1` / "Social" | `dist/prod` snapshot built 2026-09-22 (id `gaggddgf…`) | Ophel unpacked (`Chrome_extensions/ophel/build/chrome-mv3-prod`) | **OFF** | delay |
| B3 | `Profile 2` / "Electronics" | `edge-extension/` source (id `bckenhfp…`) | Ophel unpacked, **disabled** | **OFF** | never |

1. **Settings are per Edge profile.** They live in `chrome.storage.sync`, which does not sync for unpacked extensions, and `autoRead` defaults to `false` (`edge-extension/profile.js`). So "auto read works in some profiles" = the toggle is only ON in B1. Other toggles also differ (auto-scroll, skip-on-nav, paste toggles, start +X words).
2. **Two different code paths are loaded.** B2 runs the `dist/prod` copy (gitignored build output), so a source fix does nothing there until `node build.js` and an extension reload. B1/B3 run source directly.
3. **Email card unreadable — root cause (verified with `closest()` per selector).** Card = `div[data-testid="chatgpt-writing-block"][data-writing-block-variant="email"]`. Its Tailwind class tokens contain `--codex-base-accent` / `--codex-chat-font-size`; the pack ignore selector `[class*="code"]` (`22-driftwatch.js` `data.ignoreSelectors`) substring-matches "codex", so `isVisiblyReadable()` rejects every `p`/`li` in the email body. The Subject is a `textarea` (value, not text) and never a candidate. The body is a live `contenteditable` editor: word-wrapping spans inside it would corrupt the draft.
4. **Ophel.** Live: the TTS reader scans and plays the email card in the Ophel profiles too (Ophel enabled in B1/B2); no live interference found. Static ornith audit of Ophel `src/` (read-only) lists latent risks only: MAIN-world `scroll-lock-main.ts` patches `scrollIntoView`/`scrollTo`/`scrollTop` and blocks downward scrolls when its lock toggle is on (off by default); inline-bookmark/copy-manager inject spans, classes and buttons into message bodies and run body MutationObservers; a capture-phase `dblclick` handler on formulas. None of these is a keyboard-capture conflict (Ophel's P/U/R/L shortcuts live in its own UI, not on the page). If auto-scroll ever stalls on an Ophel profile, first check Ophel's scroll-lock toggle.
5. **Settings drift beyond auto-read** (`tts-dev-settings` read-only probe): timings, skip toggles, paste toggles and hotkeys differ per profile. Hotkeys saved as empty strings are the documented "empty disables that shortcut" behaviour, not a bug.

## Tasks and lanes

| ID | Task | Lane | Status |
|---|---|---|---|
| T1 | Fix card reading: token-anchored ignore selectors, Subject textarea, no DOM mutation inside contenteditable, userscript parity; TDD with synthetic fixture `fixtures/chatgpt.com/writing-block/` + `test_writing_block_reading.js` | codex gpt-6-luna | done (`04a032f`; driftwatch pack `4e95be3`) |
| O1 | Ophel interference audit (read-only, source in `C:/Windows_software/Chrome_extensions/ophel`) | ornith (`local.sh`) | done (finding 4) |
| T2 | Cross-profile settings parity: options-page Export/Import settings JSON (prior art: plain JSON export/import is what settings-bearing extensions ship; bundled-defaults+diff is a larger later refactor) | codex luna | dispatched |
| T3 | `node build.js` + reload all three profiles via `tts-dev-reload`; live verify card reading + auto-read in each | Claude (browser tools only) | verified live before the review fixes; re-verify after final build |
| T4 | Second-brain review of the fix and the settings design | ChatGPT via model_bridge | done; export/import now, bundled defaults + diffs later |
| T5 | Codex luna read-only review of the T1 diff | codex luna | done; fixes applied (blank Subject skipped, `isContentEditable`-safe editable selector, settings probe made read-only) |

## Safety notes
- Never reload an extension while a bridge job is claimed (`ls C:/AI/bridge_jobs/chatgpt_browser/job_*.claimed.*` must be empty) — memory lesson 2026-09-24. The TTS extension reload does not touch the Prompt-queue extension, but check anyway before any reload sentinel.
- The card body is the user's draft: highlight code must never insert nodes into it.
- Synthetic fixtures only; no real conversation text in the repo.

## Status log
- 2026-10-08 live comparison done (table above); T1 and O1 dispatched.
- 2026-10-08 T1 landed. Live (synthetic events, hidden tabs): `paragraphScan` = 105 paragraphs, 20 inside the card, Subject read, 19 body items editable; playback starts inside the card; editor DOM unchanged. Verified in all three profiles. Auto-read flipped ON via the settings probe path in the two profiles that had it OFF (revert: options page -> Auto read off -> Save).
- 2026-10-08 root cause fixed at the source: driftwatch `packs/chatgpt.com.json` selectors are class-token anchored and a pack lint test rejects bare `[class*=...]` substring selectors (driftwatch `4e95be3`); extension `22-driftwatch.js` re-vendored (`check-stamp` ok), userscript block re-spliced, userscript `@version 3.20`.
- 2026-10-08 dev probes added (`00-dev-reload.js`, inert on store installs): `paragraphScan` counts and read-only `tts-dev-settings` drift report.
- 2026-10-08 open: T2 export/import (dispatched), final `node build.js` + reload + quick re-verify in the three profiles.
