(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 11: Selection Seek
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        resolveParagraphIndexForNode(node) {
            if (!node) return -1;
            for (let i = 0; i < this.paragraphsList.length; i++) {
                const para = this.paragraphsList[i];
                if (!para || !para.element) continue;
                if (para.element === node) return i;
                if (para.element.contains(node)) return i;
            }
            return -1;
        },

        computeCharIndexWithinParagraphFromRange(paragraphElement, range) {
            if (!paragraphElement || !range) return 0;
            try {
                const beforeRange = document.createRange();
                beforeRange.selectNodeContents(paragraphElement);
                beforeRange.setEnd(range.startContainer, range.startOffset);
                const beforeText = this.cleanTextForTTS(beforeRange.toString() || '');
                const maxIndex = Math.max(0, this.getTextFromElement(paragraphElement).length - 1);
                const index = Math.max(0, Math.min(maxIndex, beforeText.length));
                return Number.isFinite(index) ? index : 0;
            } catch (_error) {
                return 0;
            }
        },

        getRangeFromPoint(x, y) {
            if (typeof document.caretRangeFromPoint === 'function') {
                return document.caretRangeFromPoint(x, y);
            }
            if (typeof document.caretPositionFromPoint === 'function') {
                const pos = document.caretPositionFromPoint(x, y);
                if (!pos || !pos.offsetNode) return null;
                const range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset || 0);
                range.collapse(true);
                return range;
            }
            return null;
        },

        getSelectionJumpTarget(event) {
            this.refreshParagraphsIfNeeded(false);
            if (this.paragraphsList.length === 0) return null;

            const selection = window.getSelection();
            let range = null;
            if (selection && selection.rangeCount > 0) {
                range = selection.getRangeAt(0);
            }

            let startNode = range ? range.startContainer : null;
            if (!startNode && event) {
                const pointedRange = this.getRangeFromPoint(event.clientX, event.clientY);
                if (pointedRange) {
                    range = pointedRange;
                    startNode = pointedRange.startContainer;
                }
            }
            if (!startNode) return null;

            const paragraphIndex = this.resolveParagraphIndexForNode(startNode);
            if (paragraphIndex === -1) return null;
            const paragraph = this.paragraphsList[paragraphIndex];
            if (!paragraph || !paragraph.element) return null;

            const charIndex = this.computeCharIndexWithinParagraphFromRange(paragraph.element, range);
            return {
                paragraphIndex,
                charIndex
            };
        },

        jumpReadingToSelectionTarget(target) {
            if (!target) return false;
            const paragraphIndex = Number.isInteger(target.paragraphIndex) ? target.paragraphIndex : -1;
            const charIndex = Number.isFinite(target.charIndex) ? Math.max(0, Math.floor(target.charIndex)) : 0;
            if (paragraphIndex < 0 || paragraphIndex >= this.paragraphsList.length) return false;
            const paragraph = this.paragraphsList[paragraphIndex];
            if (this.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS) {
                const resolvedTarget = this.getNavigationStartReadTarget(paragraphIndex, charIndex);
                if (!resolvedTarget) return false;

                this.logPlaybackGuardEvent('selection-seek-jump', {
                    paragraphIndex: resolvedTarget.paragraphIndex,
                    charIndex,
                    startCharIndex: resolvedTarget.startCharIndex,
                    currentParagraphIndex: this.currentParagraphIndex
                });

                this.stopTTS(false);
                this.continuousReadingActive = true;
                this.readFromParagraph(
                    resolvedTarget.paragraphIndex,
                    resolvedTarget.startCharIndex > 0 ? { startCharIndex: resolvedTarget.startCharIndex } : {}
                );
                return true;
            }

            const baseWordOffset = Math.max(0, this.findWordIndexByCharFromText(paragraph && paragraph.text ? paragraph.text : '', charIndex));
            const totalWordOffset = baseWordOffset + this.CONFIG.CLICK_START_SKIP_WORDS;
            const resolved = this.resolveParagraphStartByWordOffset(paragraphIndex, totalWordOffset);
            if (!resolved) return false;
            const resolvedParagraph = this.paragraphsList[resolved.paragraphIndex];
            const resolvedCharData = this.getCharIndexByWordOffset(resolvedParagraph && resolvedParagraph.text ? resolvedParagraph.text : '', resolved.wordOffset);
            if (resolvedCharData.totalWords === 0) return false;

            this.logPlaybackGuardEvent('selection-seek-jump', {
                paragraphIndex: resolved.paragraphIndex,
                charIndex,
                startCharIndex: resolvedCharData.startCharIndex,
                currentParagraphIndex: this.currentParagraphIndex
            });

            this.stopTTS(false);
            this.continuousReadingActive = true;
            this.readFromParagraph(resolved.paragraphIndex, { startCharIndex: resolvedCharData.startCharIndex });
            return true;
        },

        handleSelectionSeek(event) {
            if (!(this.ttsActive || this.continuousReadingActive || this.isPaused)) return;
            if (!event || event.type !== 'dblclick') return;
            if (!event || event.button !== 0) return;
            if (event.target && event.target.closest && event.target.closest('[data-tts-ui]')) return;
            if (event.target && event.target.closest && event.target.closest('input, textarea, [role="textbox"], [contenteditable=""], [contenteditable="true"]')) return;

            clearTimeout(this.selectionSeekDebounceId);
            this.selectionSeekDebounceId = setTimeout(() => {
                this.selectionSeekDebounceId = null;
                const target = this.getSelectionJumpTarget(event);
                if (!target) return;
                this.logPlaybackGuardEvent('selection-seek-target', target);
                this.jumpReadingToSelectionTarget(target);
            }, 50);
        },

        isVisiblyReadable(element) {
            if (!element || !element.tagName || element.offsetParent === null || window.getComputedStyle(element).visibility === 'hidden' || window.getComputedStyle(element).display === 'none') {
                return false;
            }
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            if (!this.CONFIG.READ_USER_MESSAGES && this.isUserMessageElement(element)) return false;
            const text = this.getTextFromElement(element);
            if (!text || text.trim().length === 0) return false;
            return true;
        },

        findAllParagraphs() {
            let candidates = Array.from(document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS));
            let readableCandidates = candidates.filter(el => this.isVisiblyReadable(el));
            const candidateSet = new Set(readableCandidates);

            const finalParagraphs = readableCandidates.filter(el => {
                for (const otherEl of candidateSet) {
                    if (el !== otherEl && el.contains(otherEl)) return false;
                }
                return true;
            });

            return finalParagraphs.map(element => {
                const metadata = this.getTextDataFromElement(element);
                return {
                    element,
                    rawText: metadata.rawText,
                    cleanedText: metadata.cleanedText,
                    text: metadata.text,
                    speakerEmoji: metadata.speakerEmoji,
                    speechUnits: this.buildParagraphSpeechUnits(metadata.rawText, metadata.cleanedText, metadata.speakerEmoji)
                };
            });
        },

        // =============================================================================
    });
})();
