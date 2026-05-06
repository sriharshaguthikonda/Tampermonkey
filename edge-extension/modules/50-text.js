(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 10: Text & Speech Units
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        cleanTextForTTS(text) {
            return String(text || '')
                .replace(this.CONFIG.EMOJI_REGEX, '')
                .replace(/[\u200D\uFE0E]/g, '')
                .replace(/\s+/g, ' ');
        },

        getWordBoundaries(text) {
            const source = String(text || '');
            const boundaries = [];
            const pattern = /\S+/g;
            let match;
            while ((match = pattern.exec(source)) !== null) {
                boundaries.push({ start: match.index, end: match.index + match[0].length });
            }
            return boundaries;
        },

        findWordIndexByCharFromText(text, charIndex) {
            const boundaries = this.getWordBoundaries(text);
            if (boundaries.length === 0) return -1;
            const safeCharIndex = Math.max(0, Number.isFinite(charIndex) ? charIndex : 0);
            for (let i = 0; i < boundaries.length; i++) {
                const boundary = boundaries[i];
                if (safeCharIndex <= boundary.start) return i;
                if (safeCharIndex < boundary.end) return i;
            }
            return boundaries.length - 1;
        },

        getCharIndexByWordOffset(text, wordOffset) {
            const source = String(text || '');
            const boundaries = this.getWordBoundaries(source);
            if (boundaries.length === 0) return { startCharIndex: 0, totalWords: 0 };

            const safeOffset = Math.max(0, Number.parseInt(wordOffset, 10) || 0);
            if (safeOffset >= boundaries.length) {
                return { startCharIndex: source.length, totalWords: boundaries.length };
            }
            return { startCharIndex: boundaries[safeOffset].start, totalWords: boundaries.length };
        },

        sliceTextByWordOffset(text, wordOffset) {
            const source = String(text || '');
            const charData = this.getCharIndexByWordOffset(source, wordOffset);
            if (charData.totalWords === 0) return { text: '', startCharIndex: 0, totalWords: 0 };
            if (charData.startCharIndex >= source.length) {
                return { text: '', startCharIndex: source.length, totalWords: charData.totalWords };
            }
            return {
                text: source.slice(charData.startCharIndex).trimStart(),
                startCharIndex: charData.startCharIndex,
                totalWords: charData.totalWords
            };
        },

        resolveParagraphStartByWordOffset(startParagraphIndex, wordOffset) {
            let paragraphIndex = Number.parseInt(startParagraphIndex, 10);
            if (!Number.isFinite(paragraphIndex) || paragraphIndex < 0) return null;
            let remainingWords = Math.max(0, Number.parseInt(wordOffset, 10) || 0);

            while (paragraphIndex < this.paragraphsList.length) {
                const para = this.paragraphsList[paragraphIndex];
                const wordCount = this.getWordBoundaries(para && para.text ? para.text : '').length;
                if (wordCount === 0) {
                    paragraphIndex += 1;
                    continue;
                }
                if (remainingWords < wordCount) {
                    return { paragraphIndex, wordOffset: remainingWords };
                }
                remainingWords -= wordCount;
                paragraphIndex += 1;
            }
            return null;
        },

        trimGapForParagraphEnd(text) {
            if (!this.CONFIG.GAP_TRIM_ENABLED) return text;
            let trimmed = text.replace(/\s+$/g, '');
            trimmed = trimmed.replace(/[.!?]+$/g, '');
            return trimmed.replace(/\s+$/g, '');
        },

        getVisibleTextFromNode(node) {
            if (!node) return '';
            const renderedText = String(node.innerText || '').replace(/\r\n/g, '\n');
            if (renderedText) return renderedText;

            if (typeof node.cloneNode === 'function' && typeof node.querySelectorAll === 'function') {
                const clone = node.cloneNode(true);
                clone.querySelectorAll('br').forEach((lineBreak) => {
                    lineBreak.replaceWith('\n');
                });
                return String(clone.textContent || '').replace(/\r\n/g, '\n');
            }

            return String(node.textContent || '').replace(/\r\n/g, '\n');
        },

        getRawTextFromElement(element) {
            if (!element) return '';
            let rawText = '';
            if (this.isChatGPTPage && !this.CONFIG.READ_REFERENCES) {
                const refSelector = this.CONFIG.REFERENCE_SELECTORS;
                if (element.matches && element.matches(refSelector)) {
                    return '';
                }
                if (element.querySelector && element.querySelector(refSelector)) {
                    const clone = element.cloneNode(true);
                    clone.querySelectorAll(refSelector).forEach(node => node.remove());
                    rawText = this.getVisibleTextFromNode(clone);
                } else {
                    rawText = this.getVisibleTextFromNode(element);
                }
            } else {
                rawText = this.getVisibleTextFromNode(element);
            }
            return rawText;
        },

        extractTTSMetadata(text, fallbackSpeakerEmoji = '', sourceElement = null) {
            const rawText = typeof text === 'string' ? text : '';
            let speakerEmoji = this.extractLeadingSpeakerEmoji(rawText);
            if (!speakerEmoji && sourceElement) {
                speakerEmoji = this.extractLeadingSpeakerEmojiFromElement(sourceElement, rawText);
            }
            if (!speakerEmoji) {
                speakerEmoji = this.normalizeEmojiRuleValue(fallbackSpeakerEmoji);
            }
            const cleaned = this.cleanTextForTTS(rawText);

            return {
                rawText,
                cleanedText: cleaned,
                speakerEmoji,
                text: this.trimGapForParagraphEnd(cleaned)
            };
        },

        getTextDataFromElement(element) {
            if (!element) {
                return { rawText: '', cleanedText: '', speakerEmoji: '', text: '' };
            }

            const storedSpeakerEmoji = element.getAttribute('data-tts-speaker-emoji') || '';
            const metadata = this.extractTTSMetadata(this.getRawTextFromElement(element), storedSpeakerEmoji, element);
            if (metadata.speakerEmoji) {
                element.setAttribute('data-tts-speaker-emoji', metadata.speakerEmoji);
            } else {
                element.removeAttribute('data-tts-speaker-emoji');
            }

            return metadata;
        },

        buildParagraphSpeechUnits(rawText, cleanedText, fallbackSpeakerEmoji = '') {
            const normalizedText = typeof cleanedText === 'string' ? cleanedText.trim() : '';
            if (!normalizedText) return [];

            const normalizedRaw = String(rawText || '').replace(/\r\n/g, '\n');
            const rawLines = normalizedRaw
                .split(/\n+/)
                .map((line) => String(line || ''))
                .filter((line) => line.trim().length > 0);
            if (rawLines.length < 2) return [];

            const markedLineCount = rawLines.reduce((count, line) => {
                return count + (this.extractLeadingSpeakerEmoji(line) ? 1 : 0);
            }, 0);
            if (markedLineCount < 2) return [];

            const fallbackEmoji = this.normalizeEmojiRuleValue(fallbackSpeakerEmoji);
            const units = [];
            let activeSpeaker = fallbackEmoji;
            let searchFrom = 0;

            for (const rawLine of rawLines) {
                const lineSpeakerEmoji = this.extractLeadingSpeakerEmoji(rawLine);
                if (lineSpeakerEmoji) {
                    activeSpeaker = lineSpeakerEmoji;
                }

                const cleanedLine = this.cleanTextForTTS(rawLine).trim();
                if (!cleanedLine) continue;

                let startOffset = normalizedText.indexOf(cleanedLine, searchFrom);
                if (startOffset === -1) {
                    startOffset = normalizedText.indexOf(cleanedLine);
                }
                if (startOffset === -1) {
                    startOffset = searchFrom;
                }

                units.push({
                    text: cleanedLine,
                    startOffset: Math.max(0, startOffset),
                    speakerEmoji: activeSpeaker || fallbackEmoji
                });
                searchFrom = Math.max(searchFrom, Math.max(0, startOffset) + cleanedLine.length);
            }

            if (units.length < 2) return [];
            const distinctSpeakers = new Set(units.map((unit) => unit.speakerEmoji).filter(Boolean));
            return distinctSpeakers.size >= 2 ? units : [];
        },

        applyStartOffsetToSpeechUnits(units, requestedStartOffset = 0) {
            if (!Array.isArray(units) || units.length === 0) return [];

            const safeOffset = Number.isFinite(requestedStartOffset)
                ? Math.max(0, Math.floor(requestedStartOffset))
                : 0;
            if (safeOffset <= 0) {
                return units.map((unit) => ({
                    text: unit.text,
                    startOffset: Number.isFinite(unit.startOffset) ? unit.startOffset : 0,
                    speakerEmoji: typeof unit.speakerEmoji === 'string' ? unit.speakerEmoji : ''
                }));
            }

            const adjusted = [];
            for (const unit of units) {
                if (!unit || typeof unit.text !== 'string' || !unit.text.trim()) continue;

                const unitStart = Number.isFinite(unit.startOffset) ? unit.startOffset : 0;
                const unitEnd = unitStart + unit.text.length;
                if (unitEnd <= safeOffset) continue;

                if (safeOffset > unitStart) {
                    const sliced = unit.text.slice(safeOffset - unitStart);
                    const trimmed = sliced.trimStart();
                    if (!trimmed) continue;
                    adjusted.push({
                        text: trimmed,
                        startOffset: safeOffset + (sliced.length - trimmed.length),
                        speakerEmoji: typeof unit.speakerEmoji === 'string' ? unit.speakerEmoji : ''
                    });
                    continue;
                }

                adjusted.push({
                    text: unit.text,
                    startOffset: unitStart,
                    speakerEmoji: typeof unit.speakerEmoji === 'string' ? unit.speakerEmoji : ''
                });
            }

            return adjusted;
        },

        getQueuedSpeechForIndex(index, para, requestedStartOffset = 0) {
            const pendingState = this.chunkedParagraphState.get(index);
            let sourceText = '';
            let sourceStartOffset = 0;
            let sourceSpeakerEmoji = para && typeof para.speakerEmoji === 'string' ? para.speakerEmoji : '';
            let remainingUnits = [];

            if (pendingState && typeof pendingState.text === 'string' && pendingState.text.trim()) {
                sourceText = pendingState.text;
                sourceStartOffset = Number.isFinite(pendingState.startOffset) ? pendingState.startOffset : 0;
                sourceSpeakerEmoji = typeof pendingState.speakerEmoji === 'string' ? pendingState.speakerEmoji : sourceSpeakerEmoji;
                remainingUnits = Array.isArray(pendingState.remainingUnits) ? pendingState.remainingUnits.slice() : [];
            } else {
                const baseUnits = Array.isArray(para && para.speechUnits) && para.speechUnits.length > 0
                    ? para.speechUnits
                    : [{
                        text: para && typeof para.text === 'string' ? para.text : '',
                        startOffset: 0,
                        speakerEmoji: para && typeof para.speakerEmoji === 'string' ? para.speakerEmoji : ''
                    }];
                const queuedUnits = this.applyStartOffsetToSpeechUnits(baseUnits, requestedStartOffset);
                const nextUnit = queuedUnits.shift();
                if (!nextUnit || !nextUnit.text) {
                    this.chunkedParagraphState.delete(index);
                    return { utteranceText: '', startOffset: 0, speakerEmoji: '' };
                }

                sourceText = nextUnit.text;
                sourceStartOffset = Number.isFinite(nextUnit.startOffset) ? nextUnit.startOffset : 0;
                sourceSpeakerEmoji = typeof nextUnit.speakerEmoji === 'string' ? nextUnit.speakerEmoji : sourceSpeakerEmoji;
                remainingUnits = queuedUnits;
            }

            const split = this.splitSpeechChunk(sourceText, sourceStartOffset);
            if (!split.chunkText) {
                this.chunkedParagraphState.delete(index);
                return { utteranceText: '', startOffset: sourceStartOffset, speakerEmoji: sourceSpeakerEmoji };
            }

            if (split.remainderText) {
                this.chunkedParagraphState.set(index, {
                    text: split.remainderText,
                    startOffset: split.nextStartOffset,
                    speakerEmoji: sourceSpeakerEmoji,
                    remainingUnits
                });
            } else if (remainingUnits.length > 0) {
                const [nextUnit, ...restUnits] = remainingUnits;
                this.chunkedParagraphState.set(index, {
                    text: nextUnit.text,
                    startOffset: Number.isFinite(nextUnit.startOffset) ? nextUnit.startOffset : 0,
                    speakerEmoji: typeof nextUnit.speakerEmoji === 'string' ? nextUnit.speakerEmoji : sourceSpeakerEmoji,
                    remainingUnits: restUnits
                });
            } else {
                this.chunkedParagraphState.delete(index);
            }

            return {
                utteranceText: split.chunkText,
                startOffset: sourceStartOffset,
                speakerEmoji: sourceSpeakerEmoji
            };
        },

        getTextFromElement(element) {
            return this.getTextDataFromElement(element).text;
        },

        isUserMessageElement(element) {
            if (!element) return false;
            const userSelectors = this.CONFIG.USER_MESSAGE_SELECTORS;

            if (element.matches && element.matches(userSelectors)) {
                return true;
            }
            if (element.closest && element.closest(userSelectors)) {
                return true;
            }

            // Saved/archived ChatGPT HTML often labels user turns via a screen-reader heading.
            const isYouSaidHeading = (node) => {
                if (!node) return false;
                const text = (node.textContent || '').trim();
                return /^you said\b/i.test(text);
            };

            if (element.matches && element.matches('h4.sr-only') && isYouSaidHeading(element)) {
                return true;
            }

            if (element.querySelector) {
                if (element.querySelector(userSelectors)) {
                    return true;
                }
                const heading = element.querySelector('h4.sr-only');
                if (isYouSaidHeading(heading)) {
                    return true;
                }
            }

            const section = element.closest ? element.closest('section') : null;
            if (!section) return false;
            const sectionTurn = (section.getAttribute('data-turn') || '').toLowerCase();
            if (sectionTurn === 'user') {
                return true;
            }
            const sectionHeading = section.querySelector('h4.sr-only');
            return isYouSaidHeading(sectionHeading);
        },

        // =============================================================================
    });
})();
