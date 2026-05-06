(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        buildSmartCopyTranscriptText() {
            if (this.CONFIG.COPY_FORMAT !== 'dialogue-plus-setup') return '';
            const entries = this.sortSmartCopyEntries(
                this.collectSmartCopyEntriesFromMessages(this.getConversationMessageElements())
            );
            return this.formatSmartCopyEntries(entries);
        },

        getSmartCopyScrollContainer() {
            const candidates = [document.scrollingElement || document.documentElement];
            const all = Array.from(document.querySelectorAll('body *'));

            all.forEach((el) => {
                try {
                    const style = window.getComputedStyle(el);
                    const overflowY = String(style.overflowY || '').toLowerCase();
                    const isScrollable = ['auto', 'scroll', 'overlay'].includes(overflowY);
                    if (!isScrollable) return;
                    if ((el.scrollHeight || 0) <= (el.clientHeight || 0) * 1.5) return;
                    if ((el.clientHeight || 0) <= 200) return;
                    candidates.push(el);
                } catch (_error) {
                    // Ignore style lookup issues.
                }
            });

            candidates.sort((a, b) => {
                const aHeight = a === window
                    ? (document.documentElement.scrollHeight || 0)
                    : (a.scrollHeight || 0);
                const bHeight = b === window
                    ? (document.documentElement.scrollHeight || 0)
                    : (b.scrollHeight || 0);
                return bHeight - aHeight;
            });

            return candidates[0] || document.scrollingElement || document.documentElement || document.body;
        },

        getSmartCopyScrollTop(container) {
            if (!container) return 0;
            if (container === document.body || container === document.documentElement || container === document.scrollingElement) {
                return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
            }
            return container.scrollTop || 0;
        },

        getSmartCopyMaxScrollTop(container) {
            if (!container) return 0;
            const maxTop = Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
            return Number.isFinite(maxTop) ? maxTop : 0;
        },

        setSmartCopyScrollTop(container, top, options = {}) {
            const nextTop = Math.max(0, Number(top) || 0);
            const behavior = options && options.behavior === 'smooth' ? 'smooth' : 'auto';
            if (!container) return;
            if (container === document.body || container === document.documentElement || container === document.scrollingElement) {
                try {
                    if (behavior === 'smooth' && typeof window.scrollTo === 'function') {
                        window.scrollTo({ left: 0, top: nextTop, behavior });
                    } else {
                        window.scrollTo(0, nextTop);
                    }
                } catch (_error) {
                    window.scrollTo(0, nextTop);
                }
                return;
            }
            try {
                if (typeof container.scrollTo === 'function') {
                    container.scrollTo({ top: nextTop, behavior });
                    return;
                }
            } catch (_error) {
                // Fall back to direct assignment.
            }
            container.scrollTop = nextTop;
        },

        waitSmartCopySettle(ms = 130) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        },

        getSmartCopyScrollMetrics(container) {
            if (!container || container === document.body || container === document.documentElement || container === document.scrollingElement) {
                const doc = document.scrollingElement || document.documentElement || document.body;
                const view = window.innerHeight || doc.clientHeight || 0;
                return {
                    pos: this.getSmartCopyScrollTop(container),
                    max: Math.max(0, (doc.scrollHeight || 0) - view),
                    view
                };
            }
            return {
                pos: container.scrollTop || 0,
                max: Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0)),
                view: container.clientHeight || 0
            };
        },

        getSmartCopyVisibleEntriesSignature() {
            const entries = this.collectSmartCopyEntriesFromMessages(this.getConversationMessageElements());
            return entries
                .slice(0, 8)
                .map((entry, index) => {
                    const key = entry.key || this.getStableSmartCopyEntryKey({ ...entry, fallbackIndex: index });
                    return `${key}|${String(entry.text || '').slice(0, 120)}`;
                })
                .join('\n')
                .slice(0, 1500);
        },

        async waitForSmartCopyRender(_container, settleMs = 700) {
            let previousSignature = '';
            let stablePasses = 0;
            const sliceMs = Math.max(60, Math.round(settleMs / 4));

            for (let pass = 0; pass < 8; pass += 1) {
                await this.waitSmartCopySettle(sliceMs);
                const signature = this.getSmartCopyVisibleEntriesSignature();
                if (signature === previousSignature) {
                    stablePasses += 1;
                } else {
                    stablePasses = 0;
                }
                previousSignature = signature;
                if (stablePasses >= 2) break;
            }
        },

        getSmartCopyTruncationScore(text) {
            const source = String(text || '');
            if (!source) return 0;
            const dotLineCount = source
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line === '.' || line === '..' || line === '...')
                .length;
            const dotOnlyTokens = (source.match(/\.\s*/g) || []).length;
            return dotLineCount * 60 + dotOnlyTokens;
        },

        findSmartCopyTextOverlap(leftText, rightText, minOverlap = 24) {
            const left = String(leftText || '');
            const right = String(rightText || '');
            const limit = Math.min(left.length, right.length);
            if (!left || !right || limit < minOverlap) return 0;

            for (let size = limit; size >= minOverlap; size -= 1) {
                if (left.slice(-size) === right.slice(0, size)) return size;
            }
            return 0;
        },

        findSmartCopyLineOverlap(leftLines, rightLines, minChars = 24) {
            if (!Array.isArray(leftLines) || !Array.isArray(rightLines)) return 0;
            const limit = Math.min(leftLines.length, rightLines.length);
            for (let size = limit; size >= 1; size -= 1) {
                const leftSlice = leftLines.slice(-size).join('\n');
                const rightSlice = rightLines.slice(0, size).join('\n');
                if (leftSlice && leftSlice === rightSlice && (leftSlice.length >= minChars || size >= 2)) {
                    return size;
                }
            }
            return 0;
        },

        shouldReplaceSmartCopyEntry(existingEntry, incomingEntry) {
            if (!existingEntry) return true;
            if (!incomingEntry) return false;

            const existingText = String(existingEntry.text || '');
            const incomingText = String(incomingEntry.text || '');
            if (!incomingText) return false;
            if (!existingText) return true;

            const existingScore = this.getSmartCopyTruncationScore(existingText);
            const incomingScore = this.getSmartCopyTruncationScore(incomingText);
            const existingLen = existingText.length;
            const incomingLen = incomingText.length;

            if (incomingScore < existingScore && incomingLen >= Math.max(40, Math.floor(existingLen * 0.6))) return true;
            if (incomingLen > existingLen + 30) return true;
            if (incomingLen > existingLen && incomingText.includes('\n') && !existingText.includes('\n')) return true;
            return false;
        },

        mergeSmartCopyEntryText(existingText, incomingText) {
            const existing = this.normalizeSmartCopyText(existingText);
            const incoming = this.normalizeSmartCopyText(incomingText);
            if (!existing) return incoming;
            if (!incoming) return existing;
            if (existing === incoming) return existing;
            if (existing.includes(incoming)) return existing;
            if (incoming.includes(existing)) return incoming;

            const forwardOverlap = this.findSmartCopyTextOverlap(existing, incoming);
            const backwardOverlap = this.findSmartCopyTextOverlap(incoming, existing);
            if (forwardOverlap >= 24 || backwardOverlap >= 24) {
                return forwardOverlap >= backwardOverlap
                    ? this.normalizeSmartCopyText(existing + incoming.slice(forwardOverlap))
                    : this.normalizeSmartCopyText(incoming + existing.slice(backwardOverlap));
            }

            const existingLines = existing.split('\n');
            const incomingLines = incoming.split('\n');
            const forwardLineOverlap = this.findSmartCopyLineOverlap(existingLines, incomingLines);
            const backwardLineOverlap = this.findSmartCopyLineOverlap(incomingLines, existingLines);
            if (forwardLineOverlap >= 1 || backwardLineOverlap >= 1) {
                return forwardLineOverlap >= backwardLineOverlap
                    ? this.normalizeSmartCopyText(existingLines.concat(incomingLines.slice(forwardLineOverlap)).join('\n'))
                    : this.normalizeSmartCopyText(incomingLines.concat(existingLines.slice(backwardLineOverlap)).join('\n'));
            }

            if (this.shouldReplaceSmartCopyEntry({ text: existing }, { text: incoming })) return incoming;
            if (this.shouldReplaceSmartCopyEntry({ text: incoming }, { text: existing })) return existing;
            return incoming.length > existing.length ? incoming : existing;
        },

        setSmartCopyActionButtonsBusy(activeButtonId = '', label = '') {
            ['tts-copy-transcript-btn', 'tts-copy-selection-btn'].forEach((buttonId) => {
                const button = document.getElementById(buttonId);
                if (!button) return;
                if (!button.dataset.defaultLabel) {
                    button.dataset.defaultLabel = String(button.textContent || '').trim();
                }
                const isBusy = Boolean(activeButtonId);
                const isActive = isBusy && buttonId === activeButtonId;
                button.disabled = isBusy;
                button.style.opacity = isBusy && !isActive ? '0.65' : '1';
                button.style.cursor = isBusy ? 'wait' : 'pointer';
                button.textContent = isActive && label ? label : button.dataset.defaultLabel;
            });
        },

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

    });
})();
