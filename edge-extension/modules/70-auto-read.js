(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    const { getCurrentProfile, persistProfileSetting } = ns.helpers;

    Object.assign(ns.TTSReader, {
        // SECTION 14: Auto-Read Observer
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        initAutoReadObserver() {
            if (this.autoReadObserver) return;
            this.autoReadObserver = new MutationObserver((mutations) => {
                if (!this.CONFIG.AUTO_READ_NEW_MESSAGES) return;
                if (this.continuousReadingActive || this.ttsActive || this.isNavigating || this.navKeyHeld) return;

                const now = Date.now();
                const touchedMessages = new Set();
                let shouldTrigger = false;
                for (const mutation of mutations) {
                    if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
                    const targetElement = mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE
                        ? mutation.target
                        : mutation.target && mutation.target.parentElement;
                    const targetMessage = targetElement ? targetElement.closest('[data-message-author-role="assistant"]') : null;
                    if (targetMessage) {
                        touchedMessages.add(targetMessage);
                    }
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const parentElement = node.parentElement;
                            const messageElement = parentElement ? parentElement.closest('[data-message-author-role="assistant"]') : null;
                            if (this.isAutoReadEligibleMessage(messageElement)) {
                                shouldTrigger = true;
                                break;
                            }
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            const messageElement = element.matches && element.matches('[data-message-author-role="assistant"]')
                                ? element
                                : element.querySelector && element.querySelector('[data-message-author-role="assistant"]');
                            if (this.isAutoReadEligibleMessage(messageElement)) {
                                shouldTrigger = true;
                                break;
                            }
                        }
                    }
                    if (shouldTrigger) break;
                }

                if (touchedMessages.size > 0) {
                    for (const messageElement of touchedMessages) {
                        this.autoReadMessageActivity.set(messageElement, now);
                    }
                }

                if (shouldTrigger) {
                    this.scheduleAutoRead();
                }
            });

            this.autoReadObserver.observe(document.body, { childList: true, subtree: true });
        },

        scheduleAutoRead() {
            if (!this.CONFIG.AUTO_READ_NEW_MESSAGES) return;
            clearTimeout(this.autoReadDebounceId);
            this.autoReadDebounceId = setTimeout(() => {
                this.autoReadDebounceId = null;
                this.startAutoReadFromLatestAssistant();
            }, 120);
        },

        getLatestAssistantMessageElement() {
            const messages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
            if (messages.length === 0) return null;
            return messages[messages.length - 1];
        },

        getAssistantParagraphs(messageElement) {
            if (!messageElement) return [];
            return this.paragraphsList.filter(p => messageElement.contains(p.element));
        },

        getNonNegativeInteger(value, fallback = 0) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(0, Math.round(parsed));
        },

        normalizeAutoReadStartSkipUnit(unit) {
            const next = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
            if (next === 'character' || next === 'grapheme' || next === 'word' || next === 'sentence') return next;
            return 'character';
        },

        getAutoReadStartSkipAmount() {
            const amount = this.getNonNegativeInteger(this.CONFIG.AUTO_READ_START_SKIP_AMOUNT, 0);
            if (amount > 0) return amount;
            return this.getNonNegativeInteger(this.CONFIG.AUTO_READ_START_SKIP_CHARS, 0);
        },

        getGraphemeBoundaries(text) {
            const source = String(text || '');
            if (!source) return [];
            if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
                const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
                return Array.from(segmenter.segment(source), segment => ({
                    start: segment.index,
                    end: segment.index + segment.segment.length
                }));
            }
            const boundaries = [];
            let offset = 0;
            for (const part of Array.from(source)) {
                boundaries.push({ start: offset, end: offset + part.length });
                offset += part.length;
            }
            return boundaries;
        },

        getSentenceBoundaries(text) {
            const source = String(text || '');
            if (!source.trim()) return [];
            if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
                const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
                return Array.from(segmenter.segment(source))
                    .filter(segment => String(segment.segment || '').trim())
                    .map(segment => ({
                        start: segment.index,
                        end: segment.index + segment.segment.length
                    }));
            }
            const boundaries = [];
            const pattern = /[^.!?]+[.!?]*/g;
            let match;
            while ((match = pattern.exec(source)) !== null) {
                if (!match[0].trim()) continue;
                const leadingWhitespace = match[0].match(/^\s*/)[0].length;
                boundaries.push({
                    start: match.index + leadingWhitespace,
                    end: match.index + match[0].length
                });
            }
            return boundaries;
        },

        getTextUnitBoundaries(text, unit) {
            const normalizedUnit = this.normalizeAutoReadStartSkipUnit(unit);
            if (normalizedUnit === 'word') return this.getWordBoundaries(text);
            if (normalizedUnit === 'grapheme') return this.getGraphemeBoundaries(text);
            if (normalizedUnit === 'sentence') return this.getSentenceBoundaries(text);
            const source = String(text || '');
            return Array.from({ length: source.length }, (_, index) => ({ start: index, end: index + 1 }));
        },

        getCharIndexByTextUnitOffset(text, unit, unitOffset) {
            const source = String(text || '');
            const boundaries = this.getTextUnitBoundaries(source, unit);
            if (boundaries.length === 0) return { startCharIndex: 0, totalUnits: 0 };
            const safeOffset = this.getNonNegativeInteger(unitOffset, 0);
            if (safeOffset >= boundaries.length) {
                return { startCharIndex: source.length, totalUnits: boundaries.length };
            }
            return { startCharIndex: boundaries[safeOffset].start, totalUnits: boundaries.length };
        },

        getTextUnitIndexAtOrAfterChar(text, unit, charIndex) {
            const source = String(text || '');
            const boundaries = this.getTextUnitBoundaries(source, unit);
            if (boundaries.length === 0) return { unitIndex: -1, totalUnits: 0 };
            const safeCharIndex = Math.max(0, Math.floor(Number(charIndex) || 0));
            for (let i = 0; i < boundaries.length; i += 1) {
                const boundary = boundaries[i];
                if (safeCharIndex <= boundary.start) return { unitIndex: i, totalUnits: boundaries.length };
                if (safeCharIndex < boundary.end) return { unitIndex: i, totalUnits: boundaries.length };
            }
            return { unitIndex: boundaries.length, totalUnits: boundaries.length };
        },

        resolveStartPositionWithUnitSkip(startParagraphIndex, startCharIndex = 0, options = {}) {
            let paragraphIndex = Number.parseInt(startParagraphIndex, 10);
            if (!Number.isFinite(paragraphIndex) || paragraphIndex < 0) return null;

            const unit = this.normalizeAutoReadStartSkipUnit(
                Object.prototype.hasOwnProperty.call(options, 'unit')
                    ? options.unit
                    : this.CONFIG.AUTO_READ_START_SKIP_UNIT
            );
            let remainingUnits = this.getNonNegativeInteger(
                Object.prototype.hasOwnProperty.call(options, 'amount')
                    ? options.amount
                    : this.getAutoReadStartSkipAmount(),
                0
            );
            let baseCharIndex = this.getNonNegativeInteger(startCharIndex, 0);

            while (paragraphIndex < this.paragraphsList.length) {
                const paragraph = this.paragraphsList[paragraphIndex];
                const text = typeof paragraph?.text === 'string' ? paragraph.text : '';
                if (!text) {
                    paragraphIndex += 1;
                    baseCharIndex = 0;
                    continue;
                }

                if (remainingUnits <= 0) {
                    return {
                        paragraphIndex,
                        startCharIndex: Math.min(baseCharIndex, text.length)
                    };
                }

                const unitData = this.getTextUnitIndexAtOrAfterChar(text, unit, baseCharIndex);
                if (unitData.totalUnits === 0 || unitData.unitIndex >= unitData.totalUnits) {
                    paragraphIndex += 1;
                    baseCharIndex = 0;
                    continue;
                }

                const availableUnits = unitData.totalUnits - unitData.unitIndex;
                if (remainingUnits < availableUnits) {
                    const charData = this.getCharIndexByTextUnitOffset(text, unit, unitData.unitIndex + remainingUnits);
                    return {
                        paragraphIndex,
                        startCharIndex: charData.startCharIndex
                    };
                }

                remainingUnits -= availableUnits;
                paragraphIndex += 1;
                baseCharIndex = 0;
            }

            return null;
        },

        getNavigationStartReadTarget(paragraphIndex, startCharIndex = 0) {
            if (!this.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS) {
                return {
                    paragraphIndex,
                    startCharIndex: this.getNonNegativeInteger(startCharIndex, 0)
                };
            }
            return this.resolveStartPositionWithUnitSkip(paragraphIndex, startCharIndex);
        },

        readFromParagraphWithNavigationStartSkip(paragraphIndex, startCharIndex = 0) {
            const target = this.getNavigationStartReadTarget(paragraphIndex, startCharIndex);
            if (!target) {
                this.showNotification('Start skip reached end of readable text.');
                return false;
            }
            const options = target.startCharIndex > 0
                ? { startCharIndex: target.startCharIndex }
                : {};
            this.readFromParagraph(target.paragraphIndex, options);
            return true;
        },

        resolveAutoReadStartForMessage(messageElement) {
            const messageParagraphs = this.getAssistantParagraphs(messageElement);
            if (messageParagraphs.length === 0) return null;

            const unit = this.normalizeAutoReadStartSkipUnit(this.CONFIG.AUTO_READ_START_SKIP_UNIT);
            let remainingUnits = this.getAutoReadStartSkipAmount();
            for (const paragraph of messageParagraphs) {
                const paragraphIndex = this.paragraphsList.indexOf(paragraph);
                if (paragraphIndex === -1) continue;
                const text = typeof paragraph.text === 'string' ? paragraph.text : '';
                if (text.length === 0) continue;
                const charData = this.getCharIndexByTextUnitOffset(text, unit, remainingUnits);
                if (charData.totalUnits === 0) continue;
                if (remainingUnits < charData.totalUnits) {
                    return { paragraphIndex, startCharIndex: charData.startCharIndex };
                }
                remainingUnits -= charData.totalUnits;
            }
            return null;
        },

        setActiveAutoReadScope(messageElement, paragraphIndex, startCharIndex) {
            this.activeAutoReadMessageElement = messageElement || null;
            this.activeAutoReadStartParagraphIndex = Number.isInteger(paragraphIndex) ? paragraphIndex : -1;
            this.activeAutoReadStartCharIndex = this.getNonNegativeInteger(startCharIndex, 0);
        },

        clearActiveAutoReadScope() {
            this.activeAutoReadMessageElement = null;
            this.activeAutoReadStartParagraphIndex = -1;
            this.activeAutoReadStartCharIndex = 0;
        },

        isCurrentAutoReadLoopActive() {
            return Boolean(this.CONFIG.AUTO_READ_LOOP_CURRENT_MESSAGE && this.activeAutoReadMessageElement);
        },

        isParagraphInCurrentAutoReadLoop(index) {
            if (!this.isCurrentAutoReadLoopActive()) return true;
            const paragraph = this.paragraphsList[index];
            return Boolean(paragraph && paragraph.element && this.activeAutoReadMessageElement.contains(paragraph.element));
        },

        shouldLoopCurrentAutoReadMessageAfterIndex(index) {
            if (!this.isCurrentAutoReadLoopActive()) return false;
            for (let i = index + 1; i < this.paragraphsList.length; i += 1) {
                if (this.isParagraphInCurrentAutoReadLoop(i)) return false;
            }
            return true;
        },

        getActiveAutoReadLoopStart() {
            if (!this.isCurrentAutoReadLoopActive()) return null;
            const startIndex = this.paragraphsList.findIndex(p => p.element && this.activeAutoReadMessageElement.contains(p.element));
            if (startIndex === -1) return null;
            if (
                this.activeAutoReadStartParagraphIndex >= 0 &&
                this.activeAutoReadStartParagraphIndex < this.paragraphsList.length &&
                this.isParagraphInCurrentAutoReadLoop(this.activeAutoReadStartParagraphIndex)
            ) {
                return {
                    paragraphIndex: this.activeAutoReadStartParagraphIndex,
                    startCharIndex: this.activeAutoReadStartCharIndex
                };
            }
            return { paragraphIndex: startIndex, startCharIndex: 0 };
        },

        isAutoReadEligibleMessage(messageElement) {
            if (!messageElement) return false;
            if (messageElement.getAttribute('data-message-author-role') !== 'assistant') return false;
            const messageType = (messageElement.getAttribute('data-message-type') || '').toLowerCase();
            if (messageType && /thinking|analysis|tool|status/.test(messageType)) return false;
            const label = (messageElement.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('thinking')) return false;
            const text = (messageElement.textContent || '').trim();
            if (!text) return false;
            if (/^(thinking|analyzing|searching)\b/i.test(text)) return false;
            return true;
        },

        startAutoReadFromLatestAssistant() {
            if (!this.CONFIG.AUTO_READ_NEW_MESSAGES) return;
            if (this.continuousReadingActive || this.ttsActive || this.isNavigating || this.navKeyHeld) return;

            this.refreshParagraphsIfNeeded(true);
            const messageElement = this.getLatestAssistantMessageElement();
            if (!this.isAutoReadEligibleMessage(messageElement)) return;
            if (this.lastAutoReadMessageElement === messageElement) return;
            const now = Date.now();
            if (this.lastAutoReadTriggeredAt && now - this.lastAutoReadTriggeredAt < this.CONFIG.AUTO_READ_COOLDOWN_MS) return;
            const lastMutationAt = this.autoReadMessageActivity.get(messageElement);
            if (lastMutationAt && now - lastMutationAt < this.CONFIG.AUTO_READ_STABLE_MS) {
                this.scheduleAutoRead();
                return;
            }
            const messageParagraphs = this.getAssistantParagraphs(messageElement);
            if (messageParagraphs.length < this.CONFIG.AUTO_READ_MIN_PARAGRAPHS) {
                this.scheduleAutoRead();
                return;
            }

            const start = this.resolveAutoReadStartForMessage(messageElement);
            if (!start) {
                this.showNotification('Auto-read skip reached end of message.');
                return;
            }

            this.lastAutoReadMessageElement = messageElement;
            this.lastAutoReadTriggeredAt = now;
            this.setActiveAutoReadScope(messageElement, start.paragraphIndex, start.startCharIndex);
            this.continuousReadingActive = true;
            this.readFromParagraph(start.paragraphIndex, { startCharIndex: start.startCharIndex });
        },

        waitForMoreParagraphs(nextIndex) {
            if (!this.continuousReadingActive) return;
            this.waitingForMoreContent = true;
            this.waitForMoreSince = Date.now();
            this.waitForMoreNextIndex = nextIndex;
            this.scheduleWaitForMore();
        },

        scheduleWaitForMore() {
            clearTimeout(this.waitForMoreTimeoutId);
            this.waitForMoreTimeoutId = setTimeout(() => {
                this.waitForMoreTimeoutId = null;
                this.checkForMoreParagraphs();
            }, this.CONFIG.WAIT_RETRY_MS);
        },

        checkForMoreParagraphs() {
            if (!this.waitingForMoreContent || !this.continuousReadingActive) return;
            const now = Date.now();
            const waitLimit = this.CONFIG.LOOP_ON_END ? this.CONFIG.LOOP_WAIT_MS : this.CONFIG.WAIT_FOR_MORE_MS;
            if (now - this.waitForMoreSince > waitLimit) {
                this.waitingForMoreContent = false;
                this.waitForMoreNextIndex = -1;
                if (this.CONFIG.LOOP_ON_END) {
                    this.loopToTop();
                    return;
                }
                this.stopTTS(false);
                this.showNotification('End of page.');
                return;
            }

            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }

            if (this.waitForMoreNextIndex >= 0 && this.waitForMoreNextIndex < this.paragraphsList.length) {
                const nextIndex = this.waitForMoreNextIndex;
                this.waitingForMoreContent = false;
                this.waitForMoreNextIndex = -1;
                if (!this.isParagraphInCurrentAutoReadLoop(nextIndex)) {
                    this.loopToTop();
                    return;
                }
                this.readFromParagraph(nextIndex);
                return;
            }

            this.scheduleWaitForMore();
        },

        loopToTop() {
            if (!this.continuousReadingActive) return;
            this.waitingForMoreContent = false;
            this.waitForMoreNextIndex = -1;
            clearTimeout(this.waitForMoreTimeoutId);
            this.waitForMoreTimeoutId = null;

            this.refreshParagraphsIfNeeded(true);
            const loopTarget = this.getActiveAutoReadLoopStart();

            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }
            this.continuousReadingActive = true;
            if (loopTarget) {
                this.showNotification('Looping current message.');
                this.readFromParagraph(loopTarget.paragraphIndex, { startCharIndex: loopTarget.startCharIndex });
                return;
            }
            this.showNotification('Looping to top.');
            this.readFromParagraph(0);
        },

        setSpeechRate(rate, silent = false) {
            const parsed = Number(rate);
            if (!Number.isFinite(parsed)) return;
            this.CONFIG.SPEECH_RATE = parsed;
            const speedValue = document.getElementById('speed-value');
            if (speedValue) speedValue.textContent = this.CONFIG.SPEECH_RATE.toFixed(1);
            const speedInput = document.getElementById('tts-speed');
            if (speedInput) speedInput.value = String(this.CONFIG.SPEECH_RATE);
            if (!silent) this.showNotification(`Speed ${this.CONFIG.SPEECH_RATE.toFixed(1)}x`);
        },

        setVoiceUri(voiceUri, silent = false) {
            const nextValue = typeof voiceUri === 'string' ? voiceUri : '';
            if (this.CONFIG.VOICE_URI === nextValue) return;
            this.CONFIG.VOICE_URI = nextValue;
            if (silent) return;

            if (!nextValue) {
                this.showNotification('Voice auto');
                return;
            }

            if (this.isServerVoiceUri(nextValue)) {
                const selectedServer = (this.serverVoices || []).find(v => v.voiceURI === nextValue);
                this.showNotification(`Voice ${selectedServer ? selectedServer.name : nextValue.slice('server:'.length)} (server)`);
                return;
            }

            const selected = this.speechSynthesis.getVoices().find(v => v.voiceURI === nextValue);
            this.showNotification(`Voice ${selected ? selected.name : 'updated'}`);
        },

        setWordHighlightEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.WORD_HIGHLIGHT_ENABLED === nextValue) return;
            this.CONFIG.WORD_HIGHLIGHT_ENABLED = nextValue;
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                this.clearHighlights(true);
                this.clearPrewrappedParagraphs();
            }
            if (!silent) {
                this.showNotification(`Word highlight ${this.CONFIG.WORD_HIGHLIGHT_ENABLED ? 'on' : 'off'}`);
            }
        },

        setGapTrimEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.GAP_TRIM_ENABLED === nextValue) return;
            this.CONFIG.GAP_TRIM_ENABLED = nextValue;
            this.paragraphsDirty = true;
            if (!this.continuousReadingActive) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (!silent) {
                this.showNotification(`Gap trim ${this.CONFIG.GAP_TRIM_ENABLED ? 'on' : 'off'}`);
            }
        },

        setAutoReadEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.AUTO_READ_NEW_MESSAGES === nextValue) return;
            this.CONFIG.AUTO_READ_NEW_MESSAGES = nextValue;
            if (!silent) {
                this.showNotification(`Auto-read ${this.CONFIG.AUTO_READ_NEW_MESSAGES ? 'on' : 'off'}`);
            }
            if (this.CONFIG.AUTO_READ_NEW_MESSAGES) {
                this.scheduleAutoRead();
            } else {
                clearTimeout(this.autoReadDebounceId);
                this.autoReadDebounceId = null;
                this.lastAutoReadMessageElement = null;
                this.lastAutoReadTriggeredAt = 0;
                this.clearActiveAutoReadScope();
            }
        },

        setAutoReadStartSkipChars(value, silent = false) {
            const nextValue = this.getNonNegativeInteger(value, 0);
            if (this.CONFIG.AUTO_READ_START_SKIP_CHARS === nextValue) return;
            this.CONFIG.AUTO_READ_START_SKIP_CHARS = nextValue;
            this.CONFIG.AUTO_READ_START_SKIP_AMOUNT = nextValue;
            this.CONFIG.AUTO_READ_START_SKIP_UNIT = 'character';
            if (!silent) {
                this.showNotification(`Auto-read starts +${nextValue} chars`);
            }
        },

        setAutoReadStartSkipAmount(value, silent = false) {
            const nextValue = this.getNonNegativeInteger(value, 0);
            if (this.CONFIG.AUTO_READ_START_SKIP_AMOUNT === nextValue) return;
            this.CONFIG.AUTO_READ_START_SKIP_AMOUNT = nextValue;
            if (this.CONFIG.AUTO_READ_START_SKIP_UNIT === 'character') {
                this.CONFIG.AUTO_READ_START_SKIP_CHARS = nextValue;
            }
            if (!silent) {
                this.showNotification(`Auto-read skip count ${nextValue}`);
            }
        },

        setAutoReadStartSkipUnit(unit, silent = false) {
            const nextUnit = this.normalizeAutoReadStartSkipUnit(unit);
            if (this.CONFIG.AUTO_READ_START_SKIP_UNIT === nextUnit) return;
            this.CONFIG.AUTO_READ_START_SKIP_UNIT = nextUnit;
            if (!silent) {
                this.showNotification(`Auto-read skip unit ${nextUnit}`);
            }
        },

        setAutoReadLoopCurrentMessage(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.AUTO_READ_LOOP_CURRENT_MESSAGE === nextValue) return;
            this.CONFIG.AUTO_READ_LOOP_CURRENT_MESSAGE = nextValue;
            if (!silent) {
                this.showNotification(`Auto-read message loop ${nextValue ? 'on' : 'off'}`);
            }
        },

        setApplyStartSkipToNavigationStarts(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS === nextValue) return;
            this.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS = nextValue;
            if (!silent) {
                this.showNotification(`Navigation start skip ${nextValue ? 'on' : 'off'}`);
            }
        },

        setReadUserMessagesEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.READ_USER_MESSAGES === nextValue) return;
            this.CONFIG.READ_USER_MESSAGES = nextValue;
            this.paragraphsDirty = true;
            if (!this.continuousReadingActive) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (!silent) {
                this.showNotification(`User messages ${this.CONFIG.READ_USER_MESSAGES ? 'on' : 'off'}`);
            }
        },

        setReadReferencesEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.READ_REFERENCES === nextValue) return;
            this.CONFIG.READ_REFERENCES = nextValue;
            this.paragraphsDirty = true;
            if (!this.continuousReadingActive) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (!silent) {
                this.showNotification(`References ${this.CONFIG.READ_REFERENCES ? 'on' : 'off'}`);
            }
        },

        applyChatGPTTextStyling() {
            if (this.chatgptTextStyleElement && this.chatgptTextStyleElement.parentNode) {
                this.chatgptTextStyleElement.parentNode.removeChild(this.chatgptTextStyleElement);
            }
            this.chatgptTextStyleElement = null;

            if (!this.isChatGPTPage || !this.CONFIG.CHATGPT_TEXT_STYLING) {
                return;
            }

            const style = document.createElement('style');
            style.id = 'tts-chatgpt-text-styling';
            style.setAttribute('data-tts-ui', 'true');
            style.textContent = `
                [data-message-author-role] .markdown em {
                    text-decoration: none !important;
                    font-weight: 700 !important;
                    font-style: normal !important;
                    color: #f7335d !important;
                }
                [data-message-author-role] .markdown strong {
                    color: #1177ff !important;
                    font-weight: 700 !important;
                    font-style: normal !important;
                    text-decoration: none !important;
                }
            `;
            document.head.appendChild(style);
            this.chatgptTextStyleElement = style;
        },

        setChatGPTTextStylingEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.CHATGPT_TEXT_STYLING === nextValue) {
                this.applyChatGPTTextStyling();
                return;
            }
            this.CONFIG.CHATGPT_TEXT_STYLING = nextValue;
            this.applyChatGPTTextStyling();
            if (!silent) {
                if (!this.isChatGPTPage && nextValue) {
                    this.showNotification('Chat styling applies on ChatGPT pages only');
                } else {
                    this.showNotification(`Chat styling ${nextValue ? 'on' : 'off'}`);
                }
            }
        },

        setLoopEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.LOOP_ON_END === nextValue) return;
            this.CONFIG.LOOP_ON_END = nextValue;
            if (!silent) {
                this.showNotification(`Loop ${this.CONFIG.LOOP_ON_END ? 'on' : 'off'}`);
            }
        },

        setAutoScrollEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.AUTO_SCROLL_ENABLED === nextValue) return;
            this.CONFIG.AUTO_SCROLL_ENABLED = nextValue;

            if (!nextValue) {
                this.stopAutoScroll();
            } else if (this.continuousReadingActive) {
                this.startAutoScroll();
                this.maybeAutoScrollOnStart();
            }

            if (!silent) {
                this.showNotification(`Auto-scroll ${nextValue ? 'on' : 'off'}`);
            }
        },

        normalizeHiddenTabPolicy(value) {
            const raw = String(value || '').toLowerCase();
            if (raw === 'never' || raw === 'immediate' || raw === 'delay') return raw;
            return 'delay';
        },

        setHiddenTabPolicy(policy, silent = false) {
            const nextPolicy = this.normalizeHiddenTabPolicy(policy);
            if (this.CONFIG.HIDDEN_TAB_POLICY === nextPolicy) return;
            this.CONFIG.HIDDEN_TAB_POLICY = nextPolicy;
            if (!silent) {
                this.showNotification(`Hidden tab policy: ${nextPolicy}`);
            }
        },

        setAutoPauseHiddenDelayMs(value, silent = false) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return;
            const nextDelay = Math.max(0, Math.round(parsed));
            if (this.CONFIG.AUTO_PAUSE_HIDDEN_DELAY_MS === nextDelay) return;
            this.CONFIG.AUTO_PAUSE_HIDDEN_DELAY_MS = nextDelay;
            if (!silent) {
                this.showNotification(`Hidden pause delay: ${nextDelay} ms`);
            }
        },

        setIdleArrowNavigationEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.IDLE_ARROW_NAVIGATION === nextValue) return;
            this.CONFIG.IDLE_ARROW_NAVIGATION = nextValue;
            if (!silent) {
                this.showNotification(`Idle arrow nav ${nextValue ? 'on' : 'off'}`);
            }
        },

        applyOverlayVisibility() {
            const root = document.documentElement;
            if (!root) return;
            root.classList.toggle('tts-overlay-hidden', !this.CONFIG.SHOW_PAGE_OVERLAY);
        },

        setPageOverlayEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            this.CONFIG.SHOW_PAGE_OVERLAY = nextValue;
            this.applyOverlayVisibility();
            if (!silent && nextValue) {
                this.showNotification('Page overlay on');
            }
        },

        normalizeOverlayPosition(position) {
            if (!position || typeof position !== 'object') return null;
            const left = Number(position.left);
            const top = Number(position.top);
            if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
            return {
                left: Math.round(left),
                top: Math.round(top)
            };
        },

        clampOverlayPosition(position, panel) {
            const margin = 8;
            const width = panel.offsetWidth || 180;
            const height = panel.offsetHeight || 220;
            const maxLeft = Math.max(margin, window.innerWidth - width - margin);
            const maxTop = Math.max(margin, window.innerHeight - height - margin);
            return {
                left: Math.min(Math.max(position.left, margin), maxLeft),
                top: Math.min(Math.max(position.top, margin), maxTop)
            };
        },

        getDefaultOverlayPosition(panel) {
            const margin = 12;
            const width = panel.offsetWidth || 180;
            const height = panel.offsetHeight || 220;
            const candidatePositions = [
                { left: margin, top: 80 },
                { left: window.innerWidth - width - margin, top: 80 },
                { left: margin, top: window.innerHeight - height - margin },
                { left: window.innerWidth - width - margin, top: window.innerHeight - height - margin }
            ];

            let best = this.clampOverlayPosition(candidatePositions[0], panel);
            let bestScore = Number.POSITIVE_INFINITY;
            const sampleSelector = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, article, [data-message-author-role]';

            for (const candidate of candidatePositions) {
                const clamped = this.clampOverlayPosition(candidate, panel);
                let score = 0;
                const samplePoints = [
                    { x: clamped.left + 20, y: clamped.top + 20 },
                    { x: clamped.left + width - 20, y: clamped.top + 20 },
                    { x: clamped.left + 20, y: clamped.top + height - 20 },
                    { x: clamped.left + width - 20, y: clamped.top + height - 20 },
                    { x: clamped.left + width / 2, y: clamped.top + height / 2 }
                ];
                for (const point of samplePoints) {
                    const x = Math.max(0, Math.min(window.innerWidth - 1, point.x));
                    const y = Math.max(0, Math.min(window.innerHeight - 1, point.y));
                    const hit = document.elementFromPoint(x, y);
                    if (!hit) continue;
                    if (hit.closest('[data-tts-ui]')) continue;
                    if (hit.matches(sampleSelector) || hit.closest(sampleSelector)) {
                        score += 2;
                    } else if ((hit.textContent || '').trim().length > 0) {
                        score += 1;
                    }
                }
                if (score < bestScore) {
                    bestScore = score;
                    best = clamped;
                }
            }

            return best;
        },

        applyOverlayPanelPosition(position = null) {
            const panel = this.overlayPanel || document.getElementById('tts-control-panel');
            if (!panel) return;
            const normalized = this.normalizeOverlayPosition(position);
            const target = normalized || this.getDefaultOverlayPosition(panel);
            const clamped = this.clampOverlayPosition(target, panel);
            panel.style.left = `${clamped.left}px`;
            panel.style.top = `${clamped.top}px`;
            this.CONFIG.OVERLAY_POSITION = normalized ? clamped : null;
        },

        setOverlayPosition(position, options = {}) {
            const normalized = this.normalizeOverlayPosition(position);
            this.CONFIG.OVERLAY_POSITION = normalized;
            this.applyOverlayPanelPosition(normalized);
            if (options.persist === true) {
                persistProfileSetting(this.settingsProfile || getCurrentProfile(), 'overlayPosition', normalized);
            }
            if (!options.silent) {
                this.showNotification(normalized ? 'Overlay position saved' : 'Overlay position reset');
            }
        },

        toggleWordHighlight() {
            this.setWordHighlightEnabled(!this.CONFIG.WORD_HIGHLIGHT_ENABLED);
        },

        findWordIndexByChar(charIndex) {
            const spans = this.processedParagraph.wordSpans;
            const offsets = this.processedParagraph.wordOffsets;
            if (!spans || !offsets || offsets.length === 0) return -1;

            let low = 0;
            let high = offsets.length - 1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (offsets[mid] <= charIndex) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            const idx = high;
            if (idx < 0) return -1;
            const start = offsets[idx];
            const end = start + spans[idx].textContent.length;
            if (charIndex < start || charIndex > end) return -1;
            return idx;
        },

        highlightCurrentWord(event) {
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED || !this.wordHighlightActiveForCurrent) return;
            if (event.name !== 'word') return;
            if (this.currentWordSpan) {
                this.currentWordSpan.classList.remove('tts-current-word');
                this.currentWordSpan = null;
            }

            const baseOffset = Number.isFinite(this.currentUtteranceStartOffset) ? this.currentUtteranceStartOffset : 0;
            const idx = this.findWordIndexByChar((event.charIndex || 0) + baseOffset);
            if (idx === -1) return;
            const span = this.processedParagraph.wordSpans[idx];
            if (!span) return;
            span.classList.add('tts-current-word');
            this.currentWordSpan = span;
        },

        clearServerWordHighlightTimers() {
            if (!Array.isArray(this.serverWordHighlightTimers) || this.serverWordHighlightTimers.length === 0) return;
            while (this.serverWordHighlightTimers.length > 0) {
                const timerId = this.serverWordHighlightTimers.pop();
                clearTimeout(timerId);
            }
        },

        highlightWordByCharIndex(charIndex) {
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED || !this.wordHighlightActiveForCurrent) return;
            if (this.currentWordSpan) {
                this.currentWordSpan.classList.remove('tts-current-word');
                this.currentWordSpan = null;
            }
            const idx = this.findWordIndexByChar(charIndex);
            if (idx === -1) return;
            const span = this.processedParagraph.wordSpans[idx];
            if (!span) return;
            span.classList.add('tts-current-word');
            this.currentWordSpan = span;
        },

        scheduleServerWordHighlights(sentenceText, sentenceStartOffset, durationMs, offsetMs = 0) {
            this.clearServerWordHighlightTimers();
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED || !this.wordHighlightActiveForCurrent) return;
            if (!this.processedParagraph || !Array.isArray(this.processedParagraph.wordSpans) || this.processedParagraph.wordSpans.length === 0) return;
            const text = typeof sentenceText === 'string' ? sentenceText : '';
            if (!text.trim()) return;

            const words = [];
            const regex = /\S+/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                words.push({ charOffset: match.index });
            }
            if (words.length === 0) return;

            const measuredMs = Number(durationMs);
            const fallbackMs = Math.max(250, words.length * 180);
            const totalMs = Number.isFinite(measuredMs) && measuredMs > 0 ? measuredMs : fallbackMs;
            const totalChars = Math.max(1, text.length);
            const baseOffset = Number.isFinite(Number(sentenceStartOffset)) ? Math.max(0, Math.floor(Number(sentenceStartOffset))) : 0;
            const sessionId = this.playbackSessionId;
            const startDelay = Number.isFinite(Number(offsetMs)) ? Math.max(0, Math.floor(Number(offsetMs))) : 0;

            for (const word of words) {
                const ratio = Math.max(0, Math.min(1, word.charOffset / totalChars));
                const delay = startDelay + Math.max(0, Math.floor(totalMs * ratio));
                const globalCharIndex = baseOffset + word.charOffset;
                const timerId = setTimeout(() => {
                    if (sessionId !== this.playbackSessionId) return;
                    if (!this.continuousReadingActive || this.isPaused) return;
                    this.highlightWordByCharIndex(globalCharIndex);
                }, delay);
                this.serverWordHighlightTimers.push(timerId);
            }
        },

        describeSpeechErrorEvent(event) {
            if (!event) return {};
            return {
                type: event.type || null,
                error: event.error || null,
                name: event.name || null,
                charIndex: Number.isFinite(event.charIndex) ? event.charIndex : null,
                elapsedTime: Number.isFinite(event.elapsedTime) ? event.elapsedTime : null,
                utteranceTextLength: event.utterance && event.utterance.text ? event.utterance.text.length : null
            };
        },

        logSpeechSynthesisError(context, event, extra = {}) {
            if (!this.CONFIG.SHOW_DIAGNOSTICS_PANEL) return;
            const synth = this.speechSynthesis;
            const eventInfo = this.describeSpeechErrorEvent(event);
            const paragraph = Number.isInteger(extra.index) ? this.paragraphsList[extra.index] : null;
            const paragraphText = paragraph && paragraph.text ? paragraph.text : '';
            const payload = {
                context,
                url: window.location && window.location.href ? window.location.href : '',
                event: eventInfo,
                synthState: {
                    speaking: Boolean(synth && synth.speaking),
                    pending: Boolean(synth && synth.pending),
                    paused: Boolean(synth && synth.paused)
                },
                ttsState: {
                    ttsActive: this.ttsActive,
                    continuousReadingActive: this.continuousReadingActive,
                    isPaused: this.isPaused,
                    currentParagraphIndex: this.currentParagraphIndex,
                    queueSize: this.queuedParagraphs.size,
                    paragraphsCount: this.paragraphsList.length
                },
                guardState: {
                    visibility: document.visibilityState,
                    lockOwned: this.playbackLockOwned,
                    ownerId: this.playbackOwnerId,
                    pausedForHiddenTab: this.pausedForHiddenTab,
                    hiddenTabPolicy: this.CONFIG.HIDDEN_TAB_POLICY,
                    hiddenPauseDelayMs: this.CONFIG.AUTO_PAUSE_HIDDEN_DELAY_MS,
                    retryCountForIndex: Number.isInteger(extra.index)
                        ? Number(this.interruptedRetryAttempts.get(extra.index) || 0)
                        : 0
                },
                utterance: {
                    index: Number.isInteger(extra.index) ? extra.index : null,
                    voiceName: extra.voiceName || null,
                    voiceLang: extra.voiceLang || null,
                    rate: Number.isFinite(extra.rate) ? extra.rate : null,
                    textLength: typeof extra.text === 'string' ? extra.text.length : null,
                    textSample: typeof extra.text === 'string' ? extra.text.slice(0, 160) : null
                },
                paragraph: paragraph ? {
                    textLength: paragraphText.length,
                    textSample: paragraphText.slice(0, 160)
                } : null
            };

            const nonFatal = eventInfo.error === 'interrupted' || eventInfo.error === 'canceled';
            if (nonFatal) {
                console.warn('[TTS] Speech synthesis interruption', payload);
            } else {
                console.error('[TTS] Speech synthesis error', payload);
            }

            try {
                const jsonPayload = JSON.stringify(payload, null, 2);
                console.log(`[TTS] Speech synthesis diagnostics JSON (${context})\n${jsonPayload}`);
            } catch (_error) {
                console.warn('[TTS] Failed to serialize diagnostics payload');
            }
        },

        triggerTTS(text, options = {}) {
            const normalizedOptions = typeof options === 'function' ? { onComplete: options } : (options || {});
            const { onComplete = null, speakerEmoji = '' } = normalizedOptions;
            if (!text || text.length === 0) {
                if (onComplete) onComplete();
                return;
            }
            this.requestPlaybackLock('start-noncontinuous', (granted) => {
                if (!granted) return;

                const forceBrowserVoiceRouting = this.hasEmojiVoiceRule(speakerEmoji);
                if (this.isServerVoiceSelected() && !forceBrowserVoiceRouting) {
                    this.playServerSingleUtterance(text, onComplete);
                    return;
                }

                this.ttsActive = true;
                this.isPaused = false;
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.__tmxSessionId = this.playbackSessionId;
                const preferredVoice = this.resolvePreferredVoice(speakerEmoji, { forceBrowser: forceBrowserVoiceRouting });
                if (preferredVoice) utterance.voice = preferredVoice;
                utterance.rate = this.getSafeSpeechRate(preferredVoice);
                utterance.volume = this.getSpeechVolume();

                if (this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                    utterance.onboundary = (event) => {
                        if (this.isStaleUtterance(utterance)) return;
                        this.highlightCurrentWord(event);
                    };
                }

                utterance.onend = () => {
                    if (this.isStaleUtterance(utterance)) {
                        this.logPlaybackGuardEvent('stale-utterance-ignored', { phase: 'triggerTTS.onend' });
                        return;
                    }
                    this.ttsActive = false;
                    if (onComplete && this.continuousReadingActive) {
                        onComplete();
                    } else {
                        this.stopTTS(false);
                    }
                };
                utterance.onerror = (e) => {
                    if (this.isStaleUtterance(utterance)) {
                        this.logPlaybackGuardEvent('stale-utterance-ignored', { phase: 'triggerTTS.onerror' });
                        return;
                    }
                    this.logSpeechSynthesisError('triggerTTS', e, {
                        text,
                        rate: utterance.rate,
                        voiceName: utterance.voice ? utterance.voice.name : null,
                        voiceLang: utterance.voice ? utterance.voice.lang : null
                    });
                    this.ttsActive = false;
                    this.revertParagraph();
                    if (onComplete && this.continuousReadingActive) onComplete();
                };

                this.speechSynthesis.speak(utterance);
            });
        },

        cancelActiveSpeechQueue(reason = 'queue-reset') {
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.logPlaybackGuardEvent('speech-queue-cancel', {
                    reason,
                    speaking: Boolean(this.speechSynthesis.speaking),
                    pending: Boolean(this.speechSynthesis.pending),
                    queuedParagraphs: this.queuedParagraphs.size
                });
                this.speechSynthesis.cancel();
            }
        },

        splitSpeechChunk(text, startOffset = 0) {
            const source = typeof text === 'string' ? text.trim() : '';
            if (!source) {
                return { chunkText: '', remainderText: '', nextStartOffset: startOffset };
            }

            const maxChars = this.getSpeechChunkMaxChars();
            if (source.length <= maxChars) {
                return {
                    chunkText: source,
                    remainderText: '',
                    nextStartOffset: startOffset + source.length + 1
                };
            }

            let splitAt = source.lastIndexOf(' ', maxChars);
            if (splitAt < Math.floor(maxChars * 0.6)) {
                splitAt = maxChars;
            }

            const chunkText = source.slice(0, splitAt).trim();
            const remainderText = source.slice(splitAt).trim();
            return {
                chunkText,
                remainderText,
                nextStartOffset: startOffset + chunkText.length + 1
            };
        },

        splitTextIntoSentences(text) {
            const source = typeof text === 'string' ? text : '';
            if (!source.trim()) return [];
            const regex = /[^.!?]+[.!?]*/g;
            const result = [];
            let match;
            while ((match = regex.exec(source)) !== null) {
                const original = match[0];
                const trimmed = original.trim();
                if (!trimmed) continue;
                const leadingWs = original.length - original.trimStart().length;
                const startOffset = match.index + leadingWs;
                result.push({
                    text: trimmed,
                    startOffset
                });
            }
            if (result.length === 0) {
                result.push({
                    text: source.trim(),
                    startOffset: 0
                });
            }
            return result;
        },

        countWords(text) {
            const source = typeof text === 'string' ? text : '';
            const words = source.match(/\S+/g);
            return words ? words.length : 0;
        },

        generateServerRequestId(state, sentenceIndex) {
            const paragraphIndex = state && Number.isFinite(Number(state.paragraphIndex))
                ? Number(state.paragraphIndex)
                : -1;
            const sessionId = state && Number.isFinite(Number(state.playbackSessionId))
                ? Number(state.playbackSessionId)
                : this.playbackSessionId;
            const randomPart = Math.random().toString(36).slice(2, 8);
            return `srv-${sessionId}-${paragraphIndex}-${sentenceIndex}-${Date.now()}-${randomPart}`;
        },

        getSafeServerSpeed() {
            const configured = Number(this.CONFIG.SPEECH_RATE);
            const min = Math.max(0.1, Number(this.CONFIG.SERVER_TTS_MIN_SPEED) || 0.5);
            const max = Math.max(min, Number(this.CONFIG.SERVER_TTS_MAX_SPEED) || 2.0);
            if (!Number.isFinite(configured)) return 1.0;
            return Math.max(min, Math.min(max, configured));
        },

        normalizeServerQuotePolicy(policy) {
            const next = typeof policy === 'string' ? policy.trim().toLowerCase() : '';
            if (next === 'keep' || next === 'normalize' || next === 'strip') return next;
            return 'strip';
        },

        normalizeServerCustomRemovalMode(mode) {
            const next = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
            if (next === 'exact' || next === 'regex' || next === 'both') return next;
            return 'exact';
        },

        parseServerRemovalLines(rawValue) {
            if (typeof rawValue !== 'string') return [];
            return rawValue
                .split(/\r?\n/g)
                .map(line => line.trim())
                .filter(line => line.length > 0);
        },

        escapeRegExp(text) {
            return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        applyServerExactCustomRemovals(text) {
            const rules = this.parseServerRemovalLines(this.CONFIG.SERVER_CUSTOM_EXACT_REMOVALS);
            if (rules.length === 0 && this.CONFIG.TEXT_PREPROCESS_CHARS) {
                const legacyRules = this.CONFIG.TEXT_PREPROCESS_CHARS
                    .split(/\r?\n/g)
                    .join('')
                    .split('')
                    .map(char => char.trim())
                    .filter(Boolean);
                rules.push(...legacyRules);
            }
            if (rules.length === 0) return text;

            let output = text;
            for (const rawRule of rules) {
                const escaped = this.escapeRegExp(rawRule).replace(/\s+/g, '\\s+');
                const isWordLike = /^[A-Za-z0-9][A-Za-z0-9\s'-]*[A-Za-z0-9]$/.test(rawRule);
                const pattern = isWordLike
                    ? new RegExp(`\\b${escaped}\\b`, 'gi')
                    : new RegExp(escaped, 'gi');
                output = output.replace(pattern, ' ');
            }
            return output;
        },

        parseServerRegexRule(rawRule) {
            if (typeof rawRule !== 'string') return null;
            const trimmed = rawRule.trim();
            if (!trimmed) return null;

            let source = trimmed;
            let flags = 'gi';
            const slashMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/i);
            if (slashMatch) {
                source = slashMatch[1];
                flags = slashMatch[2] || '';
                if (!flags.includes('g')) flags += 'g';
            }

            try {
                return new RegExp(source, flags);
            } catch (error) {
                this.logPlaybackGuardEvent('server-normalize-invalid-regex', {
                    rule: rawRule,
                    error: String(error && error.message ? error.message : error)
                });
                return null;
            }
        },

        applyServerRegexCustomRemovals(text) {
            const rules = this.parseServerRemovalLines(this.CONFIG.SERVER_CUSTOM_REGEX_REMOVALS);
            if (rules.length === 0) return text;

            let output = text;
            for (const rawRule of rules) {
                const regex = this.parseServerRegexRule(rawRule);
                if (!regex) continue;
                output = output.replace(regex, ' ');
            }
            return output;
        },

        normalizeTextForServerTts(text, context = {}) {
            const source = typeof text === 'string' ? text : '';
            if (!source) return '';
            if (!this.CONFIG.SERVER_TEXT_NORMALIZATION_ENABLED) {
                return source.trim();
            }

            let normalized = source
                .replace(/\r\n/g, '\n')
                .replace(/\u00A0/g, ' ');

            if (this.CONFIG.SERVER_NORMALIZE_PUNCTUATION) {
                normalized = normalized
                    .replace(/[‐‑‒–—]/g, ' - ')
                    .replace(/…/g, '...')
                    .replace(/[•▪◦‣∙]/g, ' ');
            }

            const quotePolicy = this.normalizeServerQuotePolicy(this.CONFIG.SERVER_QUOTE_POLICY);
            if (quotePolicy === 'normalize') {
                normalized = normalized
                    .replace(/[“”„‟«»‹›]/g, '"')
                    .replace(/[‘’‚‛`´]/g, '\'');
            } else if (quotePolicy === 'strip') {
                normalized = normalized
                    .replace(/[“”„‟«»‹›"]/g, ' ')
                    .replace(/[‘’‚‛`´]/g, '\'');
            }

            if (this.CONFIG.SERVER_REMOVE_MARKDOWN_MARKERS) {
                normalized = normalized
                    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1')
                    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
                    .replace(/[*_~]+/g, ' ');
            }

            if (this.CONFIG.SERVER_REMOVE_CITATION_MARKERS) {
                normalized = normalized
                    .replace(/\[\s*\d+(?:\s*[,;]\s*\d+)*\s*\]/g, ' ')
                    .replace(/\(\s*(?:source|sources|ref|refs|reference|references)?\s*\d+(?:\s*[,;]\s*\d+)*\s*\)/gi, ' ')
                    .replace(/\+\d+\b/g, ' ');
            }

            const removalMode = this.normalizeServerCustomRemovalMode(this.CONFIG.SERVER_CUSTOM_REMOVAL_MODE);
            if (removalMode === 'exact' || removalMode === 'both') {
                normalized = this.applyServerExactCustomRemovals(normalized);
            }
            if (removalMode === 'regex' || removalMode === 'both') {
                normalized = this.applyServerRegexCustomRemovals(normalized);
            }

            normalized = normalized.replace(/\s+([,.;:!?])/g, '$1');
            if (this.CONFIG.SERVER_NORMALIZE_WHITESPACE) {
                normalized = normalized.replace(/\s+/g, ' ');
            }
            normalized = normalized.trim();

            if (normalized !== source && this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                this.logPlaybackGuardEvent('server-text-normalized', {
                    stage: context.stage || null,
                    paragraphIndex: Number.isInteger(context.paragraphIndex) ? context.paragraphIndex : null,
                    sentenceIndex: Number.isInteger(context.sentenceIndex) ? context.sentenceIndex : null,
                    originalLength: source.length,
                    normalizedLength: normalized.length,
                    originalSample: source.slice(0, 120),
                    normalizedSample: normalized.slice(0, 120)
                });
            }

            return normalized;
        },

        buildServerSentencePlan(paragraphText, startOffset = 0, context = {}) {
            const safeStart = Math.max(0, Math.floor(Number(startOffset) || 0));
            const source = typeof paragraphText === 'string' ? paragraphText : '';
            const sliced = source.slice(safeStart);
            const sentences = this.splitTextIntoSentences(sliced);
            const plan = [];
            for (const sentence of sentences) {
                const normalizedSentence = this.normalizeTextForServerTts(sentence.text, {
                    stage: 'sentence-plan',
                    paragraphIndex: Number.isInteger(context.paragraphIndex) ? context.paragraphIndex : null
                });
                if (!normalizedSentence) continue;
                plan.push({
                    text: sentence.text,
                    serverText: normalizedSentence,
                    startOffset: safeStart + sentence.startOffset,
                    wordCount: this.countWords(sentence.text)
                });
            }
            return plan;
        },

        getServerSentenceCacheKey(state, sentenceIndex) {
            return `${state.playbackSessionId}:${state.paragraphIndex}:${sentenceIndex}`;
        },

        cleanupPreparedServerAudioElements() {
            if (!this.serverPreparedAudioElements || this.serverPreparedAudioElements.size === 0) return;
            this.serverPreparedAudioElements.clear();
        },

        _evictCacheForSession(sessionId) {
            for (const [key, payload] of this.serverSentenceAudioCache.entries()) {
                // Key format: `${sessionId}:${paragraphIndex}:${sentenceIndex}` 
                if (key.startsWith(`${sessionId}:`)) {
                    if (payload && payload.wavUrl) {
                        URL.revokeObjectURL(payload.wavUrl);
                    }
                    this.serverSentenceAudioCache.delete(key);
                }
            }
            this.serverSentenceAudioInflight.clear();
        },

        clearServerSentenceCache() {
            // Only revoke URLs, don't wipe entries for the NEXT paragraph
            // that were prefetched under a valid future session.
            // Full wipe only happens on stopTTS via _evictCacheForSession.
            for (const [key, payload] of this.serverSentenceAudioCache.entries()) {
                if (payload && payload.wavUrl) {
                    URL.revokeObjectURL(payload.wavUrl);
                }
            }
            this.serverSentenceAudioCache.clear();
            this.serverSentenceAudioInflight.clear();
        },

        stopServerAudioPlayback() {
            this.clearServerWordHighlightTimers();
            this.logPlaybackGuardEvent('server-audio-stop', {
                hasContext: Boolean(this.serverAudioContext),
                hasSource: Boolean(this.serverCurrentSource)
            });
            this.stopCurrentServerSource();
            this.cancelScheduledNext();  // Cancel any look-ahead scheduled source
            if (!this.serverAudioContext) return;
            try {
                this.serverAudioContext.close();
            } catch (_error) {
                // Ignore cleanup errors when the context is already closed.
            }
            this.serverAudioContext = null;
            this.serverAudioGainNode = null;
        },

        base64ToUint8Array(base64) {
            const binary = atob(base64 || '');
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        },

        createServerAudioBufferFromPcm(pcmBytes, sampleRate) {
            const context = this.ensureServerAudioGraph();
            if (!context || !pcmBytes || pcmBytes.length === 0) return null;
            const safeSampleRate = Number.isFinite(Number(sampleRate))
                ? Math.max(8000, Math.round(Number(sampleRate)))
                : this.CONFIG.SERVER_TTS_SAMPLE_RATE;
            const sampleCount = Math.floor(pcmBytes.length / 2);
            const audioBuffer = context.createBuffer(1, sampleCount, safeSampleRate);
            const channel = audioBuffer.getChannelData(0);
            const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
            for (let i = 0; i < sampleCount; i++) {
                channel[i] = view.getInt16(i * 2, true) / 32768;
            }
            return audioBuffer;
        },

        async fetchServerSentenceAudio(state, sentenceIndex, requestId = '') {
            const sentence = state.sentences[sentenceIndex];
            if (!sentence || !sentence.text) {
                throw new Error('Missing sentence');
            }
            const textForServer = typeof sentence.serverText === 'string' && sentence.serverText.trim()
                ? sentence.serverText
                : sentence.text;
            if (!textForServer) {
                throw new Error('Missing server sentence text');
            }
            const selectedVoiceId = this.getSelectedServerVoiceId();
            if (!selectedVoiceId) {
                throw new Error('No server voice selected');
            }

            const safeSpeed = this.getSafeServerSpeed();
            const normalizedRequestId = (typeof requestId === 'string' && requestId.trim())
                ? requestId.trim()
                : this.generateServerRequestId(state, sentenceIndex);
            const response = await this.sendRuntimeMessageAsync({
                action: 'synthesizeServerTts',
                baseUrl: this.normalizeServerBaseUrl(this.CONFIG.SERVER_BASE_URL),
                text: textForServer,
                voiceId: selectedVoiceId,
                speed: safeSpeed,
                requestId: normalizedRequestId,
                debug: this.CONFIG.SHOW_DIAGNOSTICS_PANEL
            });
            const key = this.getServerSentenceCacheKey(state, sentenceIndex);
            const activeRequestId = this.serverSentenceRequestIds.get(key);
            if (activeRequestId && activeRequestId !== normalizedRequestId) {
                throw new Error('Stale server request');
            }
            if (!response || response.ok !== true || typeof response.pcmBase64 !== 'string') {
                const error = response && response.error ? response.error : 'Server synthesis failed';
                throw new Error(error);
            }

            if (response && response.timing) {
                this.logPlaybackGuardEvent('server-sentence-timing', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex,
                    requestId: normalizedRequestId,
                    timing: response.timing
                });
            }

            const pcmBytes = this.base64ToUint8Array(response.pcmBase64);
            if (state.playbackSessionId !== this.playbackSessionId) {
                throw new Error('Stale server audio');
            }
            const audioBuffer = this.createServerAudioBufferFromPcm(pcmBytes, response.sampleRate);
            if (!audioBuffer) {
                throw new Error('Failed to create server audio buffer');
            }
            return {
                audioBuffer,
                sampleRate: response.sampleRate,
                audioLength: response.audioLength
            };
        },

        async getOrFetchServerSentenceAudio(state, sentenceIndex) {
            const key = this.getServerSentenceCacheKey(state, sentenceIndex);
            if (this.serverSentenceAudioCache.has(key)) {
                this.logPlaybackGuardEvent('server-cache-hit', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex,
                    cacheSize: this.serverSentenceAudioCache.size
                });
                return this.serverSentenceAudioCache.get(key);
            }
            if (this.serverSentenceAudioInflight.has(key)) {
                this.logPlaybackGuardEvent('server-inflight-hit', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex,
                    inflightSize: this.serverSentenceAudioInflight.size
                });
                return this.serverSentenceAudioInflight.get(key);
            }
            const requestId = this.generateServerRequestId(state, sentenceIndex);
            this.serverSentenceRequestIds.set(key, requestId);
            const startedAt = performance.now();
            this.logPlaybackGuardEvent('server-fetch-start', {
                paragraphIndex: state.paragraphIndex,
                sentenceIndex,
                requestId,
                inflightSize: this.serverSentenceAudioInflight.size + 1
            });
            const fetchPromise = this.fetchServerSentenceAudio(state, sentenceIndex, requestId)
                .then((payload) => {
                    this.serverSentenceAudioInflight.delete(key);
                    this.serverSentenceRequestIds.delete(key);
                    this.serverSentenceAudioCache.set(key, payload);
                    this.logPlaybackGuardEvent('server-fetch-complete', {
                        paragraphIndex: state.paragraphIndex,
                        sentenceIndex,
                        requestId,
                        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
                        cacheSize: this.serverSentenceAudioCache.size
                    });
                    return payload;
                })
                .catch((error) => {
                    this.serverSentenceAudioInflight.delete(key);
                    this.serverSentenceRequestIds.delete(key);
                    this.logPlaybackGuardEvent('server-fetch-failed', {
                        paragraphIndex: state.paragraphIndex,
                        sentenceIndex,
                        requestId,
                        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
                        error: String(error && error.message ? error.message : error)
                    });
                    throw error;
                });
            this.serverSentenceAudioInflight.set(key, fetchPromise);
            return fetchPromise;
        },

        createPreparedServerAudioElement(payload) {
            return {
                audioBuffer: payload.audioBuffer,
                payload
            };
        },

        async getOrPrepareServerSentenceAudioElement(state, sentenceIndex) {
            const key = this.getServerSentenceCacheKey(state, sentenceIndex);
            if (this.serverPreparedAudioElements.has(key)) {
                this.logPlaybackGuardEvent('server-prepared-hit', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex,
                    preparedSize: this.serverPreparedAudioElements.size
                });
                return this.serverPreparedAudioElements.get(key);
            }
            const prepareStartedAt = performance.now();
            const payload = await this.getOrFetchServerSentenceAudio(state, sentenceIndex);
            if (state.playbackSessionId !== this.playbackSessionId) {
                throw new Error('Stale server prepared audio');
            }
            const prepared = this.createPreparedServerAudioElement(payload);
            this.serverPreparedAudioElements.set(key, prepared);
            this.logPlaybackGuardEvent('server-prepared-store', {
                paragraphIndex: state.paragraphIndex,
                sentenceIndex,
                preparedSize: this.serverPreparedAudioElements.size,
                elapsedMs: Math.max(0, Math.round(performance.now() - prepareStartedAt))
            });
            return prepared;
        },

        primeNextServerSentence(state, currentSentenceIndex) {
            if (!this.CONFIG.SERVER_PRECACHE_MODE) return;
            if (!state || state.playbackSessionId !== this.playbackSessionId) return;
            const wordBudget = this.getServerPrecacheWordBudget();
            const maxSentences = this.getServerPrecacheMaxSentences();

            let plannedWords = 0;
            let plannedSentences = 0;
            this.logPlaybackGuardEvent('server-precache-prime-start', {
                paragraphIndex: state.paragraphIndex,
                currentSentenceIndex,
                wordBudget,
                maxSentences
            });
            for (let nextIndex = currentSentenceIndex + 1; nextIndex < state.sentences.length; nextIndex++) {
                const sentence = state.sentences[nextIndex];
                if (!sentence || !sentence.text) continue;

                const sentenceWords = Math.max(1, Number(sentence.wordCount) || this.countWords(sentence.text));
                plannedWords += sentenceWords;
                plannedSentences += 1;

                this.getOrPrepareServerSentenceAudioElement(state, nextIndex).catch((error) => {
                    this.logPlaybackGuardEvent('server-precache-failed', {
                        paragraphIndex: state.paragraphIndex,
                        sentenceIndex: nextIndex,
                        error: String(error && error.message ? error.message : error)
                    });
                });

                if (plannedWords >= wordBudget || plannedSentences >= maxSentences) {
                    break;
                }
            }
            this.logPlaybackGuardEvent('server-precache-prime-finish', {
                paragraphIndex: state.paragraphIndex,
                currentSentenceIndex,
                plannedWords,
                plannedSentences
            });
        },

        async waitForNextServerSentenceReady(state, currentSentenceIndex) {
            if (!this.CONFIG.SERVER_PRECACHE_MODE) return;
            const nextIndex = currentSentenceIndex + 1;
            if (!state || nextIndex >= state.sentences.length) return;
            const waitMs = this.getServerHandoffWaitMs();
            if (waitMs <= 0) return;
            const startedAt = performance.now();
            try {
                const nextReadyPromise = this.getOrPrepareServerSentenceAudioElement(state, nextIndex);
                let resolvedBy = 'timeout';
                await Promise.race([
                    nextReadyPromise.then(() => {
                        resolvedBy = 'ready';
                    }),
                    new Promise((resolve) => setTimeout(resolve, waitMs))
                ]);
                this.logPlaybackGuardEvent('server-next-wait-finish', {
                    paragraphIndex: state.paragraphIndex,
                    currentSentenceIndex,
                    nextIndex,
                    waitMs,
                    resolvedBy,
                    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt))
                });
            } catch (error) {
                this.logPlaybackGuardEvent('server-next-wait-error', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex: nextIndex,
                    error: String(error && error.message ? error.message : error)
                });
            }
        },

        async playServerSentence(state, sentenceIndex) {
            if (!this.continuousReadingActive) return;
            if (state.playbackSessionId !== this.playbackSessionId) return;
            if (sentenceIndex >= state.sentences.length) {
                this.onServerParagraphComplete(state);
                return;
            }

            state.sentenceIndex = sentenceIndex;
            const sentence = state.sentences[sentenceIndex];
            this.currentUtteranceStartOffset = sentence.startOffset;
            this.ttsActive = true;
            this.isPaused = false;
            this.pausedForHiddenTab = false;

            const startTime = performance.now();
            this.lastGapMs = this.lastUtteranceEndTime ? startTime - this.lastUtteranceEndTime : null;
            this.updateDiagnosticsPanel();
            this.logPlaybackGuardEvent('server-sentence-play-start', {
                paragraphIndex: state.paragraphIndex,
                sentenceIndex,
                gapMs: this.lastGapMs
            });

            let prepared;
            // Queue current sentence first, then enqueue lookahead.
            // This keeps FIFO server queues in correct playback order.
            const currentSentencePromise = this.getOrPrepareServerSentenceAudioElement(state, sentenceIndex);
            this.primeNextServerSentence(state, sentenceIndex);
            try {
                prepared = await currentSentencePromise;
            } catch (error) {
                this.logPlaybackGuardEvent('server-sentence-fetch-error', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex,
                    error: String(error && error.message ? error.message : error)
                });
                this.ttsActive = false;
                this.currentUtteranceStartOffset = 0;
                this.lastUtteranceEndTime = performance.now();
                this.playServerSentence(state, sentenceIndex + 1);
                return;
            }

            // Refresh the precache window once the current sentence payload is ready.
            this.primeNextServerSentence(state, sentenceIndex);
            if (sentenceIndex === 0) {
                await this.waitForNextServerSentenceReady(state, sentenceIndex);
            }

            if (state.playbackSessionId !== this.playbackSessionId || !this.continuousReadingActive) return;

            const sentenceKey = this.getServerSentenceCacheKey(state, sentenceIndex);
            this.serverPreparedAudioElements.delete(sentenceKey);
            this.stopCurrentServerSource();
            this.cancelScheduledNext();  // Cancel any previously scheduled next sentence
            const payload = prepared && prepared.payload ? prepared.payload : null;
            const audioBuffer = prepared && prepared.audioBuffer
                ? prepared.audioBuffer
                : payload && payload.audioBuffer
                    ? payload.audioBuffer
                    : null;
            
            const readyAt = performance.now();
            const fetchLatencyMs = Math.max(0, Math.round(readyAt - startTime));
            if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                console.debug('[TTS][Timing] Sentence ready to play', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex,
                    fetchLatencyMs,
                    // If fetchLatencyMs is near 0, data was cached (prefetch worked)
                    servedFromCache: fetchLatencyMs < 20,
                    sessionId: state.playbackSessionId
                });
            }
            
            // PATCH: prefetch next sentences immediately when payload arrives,
            // don't wait for audio processing - this eliminates decode latency delays
            const next1 = sentenceIndex + 1;
            const next2 = sentenceIndex + 2;
            if (next1 < state.sentences.length) {
                this.getOrFetchServerSentenceAudio(state, next1).catch(() => {});
            }
            if (next2 < state.sentences.length) {
                this.getOrFetchServerSentenceAudio(state, next2).catch(() => {});
            }
            
            if (!payload || !audioBuffer) {
                this.logPlaybackGuardEvent('server-sentence-payload-missing', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex
                });
                this.ttsActive = false;
                this.currentUtteranceStartOffset = 0;
                this.lastUtteranceEndTime = performance.now();
                this.playServerSentence(state, sentenceIndex + 1);
                return;
            }

            const context = this.ensureServerAudioGraph();
            if (!context || !this.serverAudioGainNode) {
                this.logPlaybackGuardEvent('server-audio-context-missing', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex
                });
                this.ttsActive = false;
                this.currentUtteranceStartOffset = 0;
                this.lastUtteranceEndTime = performance.now();
                this.playServerSentence(state, sentenceIndex + 1);
                return;
            }

            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.serverAudioGainNode);
            this.serverCurrentSource = source;

            const sampleRate = Number(payload && payload.sampleRate);
            const audioLength = Number(payload && payload.audioLength);
            const durationMs = (Number.isFinite(sampleRate) && sampleRate > 0 && Number.isFinite(audioLength) && audioLength > 0)
                ? (audioLength / (sampleRate * 2)) * 1000
                : (Number.isFinite(audioBuffer.duration) ? audioBuffer.duration * 1000 : 0);
            this.scheduleServerWordHighlights(sentence.text, sentence.startOffset, durationMs);

            source.onended = () => {
                // Look-ahead scheduling: onended is now just for cleanup
                // The next sentence is already scheduled via scheduleNextSentence
                if (state.playbackSessionId !== this.playbackSessionId) return;
                if (this.serverCurrentSource === source) {
                    this.serverCurrentSource = null;
                }
                this.logPlaybackGuardEvent('server-sentence-source-ended', {
                    paragraphIndex: state.paragraphIndex,
                    sentenceIndex
                });
                this.ttsActive = false;
                this.currentUtteranceStartOffset = 0;
                this.lastUtteranceEndTime = performance.now();
                // Note: next sentence is already scheduled, no need to call playServerSentence here
                // If scheduledNextSource is null (last sentence), handle paragraph completion
                if (!this.scheduledNextSource) {
                    // Check if there are more sentences - if not, paragraph is complete
                    if (sentenceIndex + 1 >= state.sentences.length) {
                        this.onServerParagraphComplete(state);
                    } else {
                        // Fallback: schedule didn't work, try reactive approach
                        this.playServerSentence(state, sentenceIndex + 1);
                    }
                }
            };

            this.resumeServerAudioPlayback()
                .then(() => {
                    if (state.playbackSessionId !== this.playbackSessionId || !this.continuousReadingActive) {
                        this.stopCurrentServerSource();
                        this.cancelScheduledNext();  // Cancel any scheduled next sentence
                        return;
                    }
                    const handoffMs = Math.max(0, Math.round(performance.now() - startTime));
                    this.logPlaybackGuardEvent('server-sentence-source-start', {
                        paragraphIndex: state.paragraphIndex,
                        sentenceIndex,
                        handoffMs
                    });
                    
                    // Look-ahead scheduling: track when playback starts
                    this.serverPlaybackStartTime = this.serverAudioContext.currentTime;

                    // PROACTIVE FETCHING: Start audio immediately
                    // FIX: source.start() returns void, NOT a Promise.
                    // Do NOT chain .then()/.catch() on it.
                    // Gap measurement goes here, before start():
                    if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                        const playStartedAt = performance.now();
                        const gapMs = this.lastUtteranceEndTime
                            ? Math.max(0, Math.round(playStartedAt - this.lastUtteranceEndTime))
                            : null;
                        console.debug('[TTS][Gap] Sentence gap measured', {
                            paragraphIndex: state.paragraphIndex,
                            sentenceIndex,
                            gapMs,
                            audible: gapMs !== null && gapMs > 200,
                            servedFromCache: fetchLatencyMs < 20
                        });
                    }

                    try {
                        source.start(0);

                        // Look-ahead scheduling: schedule next sentence during playback
                        const nextIndex = sentenceIndex + 1;
                        if (nextIndex < state.sentences.length) {
                            this.scheduleNextSentence(state, nextIndex, audioBuffer.duration);
                        }
                    } catch (startError) {
                        // source may have already been stopped (stale session race)
                        if (state.playbackSessionId !== this.playbackSessionId) return;
                        this.logPlaybackGuardEvent('server-audio-start-error', {
                            paragraphIndex: state.paragraphIndex,
                            sentenceIndex,
                            error: String(startError && startError.message ? startError.message : startError)
                        });
                        if (this.serverCurrentSource === source) {
                            this.serverCurrentSource = null;
                        }
                        this.ttsActive = false;
                        this.currentUtteranceStartOffset = 0;
                        this.lastUtteranceEndTime = performance.now();
                        this.playServerSentence(state, sentenceIndex + 1);
                    }
                })
                .catch((resumeError) => {
                    if (state.playbackSessionId !== this.playbackSessionId) return;
                    this.logPlaybackGuardEvent('server-audio-resume-error', {
                        paragraphIndex: state.paragraphIndex,
                        sentenceIndex,
                        error: String(resumeError && resumeError.message ? resumeError.message : resumeError)
                    });
                    if (this.serverCurrentSource === source) {
                        this.serverCurrentSource = null;
                    }
                    this.ttsActive = false;
                    this.currentUtteranceStartOffset = 0;
                    this.lastUtteranceEndTime = performance.now();
                    this.playServerSentence(state, sentenceIndex + 1);
                });
        },

        startServerPlaybackFromParagraph(index, options = {}) {
            if (!this.continuousReadingActive) return;

            this.stopServerAudioPlayback();
            // REMOVED: this.clearServerSentenceCache() — Fix 1
            this.cancelActiveSpeechQueue('server-voice-start');
            this.queuedParagraphs.clear();
            this.queuedStartOffsets.clear();
            this.chunkedParagraphState.clear();
            clearTimeout(this.chunkContinuationTimeoutId);
            this.chunkContinuationTimeoutId = null;

            if (index < 0 || index >= this.paragraphsList.length) {
                this.stopTTS(false);
                return;
            }
            if (!this.isParagraphInCurrentAutoReadLoop(index)) {
                if (this.isCurrentAutoReadLoopActive()) {
                    this.loopToTop();
                } else {
                    this.stopTTS(false);
                }
                return;
            }

            const para = this.paragraphsList[index];
            if (!para || !para.element || !para.text) {
                this.stopTTS(false);
                return;
            }

            const startCharIndex = Number(options && options.startCharIndex);
            const safeStartChar = Number.isFinite(startCharIndex) ? Math.max(0, Math.floor(startCharIndex)) : 0;
            const sentences = this.buildServerSentencePlan(para.text, safeStartChar, { paragraphIndex: index });
            if (sentences.length === 0) {
                const nextIndex = index + 1;
                if (nextIndex < this.paragraphsList.length) {
                    this.startServerPlaybackFromParagraph(nextIndex, {});
                } else {
                    this.stopTTS(false);
                }
                return;
            }

            this.currentParagraphIndex = index;
            this.lastSpokenElement = para.element;
            this.wordHighlightActiveForCurrent = this.shouldHighlightWordsForElement(para.element);
            const wrapStart = performance.now();
            const textToRead = this.prepareParagraphForReading(para.element);
            this.lastWrapMs = performance.now() - wrapStart;
            this.updateDiagnosticsPanel();
            if (!textToRead) {
                this.wordHighlightActiveForCurrent = false;
            }
            this.clearHighlights(true);
            para.element.classList.add('tts-current-sentence');
            this.updateProgressPanel();

            if (this.pointerLoopId) cancelAnimationFrame(this.pointerLoopId);
            this.updatePointerArrow();

            const state = {
                playbackSessionId: this.playbackSessionId,
                paragraphIndex: index,
                sentences,
                sentenceIndex: 0
            };
            this.serverPlaybackState = state;
            
            // PREFETCH: Start playback when sentence 0 is ready, prefetch others in background
            if (this.CONFIG.SERVER_PRECACHE_MODE && sentences.length > 1) {
                // Fire prefetch for sentences 1 and 2 in background — don't await them
                for (let i = 1; i < Math.min(3, sentences.length); i++) {
                    this.getOrPrepareServerSentenceAudioElement(state, i).catch(() => {});
                }
            }

            // Start playback immediately when sentence 0 is ready —
            // don't wait for any other sentences
            this.getOrPrepareServerSentenceAudioElement(state, 0)
                .then(() => {
                    if (state.playbackSessionId === this.playbackSessionId && this.continuousReadingActive) {
                        this.playServerSentence(state, 0);
                    }
                })
                .catch(() => {
                    // Sentence 0 fetch failed — try playing anyway (playServerSentence handles errors)
                    if (state.playbackSessionId === this.playbackSessionId && this.continuousReadingActive) {
                        this.playServerSentence(state, 0);
                    }
                });

            // Prefetch next paragraph's sentences in background while current plays
            this._prefetchNextParagraphSentences(index, state.playbackSessionId);
        },

        onServerParagraphComplete(state) {
            if (!this.continuousReadingActive) return;
            if (!state || state.playbackSessionId !== this.playbackSessionId) return;

            this.clearHighlights(true);
            this.deferProcessedParagraphRevert();
            this.updateProgressPanel();

            const refreshedIndex = this.refreshParagraphIndex(state.paragraphIndex);
            if (this.shouldLoopCurrentAutoReadMessageAfterIndex(refreshedIndex)) {
                this.loopToTop();
                return;
            }
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

            const nextIndex = refreshedIndex + 1;
            const nextPara = this.paragraphsList[nextIndex];
            if (this.shouldUseEmojiVoiceRoutingForParagraph(nextPara)) {
                this.stopServerAudioPlayback();
                this.serverPlaybackState = null;
                this.queueFromIndex(nextIndex, {});
                return;
            }

            this.startServerPlaybackFromParagraph(nextIndex, {});
        },

        _prefetchNextParagraphSentences(currentIndex, sessionId) {
            const nextIndex = currentIndex + 1;
            if (nextIndex >= this.paragraphsList.length) return;
            if (!this.isParagraphInCurrentAutoReadLoop(nextIndex)) return;
            const nextPara = this.paragraphsList[nextIndex];
            if (!nextPara || !nextPara.text) return;
            if (this.shouldUseEmojiVoiceRoutingForParagraph(nextPara)) return;
            const sentences = this.buildServerSentencePlan(nextPara.text, 0, { paragraphIndex: nextIndex });
            if (!sentences.length) return;

            // Build a dummy state just for cache key generation
            const nextState = {
                playbackSessionId: sessionId,
                paragraphIndex: nextIndex,
                sentences,
                sentenceIndex: 0
            };

            // Stagger prefetch requests by 150ms each to avoid hammering GPU
            // Sentence 0 starts immediately, sentence 1 after 150ms, etc.
            const maxPrefetch = Math.min(3, sentences.length);
            for (let i = 0; i < maxPrefetch; i++) {
                setTimeout(() => {
                    if (this.playbackSessionId !== sessionId) return; // stale, abort
                    this.getOrFetchServerSentenceAudio(nextState, i).catch(() => {});
                }, i * 150);
            }

            if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                console.debug('[TTS][Prefetch] Cross-paragraph prefetch scheduled', {
                    currentIndex,
                    nextIndex,
                    sentenceCount: maxPrefetch,
                    sessionId
                });
            }
        },

        async playServerSingleUtterance(text, onComplete = null) {
            const selectedVoiceId = this.getSelectedServerVoiceId();
            if (!selectedVoiceId) {
                if (onComplete) onComplete();
                return;
            }

            const normalizedText = this.normalizeTextForServerTts(text, { stage: 'single-utterance' });
            if (!normalizedText) {
                if (onComplete) onComplete();
                return;
            }

            this.advancePlaybackSession('server-single-utterance');
            this.stopServerAudioPlayback();
            this.clearServerSentenceCache();
            this.ttsActive = true;
            this.isPaused = false;

            const safeSpeed = this.getSafeServerSpeed();
            const requestId = this.generateServerRequestId({
                playbackSessionId: this.playbackSessionId,
                paragraphIndex: this.currentParagraphIndex
            }, 0);
            let response;
            try {
                response = await this.sendRuntimeMessageAsync({
                    action: 'synthesizeServerTts',
                    baseUrl: this.normalizeServerBaseUrl(this.CONFIG.SERVER_BASE_URL),
                    text: normalizedText,
                    voiceId: selectedVoiceId,
                    speed: safeSpeed,
                    requestId,
                    debug: this.CONFIG.SHOW_DIAGNOSTICS_PANEL
                });
            } catch (error) {
                this.logPlaybackGuardEvent('server-single-fetch-failed', {
                    error: String(error && error.message ? error.message : error)
                });
                this.ttsActive = false;
                if (onComplete) onComplete();
                return;
            }

            if (response && response.timing) {
                this.logPlaybackGuardEvent('server-single-timing', {
                    requestId,
                    timing: response.timing
                });
            }

            if (!response || response.ok !== true || typeof response.pcmBase64 !== 'string') {
                this.logPlaybackGuardEvent('server-single-invalid-response', {
                    error: response && response.error ? response.error : null
                });
                this.ttsActive = false;
                if (onComplete) onComplete();
                return;
            }

            const pcmBytes = this.base64ToUint8Array(response.pcmBase64);
            const sessionId = this.playbackSessionId;
            if (sessionId !== this.playbackSessionId) {
                return;
            }
            const audioBuffer = this.createServerAudioBufferFromPcm(pcmBytes, response.sampleRate);
            const context = this.ensureServerAudioGraph();
            if (!context || !this.serverAudioGainNode || !audioBuffer) {
                this.ttsActive = false;
                if (onComplete) onComplete();
                return;
            }

            this.stopCurrentServerSource();
            this.cancelScheduledNext();  // Cancel any scheduled next sentence
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.serverAudioGainNode);
            this.serverCurrentSource = source;
            source.onended = () => {
                if (sessionId !== this.playbackSessionId) return;
                if (this.serverCurrentSource === source) {
                    this.serverCurrentSource = null;
                }
                this.ttsActive = false;
                if (onComplete && this.continuousReadingActive) {
                    onComplete();
                } else {
                    this.stopTTS(false);
                }
            };

            this.resumeServerAudioPlayback()
                .then(() => {
                    if (sessionId !== this.playbackSessionId) return;
                    source.start(0);
                })
                .catch(() => {
                    if (sessionId !== this.playbackSessionId) return;
                    if (this.serverCurrentSource === source) {
                        this.serverCurrentSource = null;
                    }
                    this.ttsActive = false;
                    if (onComplete && this.continuousReadingActive) onComplete();
                });
        },

        // =============================================================================
    });
})();
