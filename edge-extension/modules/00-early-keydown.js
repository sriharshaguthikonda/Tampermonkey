// Runs at document_start, before chatgpt.com's own scripts. chatgpt.com's
// "type anywhere" is a window capture keydown listener that moves focus into
// the composer and inserts the character itself, so only a listener
// registered before it can claim TTS hotkeys. 85-events.js installs the real
// handler into window.__TTSEarlyKeydown once the reader has loaded.
(function () {
    'use strict';
    if (window.__TTSEarlyKeydownInstalled) return;
    window.__TTSEarlyKeydownInstalled = true;
    window.addEventListener('keydown', (e) => {
        if (typeof window.__TTSEarlyKeydown === 'function') window.__TTSEarlyKeydown(e);
    }, true);
})();
