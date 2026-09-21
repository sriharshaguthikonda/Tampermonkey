// Dev-only (PLAN S4.0): lets an agent driving the page reload this unpacked
// extension without a human on edge://extensions. Page JS runs
// window.postMessage({ type: 'tts-dev-reload' }, '*'); background.js reloads
// the extension, then the agent reloads the tab. Store installs carry
// update_url in the manifest, so the hook is inert there.
(function () {
    'use strict';
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getManifest) return;
    if ('update_url' in chrome.runtime.getManifest()) return;
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
                    : null
            }, '*');
            return;
        }
        if (e.data.type !== 'tts-dev-reload') return;
        chrome.runtime.sendMessage({ action: 'devReload' });
    });
})();
