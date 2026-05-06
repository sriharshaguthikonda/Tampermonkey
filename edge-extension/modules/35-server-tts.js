(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 15: Server TTS
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        ensureServerAudioGraph() {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            if (!this.serverAudioContext || this.serverAudioContext.state === 'closed') {
                this.serverAudioContext = new AudioCtx({ latencyHint: 'interactive' });
                this.serverAudioGainNode = this.serverAudioContext.createGain();
                this.serverAudioGainNode.connect(this.serverAudioContext.destination);
            }
            if (!this.serverAudioGainNode) {
                this.serverAudioGainNode = this.serverAudioContext.createGain();
                this.serverAudioGainNode.connect(this.serverAudioContext.destination);
            }
            this.serverAudioGainNode.gain.value = this.getSpeechVolume();
            return this.serverAudioContext;
        },

        isServerAudioPlaybackAvailable() {
            return Boolean(this.serverAudioContext && this.serverCurrentSource);
        },

        isServerAudioPlaying() {
            return Boolean(
                this.serverAudioContext &&
                this.serverCurrentSource &&
                this.serverAudioContext.state === 'running'
            );
        },

        isServerAudioPaused() {
            return Boolean(
                this.serverAudioContext &&
                this.serverCurrentSource &&
                this.serverAudioContext.state === 'suspended'
            );
        },

        stopCurrentServerSource() {
            if (!this.serverCurrentSource) return;
            try {
                this.serverCurrentSource.onended = null;
                this.serverCurrentSource.stop();
                this.serverCurrentSource.disconnect();
            } catch (_error) {
                // Ignore races where source already ended.
            }
            this.serverCurrentSource = null;
        },

        cancelScheduledNext() {
            if (!this.scheduledNextSource) return;
            try {
                this.scheduledNextSource.onended = null;
                this.scheduledNextSource.stop();
                this.scheduledNextSource.disconnect();
            } catch (_error) {
                // Ignore races where source already played or stopped.
            }
            this.scheduledNextSource = null;
        },

        async scheduleNextSentence(state, nextIndex, currentBufferDuration) {
            // Look-ahead scheduling: schedule next sentence to start exactly when current ends
            if (!this.serverAudioContext) return;
            if (state.playbackSessionId !== this.playbackSessionId) return;
            if (nextIndex >= state.sentences.length) return;

            const context = this.serverAudioContext;
            const nextStartTime = this.serverPlaybackStartTime + currentBufferDuration;

            // Fetch and prepare next sentence audio
            let prepared;
            try {
                prepared = await this.getOrPrepareServerSentenceAudioElement(state, nextIndex);
            } catch (error) {
                this.logPlaybackGuardEvent('lookahead-fetch-error', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex: nextIndex,
                    error: String(error && error.message ? error.message : error)
                });
                return;
            }

            if (state.playbackSessionId !== this.playbackSessionId) return;
            if (!prepared || !prepared.audioBuffer) return;

            const audioBuffer = prepared.audioBuffer;
            const payload = prepared.payload || null;

            // Create source for next sentence
            const nextSource = context.createBufferSource();
            nextSource.buffer = audioBuffer;
            nextSource.connect(this.serverAudioGainNode);

            // Schedule to start exactly when current ends
            try {
                nextSource.start(nextStartTime);
                this.scheduledNextSource = nextSource;

                this.logPlaybackGuardEvent('lookahead-scheduled', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex: nextIndex,
                    nextStartTime,
                    currentTime: context.currentTime,
                    bufferDuration: audioBuffer.duration
                });

                // Set up onended for cleanup and triggering the one after
                nextSource.onended = () => {
                    if (state.playbackSessionId !== this.playbackSessionId) return;
                    if (this.scheduledNextSource === nextSource) {
                        this.scheduledNextSource = null;
                    }
                    // Continue the chain
                    this.playServerSentence(state, nextIndex + 1);
                };

                // Schedule word highlights for next sentence
                const sampleRate = Number(payload && payload.sampleRate);
                const audioLength = Number(payload && payload.audioLength);
                const durationMs = (Number.isFinite(sampleRate) && sampleRate > 0 && Number.isFinite(audioLength) && audioLength > 0)
                    ? (audioLength / (sampleRate * 2)) * 1000
                    : (Number.isFinite(audioBuffer.duration) ? audioBuffer.duration * 1000 : 0);

                const nextSentence = state.sentences[nextIndex];
                // Offset highlights by the time until next starts
                const timeUntilNext = Math.max(0, (nextStartTime - context.currentTime) * 1000);
                this.scheduleServerWordHighlights(nextSentence.text, nextSentence.startOffset, durationMs, timeUntilNext);

            } catch (startError) {
                this.logPlaybackGuardEvent('lookahead-start-error', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex: nextIndex,
                    error: String(startError && startError.message ? startError.message : startError)
                });
            }
        },

        async pauseServerAudioPlayback() {
            if (!this.serverAudioContext) return false;
            if (this.serverAudioContext.state !== 'running') return false;
            try {
                await this.serverAudioContext.suspend();
                return true;
            } catch (_error) {
                return false;
            }
        },

        async resumeServerAudioPlayback() {
            if (!this.serverAudioContext) return false;
            if (this.serverAudioContext.state === 'running') return true;
            try {
                await this.serverAudioContext.resume();
                return this.serverAudioContext.state === 'running';
            } catch (_error) {
                return false;
            }
        },

        getMaxSynthBacklog() {
            const configured = Math.max(0, Number(this.CONFIG.MAX_SYNTH_BACKLOG) || 0);
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 2);
        },

        getSpeechChunkMaxChars() {
            const configured = Math.max(80, Number(this.CONFIG.SPEECH_CHUNK_MAX_CHARS) || 220);
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 320);
        },

        getSpeechChunkGapMs() {
            if (this.CONFIG.LOW_GAP_MODE) return 0;
            return Math.max(0, Number(this.CONFIG.SPEECH_CHUNK_GAP_MS) || 0);
        },

        getEffectiveQueueLookahead() {
            const configured = Math.max(0, Math.round(Number(this.CONFIG.QUEUE_LOOKAHEAD) || 0));
            return configured;
        },

        getServerPrecacheWordBudget() {
            const configured = Math.max(10, Math.round(Number(this.CONFIG.SERVER_PRECACHE_WORD_BUDGET) || 100));
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 220);
        },

        getServerPrecacheMaxSentences() {
            const configured = Math.max(1, Math.round(Number(this.CONFIG.SERVER_PRECACHE_MAX_SENTENCES) || 8));
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 14);
        },

        getServerHandoffWaitMs() {
            const configured = Math.max(0, Math.round(Number(this.CONFIG.SERVER_HANDOFF_WAIT_MS) || 120));
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 220);
        },

        setEnterToSendEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.ENTER_TO_SEND_ENABLED === nextValue) return;
            this.CONFIG.ENTER_TO_SEND_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Enter-to-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        setGlobalPasteEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.GLOBAL_PASTE_ENABLED === nextValue) return;
            this.CONFIG.GLOBAL_PASTE_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Global paste ${nextValue ? 'on' : 'off'}`);
            }
        },

        setRegularPasteEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.REGULAR_PASTE_ENABLED === nextValue) return;
            this.CONFIG.REGULAR_PASTE_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Regular paste ${nextValue ? 'on' : 'off'}`);
            }
        },

        setRegularAutoSendEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.REGULAR_AUTO_SEND === nextValue) return;
            this.CONFIG.REGULAR_AUTO_SEND = nextValue;
            if (!silent) {
                this.showNotification(`Regular auto-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        setRegularAutoSendInInputEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.REGULAR_AUTO_SEND_IN_INPUT === nextValue) return;
            this.CONFIG.REGULAR_AUTO_SEND_IN_INPUT = nextValue;
            if (!silent) {
                this.showNotification(`Textbox auto-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        setNiceAutoPasteEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.NICE_AUTO_PASTE_ENABLED === nextValue) return;
            this.CONFIG.NICE_AUTO_PASTE_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`NICE auto-paste ${nextValue ? 'on' : 'off'}`);
            }
        },

        setNiceAutoSendEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.NICE_AUTO_SEND === nextValue) return;
            this.CONFIG.NICE_AUTO_SEND = nextValue;
            if (!silent) {
                this.showNotification(`NICE auto-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        hasNativeTurnCopyActions() {
            if (!this.isChatGPTPage) return false;
            return Boolean(document.querySelector('[data-testid="copy-turn-action-button"], button[aria-label="Copy message"]'));
        },

        shouldInjectCustomCopyButtons() {
            if (!this.CONFIG.COPY_BUTTON_ENABLED) return false;
            if (!this.isConversationSurfaceAvailable()) return false;
            if (this.hasNativeTurnCopyActions()) return false;
            return true;
        },

        getCopyButtonTargets() {
            const targets = [];
            this.getConversationMessageElements().forEach((messageElement) => {
                const role = this.getMessageRoleFromElement(messageElement);
                if (role !== 'assistant' && role !== 'user') return;
                const contentNode = this.getPreferredMessageContentNode(messageElement);
                if (!contentNode) return;
                targets.push({ target: contentNode, role });
            });
            return targets;
        },

        addCopyButton(target, role = 'assistant') {
            if (!target || !target.isConnected) return;

            const adjacentRow = target.nextElementSibling && target.nextElementSibling.classList
                && target.nextElementSibling.classList.contains('tmx-copy-row')
                ? target.nextElementSibling
                : null;
            if (target.dataset.tmxCopyButtonAttached === '1' && adjacentRow) return;
            if (adjacentRow) adjacentRow.remove();

            const row = document.createElement('div');
            row.className = 'tmx-copy-row';
            row.setAttribute('data-tmx-control', 'copy-row');
            row.setAttribute('aria-hidden', 'true');
            row.style.cssText = 'display:flex; justify-content:flex-end; margin-top:8px;';
            const copyButton = document.createElement('button');
            copyButton.className = 'tmx-copy-button';
            copyButton.setAttribute('data-tmx-control', 'copy-button');
            copyButton.setAttribute('aria-hidden', 'true');
            copyButton.type = 'button';
            copyButton.textContent = 'Copy';
            copyButton.style.cssText = 'padding:3px 8px; font-size:12px; line-height:1.2; border:none; border-radius:6px; background:#0b5ed7; color:#fff; cursor:pointer;';
            copyButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const text = this.extractConversationTextFromNode(target);
                if (!text) return;
                const payload = this.formatSmartCopyEntries([{ role, text }]);
                if (!payload) return;
                this.copyTextToClipboard(payload)
                    .then((ok) => this.showNotification(ok ? 'Copied to clipboard.' : 'Copy failed.'));
            });

            row.appendChild(copyButton);
            target.insertAdjacentElement('afterend', row);
            target.dataset.tmxCopyButtonAttached = '1';
        },

        removeCopyButtons() {
            document.querySelectorAll('.tmx-copy-row, .tmx-copy-button').forEach((node) => node.remove());
            document.querySelectorAll('[data-tmx-copy-button-attached]').forEach((node) => {
                delete node.dataset.tmxCopyButtonAttached;
            });
        },

        updateCopyButtons() {
            if (!this.CONFIG.COPY_BUTTON_ENABLED) {
                this.removeCopyButtons();
                return;
            }
            this.applySmartCopySelectionAllowlist();
            if (!this.shouldInjectCustomCopyButtons()) {
                this.removeCopyButtons();
                return;
            }
            this.getCopyButtonTargets().forEach(({ target, role }) => this.addCopyButton(target, role));
        },

        setCopyButtonEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.COPY_BUTTON_ENABLED === nextValue) return;
            this.CONFIG.COPY_BUTTON_ENABLED = nextValue;
            this.updateCopyButtons();
            if (!silent) {
                this.showNotification(`Copy buttons ${nextValue ? 'on' : 'off'}`);
            }
        },

        handleDoubleClickEdit(event) {
            if (!this.isChatGPTPage || !this.CONFIG.DOUBLE_CLICK_EDIT_ENABLED) return;
            const messageContainer = event.target.closest('.group\\/conversation-turn, [data-message-author-role="user"]');
            if (!messageContainer) return;
            const editButton = messageContainer.querySelector('button[aria-label="Edit message"]');
            if (!editButton) return;
            editButton.click();
            setTimeout(() => {
                const editor = document.querySelector('textarea, [contenteditable="true"]');
                if (editor) editor.focus();
            }, 80);
        },

        attachDoubleClickListeners() {
            if (!this.isChatGPTPage) return;
            const containers = document.querySelectorAll('.group\\/conversation-turn, .group\\/turn-messages, [data-message-author-role]');
            containers.forEach((container) => {
                if (container.dataset.tmxEditListener === '1') return;
                container.dataset.tmxEditListener = '1';
                container.addEventListener('dblclick', (event) => this.handleDoubleClickEdit(event));
            });
        },

        setDoubleClickEditEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.DOUBLE_CLICK_EDIT_ENABLED === nextValue) return;
            this.CONFIG.DOUBLE_CLICK_EDIT_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Double-click edit ${nextValue ? 'on' : 'off'}`);
            }
        },

        checkAndCloseLimitWarnings() {
            if (!this.isChatGPTPage || !this.CONFIG.AUTO_CLOSE_LIMIT_WARNING) return;
            const closeButtons = Array.from(document.querySelectorAll('button[data-testid="close-button"]'));
            closeButtons.forEach((button) => {
                if (button.dataset.tmxLimitCloseScheduled === '1') return;
                const text = (button.closest('div')?.textContent || '').toLowerCase();
                if (!/(limit|usage|cap|plan)/.test(text)) return;
                button.dataset.tmxLimitCloseScheduled = '1';
                setTimeout(() => {
                    if (this.CONFIG.AUTO_CLOSE_LIMIT_WARNING && button.isConnected) {
                        button.click();
                    }
                    delete button.dataset.tmxLimitCloseScheduled;
                }, this.CONFIG.LIMIT_WARNING_DELAY_MS);
            });
        },

        setAutoCloseLimitWarningEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.AUTO_CLOSE_LIMIT_WARNING === nextValue) return;
            this.CONFIG.AUTO_CLOSE_LIMIT_WARNING = nextValue;
            if (nextValue) this.checkAndCloseLimitWarnings();
            if (!silent) {
                this.showNotification(`Auto-close warning ${nextValue ? 'on' : 'off'}`);
            }
        },

        setLimitWarningDelay(delayMs, silent = false) {
            const parsed = Number(delayMs);
            if (!Number.isFinite(parsed)) return;
            const clamped = Math.max(100, Math.round(parsed));
            this.CONFIG.LIMIT_WARNING_DELAY_MS = clamped;
            if (!silent) {
                this.showNotification(`Warning delay ${clamped} ms`);
            }
        },

        // ... (All functions from waitForPageLoad to triggerTTS are unchanged) ...
        waitForPageLoad() {
            if (document.readyState === 'complete') {
                setTimeout(() => { this.pageFullyLoaded = true; }, 1000);
            } else {
                window.addEventListener('load', () => setTimeout(() => { this.pageFullyLoaded = true; }, 2000));
            }
        },

        // =============================================================================
    });
})();
