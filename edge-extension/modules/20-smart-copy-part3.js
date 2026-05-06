(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        async buildSmartCopyTranscriptTextByScrollingThread(options = null) {
            if (this.CONFIG.COPY_FORMAT !== 'dialogue-plus-setup') return '';
            const progressCallback = typeof options === 'function'
                ? options
                : options && typeof options.progressCallback === 'function'
                    ? options.progressCallback
                    : null;
            const visualize = Boolean(options && options.visualize);
            const restorePosition = Object.prototype.hasOwnProperty.call(options || {}, 'restorePosition')
                ? options.restorePosition !== false
                : !visualize;
            const overlapPx = Math.max(220, Number(options && options.overlapPx) || 300);
            const renderSettleMs = Math.max(220, Number(options && options.settleMs) || (visualize ? 700 : 420));
            const travelSettleMs = Math.max(90, Number(options && options.travelSettleMs) || 120);

            const container = this.getSmartCopyScrollContainer();
            if (!container) return this.buildSmartCopyTranscriptText();

            const originalTop = this.getSmartCopyScrollTop(container);
            const orderedKeys = [];
            const entriesByKey = new Map();
            let seenCounter = 0;
            let lastProgressStage = '';
            let lastProgressBucket = -1;

            const reportProgress = (stage, percent = null) => {
                if (typeof progressCallback !== 'function') return;
                if (stage !== lastProgressStage) {
                    lastProgressStage = stage;
                    lastProgressBucket = -1;
                }
                if (Number.isFinite(percent)) {
                    const bucket = Math.max(0, Math.min(100, Math.floor(percent / 5) * 5));
                    if (bucket === lastProgressBucket) return;
                    lastProgressBucket = bucket;
                    progressCallback({ stage, percent: bucket });
                    return;
                }
                progressCallback({ stage, percent });
            };

            const recordVisibleEntries = () => {
                const entries = this.collectSmartCopyEntriesFromMessages(this.getConversationMessageElements());
                entries.forEach((entry) => {
                    const key = entry.key || this.getStableSmartCopyEntryKey(entry);
                    if (entriesByKey.has(key)) {
                        const existing = entriesByKey.get(key);
                        entriesByKey.set(key, {
                            ...existing,
                            ...entry,
                            firstSeenOrder: existing.firstSeenOrder,
                            turnIndex: Number.isFinite(existing.turnIndex) ? existing.turnIndex : entry.turnIndex,
                            turnMessageIndex: Number.isFinite(existing.turnMessageIndex) ? existing.turnMessageIndex : entry.turnMessageIndex,
                            text: this.mergeSmartCopyEntryText(existing.text, entry.text)
                        });
                        return;
                    }
                    entry.firstSeenOrder = seenCounter++;
                    entriesByKey.set(key, entry);
                    orderedKeys.push(key);
                });
            };

            try {
                const initialMetrics = this.getSmartCopyScrollMetrics(container);
                const travelStepPx = Math.max(100, initialMetrics.view - overlapPx);
                if (visualize && originalTop > 1) {
                    reportProgress('preparing', 0);
                    await this.scrollSmartCopyContainerVisibly(container, 0, {
                        stage: 'preparing',
                        progressCallback: ({ stage, percent }) => reportProgress(stage, percent),
                        stepPx: travelStepPx,
                        settleMs: travelSettleMs
                    });
                } else {
                    reportProgress('scanning', 0);
                    this.setSmartCopyScrollTop(container, 0, { behavior: 'auto' });
                    await this.waitSmartCopySettle(visualize ? travelSettleMs : 40);
                }

                let steps = 0;
                let stuck = 0;
                let lastEntryCount = 0;
                const seenPositions = new Set();

                while (steps < 500) {
                    const metrics = this.getSmartCopyScrollMetrics(container);
                    const stepSize = Math.max(100, metrics.view - overlapPx);
                    const positionKey = Math.round(metrics.pos);

                    if (seenPositions.has(positionKey)) {
                        stuck += 1;
                        if (stuck >= 3) break;
                    } else {
                        seenPositions.add(positionKey);
                        stuck = 0;
                    }

                    reportProgress('scanning', metrics.max <= 0 ? 100 : (metrics.pos / metrics.max) * 100);
                    await this.waitForSmartCopyRender(container, renderSettleMs);
                    recordVisibleEntries();

                    if (metrics.pos >= metrics.max - 5) break;

                    const nextTop = Math.min(metrics.max, metrics.pos + stepSize);
                    if (Math.round(nextTop) === Math.round(metrics.pos)) break;

                    this.setSmartCopyScrollTop(container, nextTop, { behavior: 'auto' });
                    await this.waitSmartCopySettle(visualize ? travelSettleMs : 50);

                    if (entriesByKey.size === lastEntryCount) stuck += 1;
                    lastEntryCount = entriesByKey.size;
                    steps += 1;
                }

                reportProgress('scanning', 100);
                reportProgress('stitching');
            } finally {
                if (restorePosition && visualize) {
                    reportProgress('returning', 0);
                    await this.scrollSmartCopyContainerVisibly(container, originalTop, {
                        stage: 'returning',
                        progressCallback: ({ stage, percent }) => reportProgress(stage, percent),
                        stepPx: Math.max(100, this.getSmartCopyScrollMetrics(container).view - overlapPx),
                        settleMs: travelSettleMs
                    });
                } else if (restorePosition) {
                    reportProgress('returning');
                    this.setSmartCopyScrollTop(container, originalTop, { behavior: 'auto' });
                    await this.waitSmartCopySettle(20);
                }
            }

            const entries = this.sortSmartCopyEntries(
                orderedKeys.map((key) => entriesByKey.get(key)).filter(Boolean)
            );
            return this.formatSmartCopyEntries(entries);
        },

        extractSelectedTextFromNodeWithinRange(node, range) {
            if (!node || !range) return '';
            let nodeRange;
            try {
                nodeRange = document.createRange();
                nodeRange.selectNodeContents(node);
            } catch (_error) {
                return '';
            }

            try {
                if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0) return '';
                if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0) return '';
            } catch (_error) {
                return '';
            }

            const clipped = range.cloneRange();
            try {
                if (clipped.compareBoundaryPoints(Range.START_TO_START, nodeRange) < 0) {
                    clipped.setStart(nodeRange.startContainer, nodeRange.startOffset);
                }
                if (clipped.compareBoundaryPoints(Range.END_TO_END, nodeRange) > 0) {
                    clipped.setEnd(nodeRange.endContainer, nodeRange.endOffset);
                }
            } catch (_error) {
                return '';
            }

            const container = document.createElement('div');
            container.appendChild(clipped.cloneContents());
            this.cleanSmartCopyWorkingNode(container);
            return this.normalizeSmartCopyText(container.innerText || container.textContent || '');
        },

        buildSmartCopySelectionText(selection = null) {
            const activeSelection = selection || window.getSelection();
            if (!activeSelection || activeSelection.rangeCount === 0 || activeSelection.isCollapsed) return '';

            const messages = this.getConversationMessageElements();
            if (messages.length === 0) return '';

            const entries = [];
            messages.forEach((messageElement) => {
                const role = this.getMessageRoleFromElement(messageElement);
                if (role !== 'assistant' && role !== 'user') return;

                const contentNode = this.getPreferredMessageContentNode(messageElement);
                const selectedParts = [];
                for (let i = 0; i < activeSelection.rangeCount; i++) {
                    const range = activeSelection.getRangeAt(i);
                    const selectedText = this.extractSelectedTextFromNodeWithinRange(contentNode || messageElement, range);
                    if (selectedText) selectedParts.push(selectedText);
                }
                if (selectedParts.length === 0) return;

                const merged = this.normalizeSmartCopyText(selectedParts.join('\n'));
                if (!merged) return;
                entries.push({ role, text: merged });
            });

            return this.formatSmartCopyEntries(entries);
        },

        isEditableSelectionContext() {
            const activeEl = document.activeElement;
            if (!activeEl) return false;
            if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') return true;
            if (activeEl.isContentEditable) return true;
            return false;
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
        },

        // =============================================================================
    });
})();
