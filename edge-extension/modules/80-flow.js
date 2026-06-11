(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 17: Reading Flow & Navigation
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        readFromParagraph(index, options = {}) {
            if (!this.continuousReadingActive) {
                this.revertParagraph();
                return;
            }
            this.requestPlaybackLock(`readFromParagraph:${index}`, (granted) => {
                if (!granted) {
                    this.continuousReadingActive = false;
                    this.ttsActive = false;
                    return;
                }

                this.logPlaybackGuardEvent('read-from-paragraph', {
                    playbackSessionId: this.playbackSessionId,
                    index,
                    hasStartChar: Number.isFinite(Number(options && options.startCharIndex))
                });

                if (index < 0 || index >= this.paragraphsList.length) {
                    this.stopTTS(false);
                    return;
                }

                const para = this.paragraphsList[index];
                const forceBrowserVoiceRouting = this.shouldUseEmojiVoiceRoutingForParagraph(para);
                if (this.isServerVoiceSelected() && !forceBrowserVoiceRouting) {
                    // REMOVED: this.advancePlaybackSession('server-voice-read-from-paragraph') — Fix 2
                    this.startServerPlaybackFromParagraph(index, options);
                    return;
                }

                this.queueFromIndex(index, options);
            });
        },

        stopTTS(notify = true) {
            this.advancePlaybackSession('stopTTS');
            this.ttsActive = false;
            this.isPaused = false;
            this.isNavigating = false;
            this.continuousReadingActive = false;
            this.pendingNavIndex = -1;
            this.navKeyHeld = false;
            clearTimeout(this.navigationTimeoutId);
            clearTimeout(this.selectionSeekDebounceId);
            clearTimeout(this.hiddenPauseTimeoutId);
            this.selectionSeekDebounceId = null;
            this.hiddenPauseTimeoutId = null;
            clearTimeout(this.chunkContinuationTimeoutId);
            this.chunkContinuationTimeoutId = null;
            this.stopServerAudioPlayback();
            this.serverPlaybackState = null;
            this._evictCacheForSession(this.playbackSessionId);
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.speechSynthesis.cancel();
            }
            this.queuedParagraphs.clear();
            this.waitingForMoreContent = false;
            this.waitForMoreNextIndex = -1;
            clearTimeout(this.waitForMoreTimeoutId);
            this.waitForMoreTimeoutId = null;
            this.clearPrewrappedParagraphs();
            this.flushPendingReverts();
            this.revertParagraph();
            this.currentParagraphIndex = -1;
            this.currentUtteranceStartOffset = 0;
            this.queuedStartOffsets.clear();
            this.chunkedParagraphState.clear();
            this.interruptedRetryAttempts.clear();
            this.wordHighlightActiveForCurrent = false;
            this.lastUtteranceEndTime = 0;
            this.lastGapMs = null;
            this.lastWrapMs = null;
            this.hiddenSince = 0;
            this.pausedForHiddenTab = false;

            // Stop the pointer arrow loop and hide the arrow
            if (this.pointerLoopId) {
                cancelAnimationFrame(this.pointerLoopId);
                this.pointerLoopId = null;
            }
            this.hidePointerArrow();
            this.stopAutoScroll();
            this.updateProgressPanel(true);
            this.releasePlaybackLock('stop');

            if (notify) this.showNotification('All TTS stopped');
            return true;
        },

        shouldHighlightWordsForElement(element) {
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED) return false;
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            return rect.bottom > 0 && rect.top < viewportHeight;
        },

        // ... (pauseResumeTTS, navigate, startReadingOnClick, setupEventListeners are unchanged) ...
        pauseResumeTTS() {
            if (this.isServerAudioPlaybackAvailable()) {
                if (this.isPaused) {
                    this.resumeServerAudioPlayback().then((resumed) => {
                        if (!resumed) return;
                        this.isPaused = false;
                        this.ttsActive = true;
                        this.showNotification('Resumed');
                    }).catch(() => {});
                } else {
                    this.pauseServerAudioPlayback().then((paused) => {
                        if (!paused) return;
                        this.isPaused = true;
                        this.ttsActive = false;
                        this.clearServerWordHighlightTimers();
                        this.showNotification('Paused');
                    }).catch(() => {});
                }
                return;
            }
            if (!this.speechSynthesis.speaking && !this.isPaused) return;
            if (this.isPaused) {
                this.speechSynthesis.resume();
                this.isPaused = false;
                this.showNotification('Resumed');
            } else {
                this.speechSynthesis.pause();
                this.isPaused = true;
                this.showNotification('Paused');
            }
        },

        isPlaybackSessionActive() {
            const synth = this.speechSynthesis;
            const synthBusy = Boolean(synth && (synth.speaking || synth.pending || synth.paused));
            const serverBusy = this.isServerAudioPlaying() || this.isServerAudioPaused();
            return synthBusy ||
                serverBusy ||
                this.ttsActive ||
                this.continuousReadingActive ||
                this.waitingForMoreContent ||
                this.isPaused ||
                this.queuedParagraphs.size > 0;
        },

        clearStalePlaybackFlagsIfIdle() {
            const synth = this.speechSynthesis;
            const synthBusy = Boolean(synth && (synth.speaking || synth.pending || synth.paused));
            const serverBusy = this.isServerAudioPlaying() || this.isServerAudioPaused();
            if (synthBusy || serverBusy || this.continuousReadingActive || this.waitingForMoreContent || this.queuedParagraphs.size > 0) {
                return false;
            }
            const hadStaleFlags = this.ttsActive || this.isPaused;
            if (hadStaleFlags) {
                this.ttsActive = false;
                this.isPaused = false;
            }
            return hadStaleFlags;
        },

        shouldHandleNavigationHotkeys() {
            return this.isPlaybackSessionActive();
        },

        getNavigationJumpStep(multiplier = 1) {
            const parsed = Number(this.CONFIG.NAV_CTRL_JUMP_SEGMENTS);
            const base = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 5;
            const scaled = Math.max(1, Math.round(base * Number(multiplier || 1)));
            return scaled;
        },

        getArrowNavigationStep(multiplier = 1) {
            const parsed = Number(this.CONFIG.NAV_ARROW_JUMP_SEGMENTS);
            const base = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
            return Math.max(1, Math.round(base * Number(multiplier || 1)));
        },

        getSpeedStep() {
            const parsed = Number(this.CONFIG.SPEED_STEP);
            return Number.isFinite(parsed) ? Math.max(0.1, parsed) : 0.2;
        },

        adjustSpeechRateByStep(direction) {
            const delta = this.getSpeedStep() * (direction < 0 ? -1 : 1);
            const nextRate = Math.min(5, Math.max(0.5, this.CONFIG.SPEECH_RATE + delta));
            this.setSpeechRate(nextRate);
        },

        resolveCurrentNavigationIndex() {
            let currentIndex = this.currentParagraphIndex;
            if (currentIndex < 0 || currentIndex >= this.paragraphsList.length || (this.lastSpokenElement && this.paragraphsList[currentIndex].element !== this.lastSpokenElement)) {
                currentIndex = this.lastSpokenElement
                    ? this.paragraphsList.findIndex(p => p.element === this.lastSpokenElement)
                    : -1;
            }

            if (currentIndex === -1) {
                const threshold = window.innerHeight * 0.2;
                currentIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
                currentIndex = (currentIndex === -1) ? 0 : currentIndex - 1;
            }
            return currentIndex;
        },

        focusNavigationIndex(index, options = {}) {
            const previewOnly = options.previewOnly === true;
            const outOfRangeMessage = options.outOfRangeMessage || null;
            if (index < 0 || index >= this.paragraphsList.length) {
                if (outOfRangeMessage) {
                    this.showNotification(outOfRangeMessage);
                }
                return false;
            }

            const targetElement = this.paragraphsList[index].element;
            this.clearHighlights(true);
            targetElement.classList.add('tts-navigation-focus');
            this.gentleScrollToElement(targetElement);
            this.addNavigationTrailPoint(targetElement);
            this.lastSpokenElement = targetElement;
            this.pendingNavIndex = index;
            clearTimeout(this.navigationTimeoutId);

            if (!previewOnly) {
                this.navigationTimeoutId = setTimeout(() => {
                    if (this.pendingNavIndex === -1) return;
                    this.continuousReadingActive = true;
                    this.readFromParagraph(this.pendingNavIndex);
                }, this.CONFIG.NAV_FOCUS_HOLD_MS);
            }
            return true;
        },

        navigate(direction, options = {}) {
            const previewOnly = options.previewOnly === true;
            this.isNavigating = true;
            this.clearActiveAutoReadScope();
            if (this.navigationStateTimeoutId) {
                clearTimeout(this.navigationStateTimeoutId);
            }
            this.navigationStateTimeoutId = setTimeout(() => {
                this.isNavigating = false;
                this.navigationStateTimeoutId = null;
            }, 120);

            this.stopTTS(false);

            this.refreshParagraphsIfNeeded(false);
            if (this.paragraphsList.length === 0) return this.showNotification("No readable text found.");

            const currentFocus = document.querySelector('.tts-navigation-focus');
            if(currentFocus) {
                currentFocus.classList.remove('tts-navigation-focus');
                currentFocus.classList.add('tts-focus-fade-out');
                setTimeout(() => currentFocus.classList.remove('tts-focus-fade-out'), this.CONFIG.NAV_FOCUS_FADE_MS);
            }

            const currentIndex = this.resolveCurrentNavigationIndex();
            const newIndex = currentIndex + direction;
            return this.focusNavigationIndex(newIndex, {
                previewOnly,
                outOfRangeMessage: direction > 0 ? 'End of page.' : 'Start of page.'
            });
        },

        jumpToBoundary(boundary, options = {}) {
            this.isNavigating = true;
            if (this.navigationStateTimeoutId) {
                clearTimeout(this.navigationStateTimeoutId);
            }
            this.navigationStateTimeoutId = setTimeout(() => {
                this.isNavigating = false;
                this.navigationStateTimeoutId = null;
            }, 120);

            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(false);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }

            const currentFocus = document.querySelector('.tts-navigation-focus');
            if (currentFocus) {
                currentFocus.classList.remove('tts-navigation-focus');
                currentFocus.classList.add('tts-focus-fade-out');
                setTimeout(() => currentFocus.classList.remove('tts-focus-fade-out'), this.CONFIG.NAV_FOCUS_FADE_MS);
            }

            const previewOnly = options.previewOnly !== false;
            const targetIndex = boundary === 'start' ? 0 : this.paragraphsList.length - 1;
            this.focusNavigationIndex(targetIndex, { previewOnly });
        },

        replayCurrentParagraph() {
            const index = this.currentParagraphIndex;
            if (!Number.isInteger(index) || index < 0) return;
            this.stopTTS(false);
            this.continuousReadingActive = true;
            this.readFromParagraph(index);
        },

        startReadingFromPendingNav() {
            if (this.pendingNavIndex === -1) return;
            clearTimeout(this.navigationTimeoutId);
            this.navigationTimeoutId = setTimeout(() => {
                if (this.pendingNavIndex === -1) return;
                this.continuousReadingActive = true;
                this.readFromParagraph(this.pendingNavIndex);
            }, this.CONFIG.NAV_KEYUP_READ_DELAY_MS);
        },

        startReadingOnClick(event) {
            this.clearActiveAutoReadScope();
            if (event.target.closest('#thread-bottom-container')) return;

            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            let startParaIndex = -1;
            let startCharIndex = 0;

            const containingParagraph = this.paragraphsList.find(p => p.element.contains(event.target));
            if (containingParagraph) {
                startParaIndex = this.paragraphsList.indexOf(containingParagraph);
                const clickRange = this.getRangeFromPoint(event.clientX, event.clientY);
                if (clickRange && containingParagraph.element.contains(clickRange.startContainer)) {
                    startCharIndex = this.computeCharIndexWithinParagraphFromRange(containingParagraph.element, clickRange);
                }
            } else {
                const clickY = event.clientY;
                for(let i = 0; i < this.paragraphsList.length; i++) {
                    const rect = this.paragraphsList[i].element.getBoundingClientRect();
                    if (rect.top > clickY) {
                        startParaIndex = i;
                        break;
                    }
                }
            }

            if (startParaIndex !== -1) {
                const startParagraph = this.paragraphsList[startParaIndex];
                const baseWordOffset = containingParagraph
                    ? Math.max(0, this.findWordIndexByCharFromText(startParagraph && startParagraph.text ? startParagraph.text : '', startCharIndex))
                    : 0;
                const totalWordOffset = baseWordOffset + this.CONFIG.CLICK_START_SKIP_WORDS;
                const resolved = this.resolveParagraphStartByWordOffset(startParaIndex, totalWordOffset);
                if (!resolved) {
                    this.showNotification('Skip words reached end of readable text.');
                    return;
                }
                const resolvedParagraph = this.paragraphsList[resolved.paragraphIndex];
                const resolvedCharData = this.getCharIndexByWordOffset(resolvedParagraph && resolvedParagraph.text ? resolvedParagraph.text : '', resolved.wordOffset);
                if (resolvedCharData.totalWords === 0) {
                    this.showNotification('No readable text found at or below your click.');
                    return;
                }
                this.continuousReadingActive = true;
                this.readFromParagraph(resolved.paragraphIndex, { startCharIndex: resolvedCharData.startCharIndex });
            } else {
                this.showNotification('No readable text found at or below your click.');
            }
        },

        startReadingFromTop() {
            this.clearActiveAutoReadScope();
            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }
            this.continuousReadingActive = true;
            this.readFromParagraph(0);
        },

        startReadingFromSelection() {
            this.clearActiveAutoReadScope();
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString() : '';
            const selectionData = this.extractTTSMetadata(selectedText);
            const cleaned = selectionData.text.trim();
            if (!cleaned) {
                this.showNotification('No text selected.');
                return;
            }
            const sliced = this.sliceTextByWordOffset(cleaned, this.CONFIG.CLICK_START_SKIP_WORDS);
            const startText = sliced.text || '';
            if (!startText) {
                this.showNotification('Selection shorter than skip words.');
                return;
            }
            this.stopTTS(false);
            this.continuousReadingActive = false;
            this.triggerTTS(startText, { speakerEmoji: selectionData.speakerEmoji });
        },

        startReadingFromViewport() {
            this.clearActiveAutoReadScope();
            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }

            const threshold = window.innerHeight * 0.2;
            let startIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
            if (startIndex === -1) startIndex = 0;

            this.continuousReadingActive = true;
            this.readFromParagraph(startIndex);
        },

        navigateImmediate(direction) {
            const step = this.getArrowNavigationStep();
            this.navigate(direction < 0 ? -step : step, { previewOnly: true });
            if (this.pendingNavIndex === -1) return;
            this.continuousReadingActive = true;
            this.readFromParagraph(this.pendingNavIndex);
        },

        // =============================================================================
    });
})();
