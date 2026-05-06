(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 04: Playback Lock (cross-tab)
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        generatePlaybackOwnerId() {
            const randomPart = Math.random().toString(36).slice(2, 10);
            return `tts-${Date.now()}-${randomPart}`;
        },

        advancePlaybackSession(reason = 'session-reset') {
            this.playbackSessionId += 1;
            this.logPlaybackGuardEvent('playback-session-advanced', {
                reason,
                playbackSessionId: this.playbackSessionId
            });
            return this.playbackSessionId;
        },

        isStaleUtterance(utterance) {
            if (!utterance || !Number.isFinite(utterance.__tmxSessionId)) return false;
            return utterance.__tmxSessionId !== this.playbackSessionId;
        },

        logPlaybackGuardEvent(event, details = {}) {
            if (!this.CONFIG.SHOW_DIAGNOSTICS_PANEL) return;
            console.debug('[TTS][Guard]', {
                event,
                ownerId: this.playbackOwnerId,
                lockOwned: this.playbackLockOwned,
                visibility: document.visibilityState,
                url: window.location && window.location.href ? window.location.href : '',
                ...details
            });
        },

        sendRuntimeMessage(message, onDone) {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
                onDone(null, null);
                return;
            }
            chrome.runtime.sendMessage(message, (response) => {
                const runtimeError = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
                onDone(response, runtimeError);
            });
        },

        requestPlaybackLock(reason, onDone) {
            if (!this.playbackOwnerId) {
                this.playbackOwnerId = this.generatePlaybackOwnerId();
            }
            if (this.playbackLockOwned) {
                this.renewPlaybackLock(`reuse:${reason}`);
                onDone(true);
                return;
            }

            this.sendRuntimeMessage({
                action: 'requestPlaybackLock',
                ownerId: this.playbackOwnerId,
                allowPreempt: true,
                reason,
                url: window.location && window.location.href ? window.location.href : ''
            }, (response, error) => {
                // If lock service is unavailable, fail open to avoid breaking existing playback.
                if (error || !response || typeof response.granted === 'undefined') {
                    this.playbackLockOwned = true;
                    this.startPlaybackLockHeartbeat();
                    this.logPlaybackGuardEvent('lock-fallback-granted', { reason, error });
                    onDone(true);
                    return;
                }

                if (response.granted) {
                    this.playbackLockOwned = true;
                    this.startPlaybackLockHeartbeat();
                    this.logPlaybackGuardEvent('lock-granted', {
                        reason,
                        preempted: Boolean(response.preempted)
                    });
                    onDone(true);
                    return;
                }

                this.playbackLockOwned = false;
                this.stopPlaybackLockHeartbeat();
                this.logPlaybackGuardEvent('lock-denied', {
                    reason,
                    activeOwnerId: response.activeOwnerId || null,
                    activeUrl: response.activeUrl || null,
                    activeTabId: Number.isInteger(response.activeTabId) ? response.activeTabId : null,
                    activeWindowId: Number.isInteger(response.activeWindowId) ? response.activeWindowId : null
                });
                if (this.isPlaybackSessionActive()) {
                    this.showNotification('TTS is active in another tab.');
                }
                onDone(false);
            });
        },

        renewPlaybackLock(reason = 'heartbeat') {
            if (!this.playbackLockOwned || !this.playbackOwnerId) return;
            this.sendRuntimeMessage({
                action: 'renewPlaybackLock',
                ownerId: this.playbackOwnerId,
                reason,
                url: window.location && window.location.href ? window.location.href : ''
            }, (response, error) => {
                if (error) {
                    this.logPlaybackGuardEvent('lock-renew-error', { reason, error });
                    return;
                }
                if (!response || !response.granted) {
                    this.playbackLockOwned = false;
                    this.stopPlaybackLockHeartbeat();
                    this.logPlaybackGuardEvent('lock-renew-lost', { reason });
                }
            });
        },

        releasePlaybackLock(reason = 'release') {
            this.stopPlaybackLockHeartbeat();
            if (!this.playbackOwnerId || !this.playbackLockOwned) {
                this.playbackLockOwned = false;
                return;
            }

            const ownerId = this.playbackOwnerId;
            this.playbackLockOwned = false;
            this.sendRuntimeMessage({
                action: 'releasePlaybackLock',
                ownerId,
                reason
            }, (_response, _error) => {});
            this.logPlaybackGuardEvent('lock-released', { reason });
        },

        startPlaybackLockHeartbeat() {
            this.stopPlaybackLockHeartbeat();
            const intervalMs = Math.max(1000, Number(this.CONFIG.PLAYBACK_LOCK_HEARTBEAT_MS) || 2500);
            this.playbackLockHeartbeatId = setInterval(() => {
                if (!this.playbackLockOwned) {
                    this.stopPlaybackLockHeartbeat();
                    return;
                }
                if (!this.isPlaybackSessionActive()) {
                    this.releasePlaybackLock('inactive-heartbeat-stop');
                    return;
                }
                this.renewPlaybackLock('heartbeat');
            }, intervalMs);
        },

        stopPlaybackLockHeartbeat() {
            if (!this.playbackLockHeartbeatId) return;
            clearInterval(this.playbackLockHeartbeatId);
            this.playbackLockHeartbeatId = null;
        },

        handlePlaybackLockRevoked(payload = {}) {
            const byOwnerId = payload.byOwnerId || null;
            this.logPlaybackGuardEvent('lock-revoked', { byOwnerId });
            if (!this.isPlaybackSessionActive()) {
                this.playbackLockOwned = false;
                this.stopPlaybackLockHeartbeat();
                return;
            }
            this.playbackLockOwned = false;
            this.stopPlaybackLockHeartbeat();
            this.stopTTS(false);
            this.showNotification('Stopped: another tab took TTS control.');
        },

        handleVisibilityPlaybackGuard() {
            if (document.hidden) {
                this.hiddenSince = Date.now();
                const policy = this.normalizeHiddenTabPolicy(this.CONFIG.HIDDEN_TAB_POLICY);
                if (policy === 'never') {
                    this.logPlaybackGuardEvent('visibility-hidden', { policy, action: 'ignore' });
                    return;
                }
                const synthSpeaking = Boolean(this.speechSynthesis && this.speechSynthesis.speaking);
                const serverSpeaking = this.isServerAudioPlaying();
                const shouldPauseLater = this.isPlaybackSessionActive() && !this.isPaused && (synthSpeaking || serverSpeaking);
                if (!shouldPauseLater) return;

                if (this.hiddenPauseTimeoutId) return;
                const configuredDelay = Math.max(0, Number(this.CONFIG.AUTO_PAUSE_HIDDEN_DELAY_MS) || 5000);
                const delayMs = policy === 'immediate' ? 0 : configuredDelay;
                this.logPlaybackGuardEvent('visibility-hidden', { policy, delayMs });

                const pauseNow = () => {
                    this.hiddenPauseTimeoutId = null;
                    if (!document.hidden) return;
                    const synthStillSpeaking = Boolean(this.speechSynthesis && this.speechSynthesis.speaking);
                    const serverStillSpeaking = this.isServerAudioPlaying();
                    const stillShouldPause = this.isPlaybackSessionActive() && !this.isPaused && (synthStillSpeaking || serverStillSpeaking);
                    if (!stillShouldPause) return;
                    if (serverStillSpeaking) {
                        this.pauseServerAudioPlayback().catch(() => {});
                        this.clearServerWordHighlightTimers();
                    } else if (synthStillSpeaking && this.speechSynthesis) {
                        this.speechSynthesis.pause();
                    }
                    this.isPaused = true;
                    this.pausedForHiddenTab = true;
                    this.logPlaybackGuardEvent('visibility-auto-paused', {
                        hiddenForMs: this.hiddenSince ? Date.now() - this.hiddenSince : null
                    });
                };

                if (delayMs === 0) {
                    pauseNow();
                    return;
                }

                this.hiddenPauseTimeoutId = setTimeout(pauseNow, delayMs);
                return;
            }

            if (this.hiddenPauseTimeoutId) {
                clearTimeout(this.hiddenPauseTimeoutId);
                this.hiddenPauseTimeoutId = null;
                this.logPlaybackGuardEvent('visibility-pause-cancelled', {
                    hiddenForMs: this.hiddenSince ? Date.now() - this.hiddenSince : null
                });
            }
            this.hiddenSince = 0;

            if (!this.pausedForHiddenTab) return;
            this.pausedForHiddenTab = false;
            if (this.isServerAudioPaused()) {
                this.resumeServerAudioPlayback().catch(() => {});
                this.isPaused = false;
                this.logPlaybackGuardEvent('visibility-auto-resumed');
                return;
            }
            if (this.speechSynthesis && this.speechSynthesis.paused) {
                this.speechSynthesis.resume();
                this.isPaused = false;
                this.logPlaybackGuardEvent('visibility-auto-resumed');
            }
        },

        shouldRetryInterruptedUtterance(error, index) {
            const details = this.describeSpeechErrorEvent(error);
            const err = (details.error || '').toLowerCase();
            if (err !== 'interrupted' && err !== 'canceled') return false;
            if (!this.continuousReadingActive) return false;
            if (document.hidden) return false;
            if (!this.playbackLockOwned) return false;

            const maxRetries = Math.max(0, Number(this.CONFIG.INTERRUPTED_RETRY_MAX) || 1);
            const attempts = Number(this.interruptedRetryAttempts.get(index) || 0);
            if (attempts >= maxRetries) return false;
            this.interruptedRetryAttempts.set(index, attempts + 1);
            return true;
        },

        initMediaEnhancements() {
            if (this.mediaObserver) return;
            const run = () => this.handleMediaElements();
            this.mediaObserver = new MutationObserver(run);
            this.mediaObserver.observe(document.body, { childList: true, subtree: true });
            run();
        },

        initChatGPTEnhancements() {
            if (!this.isChatGPTPage) return;
            if (!this.pasteHandler) {
                this.pasteHandler = (event) => this.handleGlobalPaste(event);
                document.addEventListener('paste', this.pasteHandler, true);
            }
            if (!this.sendCaptureHandler) {
                this.sendCaptureHandler = (event) => this.handleSendButtonCapture(event);
                document.addEventListener('click', this.sendCaptureHandler, true);
            }

            if (!this.copyObserver) {
                this.copyObserver = new MutationObserver(() => this.updateCopyButtons());
                this.copyObserver.observe(document.body, { childList: true, subtree: true });
            }
            this.updateCopyButtons();

            if (!this.editObserver) {
                this.editObserver = new MutationObserver(() => this.attachDoubleClickListeners());
                this.editObserver.observe(document.body, { childList: true, subtree: true });
            }
            this.attachDoubleClickListeners();

            if (!this.limitWarningObserver) {
                this.limitWarningObserver = new MutationObserver(() => this.checkAndCloseLimitWarnings());
                this.limitWarningObserver.observe(document.body, { childList: true, subtree: true });
            }
            this.checkAndCloseLimitWarnings();
            this.initPromptHistoryObserver();
        },

        // =============================================================================
    });
})();
