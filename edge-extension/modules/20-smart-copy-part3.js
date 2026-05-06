(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        async scrollSmartCopyContainerVisibly(container, targetTop, { stage = 'moving', progressCallback = null, stepPx = 220, settleMs = 110 } = {}) {
            if (!container) return;
            const startTop = this.getSmartCopyScrollTop(container);
            const desiredTop = Math.max(0, Number(targetTop) || 0);
            const totalDistance = Math.abs(desiredTop - startTop);
            if (totalDistance <= 1) {
                this.setSmartCopyScrollTop(container, desiredTop, { behavior: 'auto' });
                await this.waitSmartCopySettle(settleMs);
                if (typeof progressCallback === 'function') {
                    progressCallback({ stage, percent: 100 });
                }
                return;
            }

            const direction = desiredTop > startTop ? 1 : -1;
            const viewportHeight = container.clientHeight || window.innerHeight || 900;
            const actualStepPx = Math.max(120, Number(stepPx) || Math.floor(viewportHeight * 0.5));
            const guardLimit = Math.max(12, Math.ceil(totalDistance / actualStepPx) + 4);
            let guard = 0;

            while (guard < guardLimit) {
                guard += 1;
                const currentTop = this.getSmartCopyScrollTop(container);
                const remaining = desiredTop - currentTop;
                if (Math.abs(remaining) <= 1) break;

                const nextTop = direction > 0
                    ? Math.min(desiredTop, currentTop + actualStepPx)
                    : Math.max(desiredTop, currentTop - actualStepPx);
                this.setSmartCopyScrollTop(container, nextTop, { behavior: 'auto' });
                await this.waitSmartCopySettle(settleMs);

                if (typeof progressCallback === 'function') {
                    const nowTop = this.getSmartCopyScrollTop(container);
                    const progressed = totalDistance <= 0
                        ? 100
                        : Math.round((Math.abs(nowTop - startTop) / totalDistance) * 100);
                    progressCallback({ stage, percent: Math.max(0, Math.min(100, progressed)) });
                }
            }

            this.setSmartCopyScrollTop(container, desiredTop, { behavior: 'auto' });
            await this.waitSmartCopySettle(settleMs);
            if (typeof progressCallback === 'function') {
                progressCallback({ stage, percent: 100 });
            }
        },

        copyTextUsingExecCommand(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', 'readonly');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            let ok = false;
            try {
                ok = Boolean(document.execCommand('copy'));
            } catch (_error) {
                ok = false;
            }
            textarea.remove();
            return ok;
        },

        copyTextToClipboard(text) {
            const normalized = String(text || '');
            if (!normalized) return Promise.resolve(false);
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                return navigator.clipboard.writeText(normalized)
                    .then(() => true)
                    .catch(() => this.copyTextUsingExecCommand(normalized));
            }
            return Promise.resolve(this.copyTextUsingExecCommand(normalized));
        },

        copyTranscriptWithFullScan(options = true) {
            const normalizedOptions = options && typeof options === 'object'
                ? options
                : { showToast: options !== false };
            const showToast = normalizedOptions.showToast !== false;
            const buttonId = normalizedOptions.buttonId || '';
            const visualize = normalizedOptions.visualize === true;
            if (!this.isConversationSurfaceAvailable()) return false;
            (async () => {
                let lastStageMessage = '';
                const updateStage = (message, { toast = false, durationMs = 2200 } = {}) => {
                    if (buttonId) this.setSmartCopyActionButtonsBusy(buttonId, message);
                    if (!showToast || !toast || message === lastStageMessage) return;
                    lastStageMessage = message;
                    this.showNotification(message, durationMs);
                };

                try {
                    updateStage(`${visualize ? 'Scrolling' : 'Scanning'} 0%`, { toast: true, durationMs: 1600 });
                    const text = await this.buildSmartCopyTranscriptTextByScrollingThread({
                        visualize,
                        progressCallback: ({ stage, percent }) => {
                        if (stage === 'scanning') {
                            updateStage(`${visualize ? 'Scrolling' : 'Scanning'} ${Math.max(0, Math.min(100, Math.round(percent || 0)))}%`);
                            return;
                        }
                        if (stage === 'preparing' && visualize) {
                            updateStage(`To top ${Math.max(0, Math.min(100, Math.round(percent || 0)))}%`);
                            return;
                        }
                        if (stage === 'stitching') {
                            updateStage('Stitching...', { toast: true, durationMs: 1600 });
                            return;
                        }
                        if (stage === 'returning' && visualize) {
                            updateStage(`Returning ${Math.max(0, Math.min(100, Math.round(percent || 0)))}%`, { toast: true, durationMs: 1200 });
                        }
                    }
                    });
                    if (!text) {
                        if (showToast) this.showNotification('No transcript text found.');
                        return;
                    }

                    updateStage('Copying...', { toast: true, durationMs: 1600 });
                    const ok = await this.copyTextToClipboard(text);
                    if (showToast) {
                        this.showNotification(ok ? 'Transcript copied.' : 'Copy failed.');
                    }
                } catch (_error) {
                    if (showToast) this.showNotification('Copy failed.');
                } finally {
                    this.setSmartCopyActionButtonsBusy('', '');
                }
            })();
            return true;
        },

        runSmartCopyAction({ useSelection = true, fallbackToTranscript = true, preserveNativeOnSelectionMiss = false, showToast = true, buttonId = '' } = {}) {
            const selection = window.getSelection();
            const hasSelection = Boolean(selection && !selection.isCollapsed && String(selection.toString() || '').trim());

            let text = '';
            if (useSelection && hasSelection) {
                text = this.buildSmartCopySelectionText(selection);
                if (!text && preserveNativeOnSelectionMiss) {
                    return false;
                }
            }
            if (!text && fallbackToTranscript) {
                text = this.buildSmartCopyTranscriptText();
            }
            if (!text) return false;

            if (buttonId) this.setSmartCopyActionButtonsBusy(buttonId, 'Copying...');
            this.copyTextToClipboard(text).then((ok) => {
                if (!showToast) return;
                this.showNotification(ok ? 'Copied to clipboard.' : 'Copy failed.');
            }).finally(() => {
                this.setSmartCopyActionButtonsBusy('', '');
            });
            return true;
        },

        handleSmartCopyShortcut(event) {
            if (!this.CONFIG.SMART_COPY_ENABLED) return false;
            if (!event || event.defaultPrevented) return false;
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
            if (String(event.key || '').toLowerCase() !== 'c') return false;
            if (this.isEditableSelectionContext()) return false;

            const selection = window.getSelection();
            const hasSelection = Boolean(selection && !selection.isCollapsed && String(selection.toString() || '').trim());
            if (!hasSelection) {
                const started = this.copyTranscriptWithFullScan(true);
                if (!started) return false;
                event.preventDefault();
                event.stopPropagation();
                return true;
            }

            const handled = this.runSmartCopyAction({
                useSelection: this.CONFIG.SMART_COPY_MODE === 'selection-first',
                fallbackToTranscript: true,
                preserveNativeOnSelectionMiss: true,
                showToast: true
            });
            if (!handled) return false;

            event.preventDefault();
            event.stopPropagation();
            return true;
        },

        handleSmartCopyCopyEvent(event) {
            if (!this.CONFIG.SMART_COPY_ENABLED) return false;
            if (!event || event.defaultPrevented) return false;
            if (this.isEditableSelectionContext()) return false;

            const selection = window.getSelection();
            const hasSelection = Boolean(selection && !selection.isCollapsed && String(selection.toString() || '').trim());
            if (!hasSelection) return false;
            let text = '';
            if (this.CONFIG.SMART_COPY_MODE === 'selection-first' && hasSelection) {
                text = this.buildSmartCopySelectionText(selection);
                if (!text) return false;
            }
            if (!text) {
                text = this.buildSmartCopyTranscriptText();
            }
            if (!text) return false;

            event.preventDefault();
            if (event.clipboardData && typeof event.clipboardData.setData === 'function') {
                event.clipboardData.setData('text/plain', text);
                return true;
            }
            this.copyTextToClipboard(text);
            return true;
        },

        setSmartCopyEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.SMART_COPY_ENABLED === nextValue) return;
            this.CONFIG.SMART_COPY_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Smart copy ${nextValue ? 'on' : 'off'}`);
            }
        },

        setSmartCopyMode(mode, silent = false) {
            const nextValue = mode === 'selection-first' ? 'selection-first' : 'selection-first';
            if (this.CONFIG.SMART_COPY_MODE === nextValue) return;
            this.CONFIG.SMART_COPY_MODE = nextValue;
            if (!silent) {
                this.showNotification(`Smart copy mode: ${nextValue}`);
            }
        },

        setCopyFormat(format, silent = false) {
            const nextValue = format === 'dialogue-plus-setup' ? 'dialogue-plus-setup' : 'dialogue-plus-setup';
            if (this.CONFIG.COPY_FORMAT === nextValue) return;
            this.CONFIG.COPY_FORMAT = nextValue;
            if (!silent) {
                this.showNotification('Copy format updated');
            }
        },

        setClickStartSkipWords(value, silent = false) {
            const parsed = Number.parseInt(value, 10);
            const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
            if (this.CONFIG.CLICK_START_SKIP_WORDS === nextValue) return;
            this.CONFIG.CLICK_START_SKIP_WORDS = nextValue;
            if (!silent) {
                this.showNotification(`Start +${nextValue} words`);
            }
        },

        copyTranscriptFromOverlay() {
            this.copyTranscriptWithFullScan({ showToast: true, buttonId: 'tts-copy-transcript-btn', visualize: true, restorePosition: false });
        },

        copySelectionFromOverlay() {
            const selection = window.getSelection();
            const hasSelection = Boolean(selection && !selection.isCollapsed && String(selection.toString() || '').trim());
            if (!hasSelection) {
                this.copyTranscriptWithFullScan({ showToast: true, buttonId: 'tts-copy-selection-btn', visualize: true, restorePosition: false });
                return;
            }
            this.runSmartCopyAction({
                useSelection: true,
                fallbackToTranscript: true,
                preserveNativeOnSelectionMiss: false,
                showToast: true,
                buttonId: 'tts-copy-selection-btn'
            });
        }
    });
})();
