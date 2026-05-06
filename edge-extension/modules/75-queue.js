(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 16: Queue & Utterance Lifecycle
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        enqueueParagraph(index) {
            if (!this.continuousReadingActive) return;
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (index < 0 || index >= this.paragraphsList.length) return;
            if (this.queuedParagraphs.has(index)) return;

            const para = this.paragraphsList[index];
            if (!para || !para.element || !para.text) return;

            const maxBacklog = this.getMaxSynthBacklog();
            const bufferedAhead = this.queuedParagraphs.size;
            const synthBusy = Boolean(this.speechSynthesis.speaking || this.speechSynthesis.pending);
            if (synthBusy && bufferedAhead > maxBacklog) {
                this.logPlaybackGuardEvent('backlog-guard-skip', {
                    index,
                    bufferedAhead,
                    maxBacklog
                });
                return;
            }

            const requestedOffset = this.queuedStartOffsets.has(index)
                ? Number(this.queuedStartOffsets.get(index))
                : 0;
            this.queuedStartOffsets.delete(index);

            const queuedSpeech = this.getQueuedSpeechForIndex(index, para, requestedOffset);
            let utteranceText = queuedSpeech.utteranceText;
            let startOffset = queuedSpeech.startOffset;
            const speakerEmoji = queuedSpeech.speakerEmoji || para.speakerEmoji;
            if (!utteranceText || !utteranceText.trim()) return;

            const utterance = new SpeechSynthesisUtterance(utteranceText);
            const forceBrowserVoiceRouting = this.shouldUseEmojiVoiceRoutingForParagraph(para);
            const preferredVoice = this.resolvePreferredVoice(speakerEmoji, { forceBrowser: forceBrowserVoiceRouting });
            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.rate = this.getSafeSpeechRate(preferredVoice);
            utterance.volume = this.getSpeechVolume();
            utterance.__tmxStartOffset = startOffset;
            utterance.__tmxSessionId = this.playbackSessionId;

            utterance.onstart = () => this.onUtteranceStart(index, utterance);
            if (this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                utterance.onboundary = (event) => {
                    if (this.isStaleUtterance(utterance)) return;
                    this.highlightCurrentWord(event);
                };
            }
            utterance.onend = () => this.onUtteranceEnd(index, utterance);
            utterance.onerror = (e) => this.onUtteranceError(index, e, utterance);

            this.queuedParagraphs.add(index);
            this.speechSynthesis.speak(utterance);
        },

        queueFromIndex(startIndex, options = {}) {
            this.advancePlaybackSession('queue-from-index');
            this.cancelActiveSpeechQueue('queue-from-index');
            this.queuedParagraphs.clear();
            this.queuedStartOffsets.clear();
            this.chunkedParagraphState.clear();
            clearTimeout(this.chunkContinuationTimeoutId);
            this.chunkContinuationTimeoutId = null;
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }

            const requestedStartCharIndex = Number(options && options.startCharIndex);
            if (Number.isFinite(requestedStartCharIndex) && requestedStartCharIndex > 0) {
                this.queuedStartOffsets.set(startIndex, requestedStartCharIndex);
            }

            const effectiveLookahead = this.getEffectiveQueueLookahead();

            this.logPlaybackGuardEvent('queue-from-index', {
                playbackSessionId: this.playbackSessionId,
                startIndex,
                startCharIndex: Number.isFinite(requestedStartCharIndex) ? requestedStartCharIndex : null,
                lookahead: this.CONFIG.QUEUE_LOOKAHEAD,
                effectiveLookahead,
                serverPrecacheMode: this.CONFIG.SERVER_PRECACHE_MODE
            });

            this.enqueueParagraph(startIndex);
            if (this.chunkedParagraphState.has(startIndex) || effectiveLookahead <= 0) {
                return;
            }

            const maxIndex = Math.min(this.paragraphsList.length - 1, startIndex + effectiveLookahead);
            for (let i = startIndex + 1; i <= maxIndex; i++) {
                this.enqueueParagraph(i);
                if (this.chunkedParagraphState.has(i)) {
                    break;
                }
            }
        },

        onUtteranceStart(index, utterance = null) {
            if (this.isStaleUtterance(utterance)) {
                this.logPlaybackGuardEvent('stale-utterance-ignored', {
                    phase: 'queued.onstart',
                    index,
                    utteranceSessionId: utterance ? utterance.__tmxSessionId : null
                });
                return;
            }
            this.ttsActive = true;
            this.isPaused = false;
            this.pausedForHiddenTab = false;
            const startOffset = utterance && Number.isFinite(utterance.__tmxStartOffset)
                ? Number(utterance.__tmxStartOffset)
                : 0;
            this.currentUtteranceStartOffset = Math.max(0, startOffset);
            this.interruptedRetryAttempts.delete(index);

            const startTime = performance.now();
            this.lastGapMs = this.lastUtteranceEndTime ? startTime - this.lastUtteranceEndTime : null;

            this.currentParagraphIndex = index;
            const para = this.paragraphsList[index];
            if (!para || !para.element) return;

            this.wordHighlightActiveForCurrent = this.shouldHighlightWordsForElement(para.element);
            this.lastSpokenElement = para.element;
            this.startAutoScroll();
            this.maybeAutoScrollOnStart();

            const wrapStart = performance.now();
            const textToRead = this.prepareParagraphForReading(para.element);
            this.lastWrapMs = performance.now() - wrapStart;
            this.updateDiagnosticsPanel();
            this.updateProgressPanel();
            if (!textToRead) return;

            this.clearHighlights(true);
            para.element.classList.add('tts-current-sentence');
            this.highlightWordByCharIndex(this.currentUtteranceStartOffset);

            if (this.pointerLoopId) cancelAnimationFrame(this.pointerLoopId);
            this.updatePointerArrow();
            this.prewrapNextParagraph(index);
            
            // KEY BEHAVIORAL FIX: Fill entire lookahead window immediately when paragraph starts
            if (this.continuousReadingActive && !this.chunkedParagraphState.has(index)) {
                this.fillLookaheadWindow(index);
            }
        },

        onUtteranceEnd(index, utterance = null) {
            if (this.isStaleUtterance(utterance)) {
                this.logPlaybackGuardEvent('stale-utterance-ignored', {
                    phase: 'queued.onend',
                    index,
                    utteranceSessionId: utterance ? utterance.__tmxSessionId : null
                });
                return;
            }
            this.ttsActive = false;
            this.currentUtteranceStartOffset = 0;
            this.queuedParagraphs.delete(index);
            this.lastUtteranceEndTime = performance.now();
            this.clearHighlights(true);
            this.deferProcessedParagraphRevert();

            if (!this.continuousReadingActive) return;

            if (this.chunkedParagraphState.has(index)) {
                const hasFutureQueuedSpeech = this.queuedParagraphs.size > 0 || Boolean(this.speechSynthesis.pending);
                if (hasFutureQueuedSpeech) {
                    this.advancePlaybackSession('chunk-continuation-priority');
                    this.cancelActiveSpeechQueue('chunk-continuation-priority');
                    this.queuedParagraphs.clear();
                    this.queuedStartOffsets.clear();
                }
                const gapMs = this.getSpeechChunkGapMs();
                clearTimeout(this.chunkContinuationTimeoutId);
                this.chunkContinuationTimeoutId = setTimeout(() => {
                    this.chunkContinuationTimeoutId = null;
                    if (!this.continuousReadingActive) return;
                    this.enqueueParagraph(index);
                }, gapMs);
                return;
            }

            const refreshedIndex = this.refreshParagraphIndex(index);
            const lastIndex = this.paragraphsList.length - 1;
            if (refreshedIndex >= lastIndex) {
                if (!this.isChatGPTPage) {
                    if (this.CONFIG.LOOP_ON_END) {
                        this.loopToTop();
                    } else {
                        this.stopTTS(false);
                        this.showNotification('End of page.');
                    }
                    return;
                }
                const nextIndex = refreshedIndex + 1;
                this.waitForMoreParagraphs(nextIndex);
                return;
            }

            if (this.queuedParagraphs.size === 0) {
                const nextIndex = refreshedIndex + 1;
                this.enqueueParagraph(nextIndex);
            }
        },

        onUtteranceError(index, error, utterance = null) {
            if (this.isStaleUtterance(utterance)) {
                this.logPlaybackGuardEvent('stale-utterance-ignored', {
                    phase: 'queued.onerror',
                    index,
                    utteranceSessionId: utterance ? utterance.__tmxSessionId : null
                });
                return;
            }
            this.logSpeechSynthesisError('queuedParagraph', error, {
                index,
                text: utterance && typeof utterance.text === 'string' ? utterance.text : null,
                rate: utterance && Number.isFinite(utterance.rate) ? utterance.rate : this.CONFIG.SPEECH_RATE,
                voiceName: utterance && utterance.voice ? utterance.voice.name : null,
                voiceLang: utterance && utterance.voice ? utterance.voice.lang : null
            });

            if (this.shouldRetryInterruptedUtterance(error, index)) {
                const retryDelay = Math.max(50, Number(this.CONFIG.INTERRUPTED_RETRY_DELAY_MS) || 250);
                this.logPlaybackGuardEvent('interrupted-retry', { index, retryDelay });
                this.queuedParagraphs.delete(index);
                setTimeout(() => {
                    if (!this.continuousReadingActive) return;
                    this.enqueueParagraph(index);
                }, retryDelay);
                return;
            }

            this.ttsActive = false;
            this.currentUtteranceStartOffset = 0;
            this.queuedParagraphs.delete(index);
            this.chunkedParagraphState.delete(index);
            this.flushPendingReverts();
            this.revertParagraph();
            if (!this.continuousReadingActive) return;

            const nextIndex = index + 1;
            this.enqueueParagraph(nextIndex);
        },

        prewarmNextUtterance(index) {
            if (!this.continuousReadingActive) return;
            if (this.chunkedParagraphState.has(index)) return;
            for (const queuedChunkIndex of this.chunkedParagraphState.keys()) {
                if (queuedChunkIndex > index) return;
            }

            const effectiveLookahead = this.getEffectiveQueueLookahead();
            let nextIndex = index + effectiveLookahead + 1;
            if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) {
                if (this.paragraphsDirty) {
                    this.refreshParagraphsIfNeeded(true);
                }
                if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) return;
            }
            this.enqueueParagraph(nextIndex);
        },

        fillLookaheadWindow(currentIndex) {
            if (!this.continuousReadingActive) return;
            if (this.chunkedParagraphState.has(currentIndex)) return;
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }

            // Top up the lookahead window without clearing pending entries.
            const effectiveLookahead = this.getEffectiveQueueLookahead();
            const maxIndex = Math.min(this.paragraphsList.length - 1, currentIndex + effectiveLookahead);
            for (let i = currentIndex + 1; i <= maxIndex; i++) {
                this.enqueueParagraph(i);
            }
        },

        // =============================================================================
    });
})();
