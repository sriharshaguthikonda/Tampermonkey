(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    const { persistProfileSetting } = ns.helpers;

    Object.assign(ns.TTSReader, {
        // SECTION 18: Event Listeners
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                this.markUserInteraction();
                if (this.handleSmartCopyShortcut(e)) return;
                this.capturePromptForNativeEnterSend(e);
                this.handleEnterToSend(e);
                if (this.handlePromptHistoryHotkeys(e)) return;

                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
                const key = e.key;
                const keyLower = String(key || '').toLowerCase();
                const shiftOnly = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
                const ctrlShift = e.ctrlKey && e.shiftKey;
                const ctrlOrMeta = e.ctrlKey || e.metaKey;
                const KEY = this.CONFIG.HOTKEYS;
                const isNavKey = key === KEY.NAV_NEXT || key === KEY.NAV_PREV;
                const sessionHotkeysActive = this.shouldHandleNavigationHotkeys();
                const canUseIdleNav = this.CONFIG.IDLE_ARROW_NAVIGATION;

                if (isNavKey && !sessionHotkeysActive && !canUseIdleNav) {
                    this.navKeyHeld = false;
                    return;
                }

                if ((key === 'Home' || key === 'End') && sessionHotkeysActive) {
                    e.preventDefault();
                    this.navKeyHeld = false;
                    const previewOnly = !ctrlOrMeta;
                    this.jumpToBoundary(key === 'Home' ? 'start' : 'end', { previewOnly });
                    return;
                }

                if ((key === ' ' || key === 'Spacebar') && sessionHotkeysActive) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                    return;
                }

                if ((key === '[' || key === ']') && sessionHotkeysActive && !ctrlOrMeta && !e.altKey) {
                    e.preventDefault();
                    this.adjustSpeechRateByStep(key === '[' ? -1 : 1);
                    return;
                }

                if (sessionHotkeysActive && !ctrlOrMeta && !e.altKey) {
                    if (keyLower === 'r') {
                        e.preventDefault();
                        this.replayCurrentParagraph();
                        return;
                    }
                    if (keyLower === 'l') {
                        e.preventDefault();
                        this.setLoopEnabled(!this.CONFIG.LOOP_ON_END);
                        persistProfileSetting(this.settingsProfile, 'loopOnEnd', this.CONFIG.LOOP_ON_END);
                        return;
                    }
                    if (keyLower === 'a') {
                        e.preventDefault();
                        this.setAutoScrollEnabled(!this.CONFIG.AUTO_SCROLL_ENABLED);
                        persistProfileSetting(this.settingsProfile, 'autoScrollEnabled', this.CONFIG.AUTO_SCROLL_ENABLED);
                        return;
                    }
                }

                switch (key) {
                    case KEY.NAV_NEXT:
                        e.preventDefault();
                        this.navKeyHeld = this.navigate(ctrlOrMeta ? this.getNavigationJumpStep() : 1, { previewOnly: true });
                        break;
                    case KEY.NAV_PREV:
                        e.preventDefault();
                        this.navKeyHeld = this.navigate(ctrlOrMeta ? -this.getNavigationJumpStep() : -1, { previewOnly: true });
                        break;
                    case KEY.STOP: e.preventDefault(); this.stopTTS(); break;
                }

                if (shiftOnly && key.toUpperCase() === KEY.ACTIVATE) {
                    e.preventDefault();
                    this.clearStalePlaybackFlagsIfIdle();
                    if (this.isPlaybackSessionActive()) { this.stopTTS(); return; }
                    document.body.style.cursor = 'crosshair';
                    this.showNotification('Click where you want to start reading');

                    const clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.style.cursor = 'default';
                        this.startReadingOnClick(ev);
                    };
                    document.addEventListener('click', clickHandler, { once: true, capture: true });
                } else if (ctrlShift && key.toUpperCase() === KEY.PAUSE_RESUME) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                }
            });
            document.addEventListener('keyup', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;

                const key = e.key;
                const KEY = this.CONFIG.HOTKEYS;
                if (key === KEY.NAV_NEXT || key === KEY.NAV_PREV) {
                    if (!this.navKeyHeld && this.pendingNavIndex === -1) return;
                    e.preventDefault();
                    this.navKeyHeld = false;
                    this.startReadingFromPendingNav();
                }
            });
            if (!this.smartCopyCopyHandler) {
                this.smartCopyCopyHandler = (event) => this.handleSmartCopyCopyEvent(event);
                document.addEventListener('copy', this.smartCopyCopyHandler, true);
            }
            document.addEventListener('dblclick', (event) => this.handleSelectionSeek(event), true);
            const interactionHandler = () => this.markUserInteraction();
            window.addEventListener('wheel', interactionHandler, { passive: true });
            window.addEventListener('touchstart', interactionHandler, { passive: true });
            window.addEventListener('pointerdown', interactionHandler, { passive: true });
            window.addEventListener('scroll', () => {
                if (!this.autoScrollInProgress) this.markUserInteraction();
            }, { passive: true });
            window.addEventListener('resize', () => {
                this.applyOverlayPanelPosition(this.CONFIG.OVERLAY_POSITION);
                this.resizeNavigationTrailLayer();
                this.renderNavigationTrail(performance.now());
            });
            document.addEventListener('visibilitychange', () => this.handleVisibilityPlaybackGuard(), { passive: true });
            window.addEventListener('pagehide', () => {
                this.logPlaybackGuardEvent('pagehide');
                this.stopTTS(false);
            });
            window.addEventListener('beforeunload', () => {
                this.logPlaybackGuardEvent('beforeunload');
                this.stopTTS(false);
            });
        },

        // --- UI AND POINTER LOGIC ---

        // =============================================================================
    });
})();
