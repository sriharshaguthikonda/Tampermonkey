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
