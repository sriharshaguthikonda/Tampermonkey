(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 21: Notifications & Drag
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        showNotification(message, durationMs = 2500) {
            let existing = document.getElementById('tts-notification-popup');
            if(existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = 'tts-notification-popup';
            notification.setAttribute('data-tts-ui', 'true');
            notification.setAttribute('aria-hidden', 'true');
            notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: var(--tts-ui-overlay-bg); color: var(--tts-ui-overlay-text); border: 1px solid var(--tts-ui-overlay-border); padding: 10px 20px; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px; z-index: 2147483647; opacity: 0; transition: opacity 0.3s; user-select: none; -webkit-user-select: none;`;
            notification.textContent = message;
            document.body.appendChild(notification);
            setTimeout(() => { notification.style.opacity = '1'; }, 10);
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
            }, Math.max(600, Number(durationMs) || 2500));
        },

        makeDraggable(el, onDrop = null) {
            let isDown = false, startX, startY, origLeft, origTop;
            el.addEventListener('mousedown', e => {
                if(e.target.tagName === 'INPUT') return;
                isDown = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = el.getBoundingClientRect();
                origLeft = rect.left;
                origTop = rect.top;
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!isDown) return;
                el.style.left = (origLeft + e.clientX - startX) + 'px';
                el.style.top = (origTop + e.clientY - startY) + 'px';
            });
            document.addEventListener('mouseup', () => {
                if (!isDown) return;
                isDown = false;
                const rect = el.getBoundingClientRect();
                const position = this.clampOverlayPosition({ left: rect.left, top: rect.top }, el);
                el.style.left = `${position.left}px`;
                el.style.top = `${position.top}px`;
                if (typeof onDrop === 'function') {
                    onDrop(position);
                }
            });
        },
    });
})();
