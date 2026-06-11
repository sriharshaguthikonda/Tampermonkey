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

        normalizeHotkeyValue(value) {
            return typeof value === 'string' ? value.trim() : '';
        },

        keyMatchesHotkey(event, hotkeyName, options = {}) {
            const configured = this.normalizeHotkeyValue(this.CONFIG.HOTKEYS && this.CONFIG.HOTKEYS[hotkeyName]);
            if (!configured) return false;
            const eventKey = String(event && event.key ? event.key : '');
            if (configured === 'Space') {
                return eventKey === ' ' || eventKey === 'Spacebar' || eventKey === 'Space';
            }
            if (options.caseInsensitive === true) {
                return eventKey.toLowerCase() === configured.toLowerCase();
            }
            return eventKey === configured;
        },

        setHotkeys(hotkeys, silent = false) {
            const source = hotkeys && typeof hotkeys === 'object' ? hotkeys : {};
            const map = {
                activate: 'ACTIVATE',
                pauseResume: 'PAUSE_RESUME',
                navNext: 'NAV_NEXT',
                navPrev: 'NAV_PREV',
                stop: 'STOP',
                boundaryStart: 'BOUNDARY_START',
                boundaryEnd: 'BOUNDARY_END',
                sessionPause: 'SESSION_PAUSE',
                speedDown: 'SPEED_DOWN',
                speedUp: 'SPEED_UP',
                replay: 'REPLAY',
                loopToggle: 'LOOP_TOGGLE',
                autoScrollToggle: 'AUTOSCROLL_TOGGLE'
            };
            const nextHotkeys = { ...(this.CONFIG.HOTKEYS || {}) };
            Object.entries(map).forEach(([storageKey, configKey]) => {
                if (Object.prototype.hasOwnProperty.call(source, storageKey)) {
                    nextHotkeys[configKey] = this.normalizeHotkeyValue(source[storageKey]);
                }
            });
            this.CONFIG.HOTKEYS = nextHotkeys;
            if (!silent) {
                this.showNotification('Shortcuts updated');
            }
        },

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
                const isNavNext = this.keyMatchesHotkey(e, 'NAV_NEXT');
                const isNavPrev = this.keyMatchesHotkey(e, 'NAV_PREV');
                const isNavKey = isNavNext || isNavPrev;
                const sessionHotkeysActive = this.shouldHandleNavigationHotkeys();
                const canUseIdleNav = this.CONFIG.IDLE_ARROW_NAVIGATION;

                if (isNavKey && !sessionHotkeysActive && !canUseIdleNav) {
                    this.navKeyHeld = false;
                    return;
                }

                if ((this.keyMatchesHotkey(e, 'BOUNDARY_START') || this.keyMatchesHotkey(e, 'BOUNDARY_END')) && sessionHotkeysActive) {
                    e.preventDefault();
                    this.navKeyHeld = false;
                    const previewOnly = !ctrlOrMeta;
                    this.jumpToBoundary(this.keyMatchesHotkey(e, 'BOUNDARY_START') ? 'start' : 'end', { previewOnly });
                    return;
                }

                if (this.keyMatchesHotkey(e, 'SESSION_PAUSE') && sessionHotkeysActive) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                    return;
                }

                if ((this.keyMatchesHotkey(e, 'SPEED_DOWN') || this.keyMatchesHotkey(e, 'SPEED_UP')) && sessionHotkeysActive && !ctrlOrMeta && !e.altKey) {
                    e.preventDefault();
                    this.adjustSpeechRateByStep(this.keyMatchesHotkey(e, 'SPEED_DOWN') ? -1 : 1);
                    return;
                }

                if (sessionHotkeysActive && !ctrlOrMeta && !e.altKey) {
                    if (this.keyMatchesHotkey(e, 'REPLAY', { caseInsensitive: true })) {
                        e.preventDefault();
                        this.replayCurrentParagraph();
                        return;
                    }
                    if (this.keyMatchesHotkey(e, 'LOOP_TOGGLE', { caseInsensitive: true })) {
                        e.preventDefault();
                        this.setLoopEnabled(!this.CONFIG.LOOP_ON_END);
                        persistProfileSetting(this.settingsProfile, 'loopOnEnd', this.CONFIG.LOOP_ON_END);
                        return;
                    }
                    if (this.keyMatchesHotkey(e, 'AUTOSCROLL_TOGGLE', { caseInsensitive: true })) {
                        e.preventDefault();
                        this.setAutoScrollEnabled(!this.CONFIG.AUTO_SCROLL_ENABLED);
                        persistProfileSetting(this.settingsProfile, 'autoScrollEnabled', this.CONFIG.AUTO_SCROLL_ENABLED);
                        return;
                    }
                }

                if (isNavNext) {
                    e.preventDefault();
                    this.navKeyHeld = this.navigate(ctrlOrMeta ? this.getNavigationJumpStep() : this.getArrowNavigationStep(), { previewOnly: true });
                    return;
                }
                if (isNavPrev) {
                    e.preventDefault();
                    this.navKeyHeld = this.navigate(ctrlOrMeta ? -this.getNavigationJumpStep() : -this.getArrowNavigationStep(), { previewOnly: true });
                    return;
                }
                if (this.keyMatchesHotkey(e, 'STOP')) {
                    e.preventDefault();
                    this.stopTTS();
                    return;
                }

                if (shiftOnly && this.keyMatchesHotkey(e, 'ACTIVATE', { caseInsensitive: true })) {
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
                } else if (ctrlShift && this.keyMatchesHotkey(e, 'PAUSE_RESUME', { caseInsensitive: true })) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                }
            });
            document.addEventListener('keyup', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;

                const key = e.key;
                if (this.keyMatchesHotkey(e, 'NAV_NEXT') || this.keyMatchesHotkey(e, 'NAV_PREV')) {
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
