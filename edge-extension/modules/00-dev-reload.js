// Dev-only (PLAN S4.0): lets an agent driving the page reload this unpacked
// extension without a human on edge://extensions. Page JS runs
// window.postMessage({ type: 'tts-dev-reload' }, '*'); background.js reloads
// the extension, then the agent reloads the tab. Store installs carry
// update_url in the manifest, so the hook is inert there.
(function () {
    'use strict';
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getManifest) return;
    if ('update_url' in chrome.runtime.getManifest()) return;

    // S4 live-smoke probes (dev only). Statuses, counts and booleans only — never page
    // text, so nothing a conversation says can leave the tab through the pong.
    // Spoken-text probe: counts and booleans about what reached speechSynthesis.speak
    // in this (content-script) world. The text itself is never stored.
    const speechProbe = { hooked: false, tokens: [], utterances: 0, leadingEmoji: 0, tokenHits: {} };

    function hookSpeech() {
        if (speechProbe.hooked || !window.speechSynthesis) return;
        speechProbe.hooked = true;
        const synth = window.speechSynthesis;
        const speak = synth.speak.bind(synth);
        synth.speak = (utterance) => {
            const text = String((utterance && utterance.text) || '');
            speechProbe.utterances += 1;
            if (/^\s*\p{Extended_Pictographic}/u.test(text)) speechProbe.leadingEmoji += 1;
            speechProbe.tokens.forEach((t) => {
                if (text.includes(t)) speechProbe.tokenHits[t] = (speechProbe.tokenHits[t] || 0) + 1;
            });
            return speak(utterance);
        };
    }

    function devProbes(req, r) {
        const out = {};
        if (!r) return out;
        if (Array.isArray(req.config) && r.CONFIG) {
            out.config = Object.fromEntries(req.config.map((k) => [k, r.CONFIG[k]]));
        }
        if (typeof req.audit === 'string' && typeof r.getChatGptPack === 'function' && window.driftwatch) {
            const pack = r.getChatGptPack();
            const report = pack ? window.driftwatch.audit(pack, document, { state: req.audit }) : null;
            out.audit = report
                ? Object.fromEntries(Object.entries(report.anchors).map(([n, a]) => [n, `${a.status}@${a.strategyIndex}`]))
                : null;
        }
        out.state = {
            ttsActive: !!r.ttsActive,
            exchanges: typeof r.exchanges === 'function' ? r.exchanges().length : null,
            historyLength: Array.isArray(r.promptHistory) ? r.promptHistory.length : null,
            copyRows: document.querySelectorAll('.tmx-copy-row').length,
            currentSentences: document.querySelectorAll('.tts-current-sentence').length
        };
        if (Array.isArray(req.tokens) && typeof r.collectSmartCopyEntriesFromMessages === 'function') {
            // Agent-authored synthetic tokens: for each, the index of the first smart-copy
            // entry containing it (-1 when none), plus the entry roles in order.
            const entries = r.sortSmartCopyEntries(r.collectSmartCopyEntriesFromMessages(r.getConversationMessageElements()));
            out.smartCopy = {
                roles: entries.map((entry) => entry.role),
                tokens: Object.fromEntries(req.tokens.map((t) => [t, entries.findIndex((entry) => String(entry.text || '').includes(String(t)))]))
            };
        }
        const diag = window.__TTSNS && window.__TTSNS.diagnostics;
        if (typeof req.debug === 'boolean' && r.CONFIG) {
            r.CONFIG.DEBUG_LOGGING = req.debug;
            if (diag) (req.debug ? diag.enable() : diag.disable());
        }
        if (diag && typeof diag.getDiagnostics === 'function') {
            // Entry details can carry page text, so only counts leave the tab.
            const buffer = diag.getDiagnostics().buffer || [];
            out.diag = {
                debug: !!(r.CONFIG && r.CONFIG.DEBUG_LOGGING),
                entries: buffer.length,
                errors: buffer.filter((entry) => entry.level === 'error').length
            };
        }
        const current = document.querySelector('.tts-current-sentence');
        const exchangeEl = current && typeof r.exchangeForElement === 'function' ? r.exchangeForElement(current) : null;
        const markdownRoot = exchangeEl ? r.resolveInExchange('assistantMarkdownRoot', exchangeEl) : null;
        out.state.currentInMarkdownRoot = Boolean(markdownRoot && markdownRoot.contains(current));
        if (typeof r.hasBlockingOpenElements === 'function' && typeof r.findPromptArea === 'function') {
            // What the global paste guard would decide right now.
            const promptArea = r.findPromptArea();
            out.state.pasteBlocked = r.hasBlockingOpenElements(promptArea);
            out.state.promptFocused = Boolean(promptArea && r.isPromptFocused(promptArea));
        }
        if (Array.isArray(req.tokens)) speechProbe.tokens = req.tokens.map(String);
        if (req.hookSpeech) hookSpeech();
        out.speech = {
            hooked: speechProbe.hooked,
            utterances: speechProbe.utterances,
            leadingEmoji: speechProbe.leadingEmoji,
            tokenHits: speechProbe.tokenHits,
            paragraphs: Array.isArray(r.paragraphsList) ? r.paragraphsList.length : null,
            currentIndex: Number.isInteger(r.currentParagraphIndex) ? r.currentParagraphIndex : null
        };
        return out;
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data) return;
        if (e.data.type === 'tts-dev-ping') {
            // Lets the agent see which build is live before and after a reload.
            const m = chrome.runtime.getManifest();
            const ns = window.__TTSNS;
            const r = ns && ns.TTSReader;
            const anchors = Array.isArray(e.data.anchors) ? e.data.anchors : [];
            window.postMessage({
                type: 'tts-dev-pong',
                version: m.version,
                build: (ns && ns.BUILD) || null,
                scripts: m.content_scripts.flatMap((c) => c.js),
                paste: r && r.CONFIG ? {
                    global: r.CONFIG.GLOBAL_PASTE_ENABLED,
                    regular: r.CONFIG.REGULAR_PASTE_ENABLED,
                    nice: r.CONFIG.NICE_AUTO_PASTE_ENABLED
                } : null,
                // Booleans only: which pack anchors resolve on this page right now.
                resolved: r && typeof r.resolveSingleton === 'function'
                    ? Object.fromEntries(anchors.map((a) => [a, !!r.resolveSingleton(String(a))]))
                    : null,
                ...devProbes(e.data, r)
            }, '*');
            return;
        }
        if (e.data.type !== 'tts-dev-reload') return;
        chrome.runtime.sendMessage({ action: 'devReload' });
    });
})();
