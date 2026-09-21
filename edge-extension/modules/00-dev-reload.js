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
        if (e.source !== window || !e.data || e.data.type !== 'tts-dev-reload') return;
        chrome.runtime.sendMessage({ action: 'devReload' });
    });
})();
