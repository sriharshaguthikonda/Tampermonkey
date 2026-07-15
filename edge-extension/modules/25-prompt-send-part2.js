(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        addPromptToHistory(text) {
            const normalized = this.normalizePromptHistoryText(text);
            if (!normalized) return;
            const maxChars = Math.max(500, Number(this.CONFIG.PROMPT_HISTORY_MAX_CHARS) || 6000);
            if (normalized.length > maxChars) return;
            const last = this.promptHistory.length > 0 ? this.promptHistory[this.promptHistory.length - 1] : '';
            if (last === normalized) return;

            this.promptHistory.push(normalized);
            const maxItems = Math.max(20, Number(this.CONFIG.PROMPT_HISTORY_MAX) || 200);
            if (this.promptHistory.length > maxItems) {
                this.promptHistory.splice(0, this.promptHistory.length - maxItems);
            }
            this.promptHistoryCursor = -1;
            this.promptHistoryDraft = '';
            this.promptHistoryDraftTooLarge = false;
        },

        extractCleanText(element) {
            if (!element) return '';
            const clone = element.cloneNode(true);
            clone.querySelectorAll('[data-tmx-control], .tmx-copy-row, .tmx-copy-button, [data-tts-ui]').forEach((node) => node.remove());
            return this.normalizePromptHistoryText(clone.innerText || clone.textContent || '');
        },

        extractUserMessageText(messageElement) {
            if (!messageElement || messageElement.getAttribute('data-message-author-role') !== 'user') return '';
            const preferredNode = messageElement.querySelector('.whitespace-pre-wrap');
            if (preferredNode) {
                return this.extractCleanText(preferredNode);
            }
            return this.extractCleanText(messageElement);
        },

        hydratePromptHistoryFromDom() {
            this.promptHistory = [];
            const userMessages = Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
            userMessages.forEach((messageElement) => {
                const text = this.extractUserMessageText(messageElement);
                if (text) this.addPromptToHistory(text);
            });
            this.promptHistoryCursor = -1;
            this.promptHistoryDraft = '';
            this.promptHistoryDraftTooLarge = false;
        },

        schedulePromptHistoryHydration() {
            const hydrate = () => this.hydratePromptHistoryFromDom();
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(hydrate, { timeout: 2000 });
                return;
            }
            setTimeout(hydrate, 2000);
        },

        queuePromptHistoryElement(element) {
            if (!element) return;
            if (!this.pendingPromptHistoryElements) {
                this.pendingPromptHistoryElements = new Set();
            }
            this.pendingPromptHistoryElements.add(element);
        },

        collectPromptHistoryCandidates(element) {
            if (!element) return;
            if (element.matches && element.matches('[data-message-author-role="user"]')) {
                this.queuePromptHistoryElement(element);
            }
            if (element.querySelectorAll) {
                element.querySelectorAll('[data-message-author-role="user"]').forEach((candidate) => {
                    this.queuePromptHistoryElement(candidate);
                });
            }
        },

        ensurePromptHistoryFresh() {
            if (!this.pendingPromptHistoryElements || this.pendingPromptHistoryElements.size === 0) return;
            const pending = Array.from(this.pendingPromptHistoryElements);
            this.pendingPromptHistoryElements.clear();
            pending.forEach((messageElement) => {
                if (!messageElement || messageElement.isConnected === false) return;
                const text = this.extractUserMessageText(messageElement);
                if (text) this.addPromptToHistory(text);
            });
        },

        initPromptHistoryObserver() {
            if (!this.isChatGPTPage || this.promptHistoryBusUnsubscribe) return;
            this.schedulePromptHistoryHydration();
            if (!this.pendingPromptHistoryElements) {
                this.pendingPromptHistoryElements = new Set();
            }
            if (!ns.observerBus) return;
            this.promptHistoryBusUnsubscribe = ns.observerBus.subscribe({
                name: 'prompt-history',
                selector: '[data-message-author-role="user"]',
                onFlush: ({ addedNodes }) => {
                    addedNodes.forEach((element) => this.collectPromptHistoryCandidates(element));
                }
            });
        },

        setPromptHistoryNavigationEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.PROMPT_HISTORY_NAV_ENABLED === nextValue) return;
            this.CONFIG.PROMPT_HISTORY_NAV_ENABLED = nextValue;
            this.promptHistoryCursor = -1;
            this.promptHistoryDraft = '';
            this.promptHistoryDraftTooLarge = false;
            if (!silent) {
                this.showNotification(`Prompt history nav ${nextValue ? 'on' : 'off'}`);
            }
        },

        handlePromptHistoryHotkeys(event) {
            if (!this.isChatGPTPage || !this.CONFIG.PROMPT_HISTORY_NAV_ENABLED) return false;
            if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return false;
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;

            const promptArea = this.findPromptArea();
            if (!promptArea || !this.isPromptFocused(promptArea)) return false;
            this.ensurePromptHistoryFresh();

            event.preventDefault();
            event.stopPropagation();

            if (this.promptHistory.length === 0) {
                this.showNotification('No prompt history yet.');
                return true;
            }

            const direction = event.key === 'ArrowUp' ? -1 : 1;
            const maxChars = Math.max(500, Number(this.CONFIG.PROMPT_HISTORY_MAX_CHARS) || 6000);
            if (this.promptHistoryCursor === -1) {
                const draft = this.getPromptText(promptArea);
                if (draft.length > maxChars) {
                    this.promptHistoryDraft = '';
                    this.promptHistoryDraftTooLarge = true;
                } else {
                    this.promptHistoryDraft = draft;
                    this.promptHistoryDraftTooLarge = false;
                }
                this.promptHistoryCursor = this.promptHistory.length;
            }

            let nextCursor = this.promptHistoryCursor;
            while (true) {
                const candidate = nextCursor + direction;
                if (candidate < 0 || candidate > this.promptHistory.length) break;
                if (candidate === this.promptHistory.length) {
                    nextCursor = candidate;
                    break;
                }

                const candidateText = this.promptHistory[candidate] || '';
                if (candidateText.length <= maxChars) {
                    nextCursor = candidate;
                    break;
                }
                nextCursor = candidate;
            }

            if (nextCursor === this.promptHistoryCursor) {
                return true;
            }

            this.promptHistoryCursor = nextCursor;
            if (nextCursor === this.promptHistory.length) {
                if (this.promptHistoryDraftTooLarge) {
                    this.showNotification('Current draft too large to restore via Ctrl up/down.');
                    return true;
                }
                this.setPromptText(this.promptHistoryDraft || '');
            } else {
                this.setPromptText(this.promptHistory[nextCursor] || '');
            }
            return true;
        },

        setQueryAndSend(query, autoSend = false) {
            const applied = this.setPromptText(query);
            if (!applied) return false;
            if (autoSend) {
                this.scheduleSendButtonClick();
            }
            return true;
        },

        scheduleSendButtonClick() {
            const clickIfReady = () => {
                const sendButton = this.findSendButton();
                if (sendButton) {
                    this.capturePromptForHistoryFromPromptArea('auto-send-click');
                    sendButton.click();
                    return true;
                }
                return false;
            };

            if (clickIfReady()) return;

            const observer = new MutationObserver(() => {
                if (clickIfReady()) observer.disconnect();
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['disabled', 'aria-disabled']
            });
            setTimeout(() => observer.disconnect(), 5000);
        },

        hasBlockingOpenElements(promptArea) {
            const activeElement = document.activeElement;
            if (this.isEditableElement(activeElement) && !this.isPromptFocused(promptArea)) return true;

            const visible = (el) => {
                if (!el || el.isConnected === false) return false;
                if (el.closest('[aria-hidden="true"], [inert]')) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                if (Number.parseFloat(style.opacity || '1') <= 0.01) return false;
                const rect = el.getBoundingClientRect();
                return el.getClientRects().length > 0 &&
                    rect.width > 1 && rect.height > 1 &&
                    rect.bottom > 0 && rect.right > 0 &&
                    rect.top < window.innerHeight && rect.left < window.innerWidth;
            };

            const modal = Array.from(document.querySelectorAll('[role="dialog"]')).find(visible);
            if (modal) return true;

            // ponytail: [data-state="open"] was removed because Radix keeps it on persistent chrome
            // such as the sidebar and pickers, so this guard always fired (issue #19). Real Radix
            // overlays are covered by dialog/menu/listbox roles because closed content is unmounted;
            // role-less popovers with a focused input still hit the editable-activeElement guard.
            // Re-add only a scoped data-state check if a real leak appears.
            const menu = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"]')).find(visible);
            if (menu) return true;

            const editBox = document.querySelector('.bg-token-main-surface-tertiary textarea');
            if (editBox && visible(editBox)) return true;

            return false;
        },

        handleGlobalPaste(event) {
            if (!this.isChatGPTPage) return;
            const promptArea = this.findPromptArea();
            if (!promptArea) return;

            if (this.isPromptFocused(promptArea)) {
                if (this.CONFIG.REGULAR_PASTE_ENABLED && this.CONFIG.REGULAR_AUTO_SEND_IN_INPUT) {
                    setTimeout(() => this.scheduleSendButtonClick(), 40);
                }
                return;
            }

            if (!this.CONFIG.GLOBAL_PASTE_ENABLED) return;
            if (this.hasBlockingOpenElements(promptArea)) return;

            const activeElement = document.activeElement;
            if (this.isEditableElement(activeElement) && !this.isPromptFocused(promptArea)) return;

            const pastedText = (event.clipboardData || window.clipboardData).getData('text');
            if (!pastedText || !pastedText.trim()) return;

            if (!this.CONFIG.NICE_AUTO_PASTE_ENABLED && !this.CONFIG.REGULAR_PASTE_ENABLED) return;

            event.preventDefault();
            event.stopPropagation();

            if (this.CONFIG.NICE_AUTO_PASTE_ENABLED) {
                const formattedQuery = `According to NICE guidelines, what is the answer for the following:\n\n${pastedText.trim()}`;
                const success = this.setQueryAndSend(formattedQuery, this.CONFIG.NICE_AUTO_SEND);
                if (success) {
                    this.showNotification(`NICE query pasted${this.CONFIG.NICE_AUTO_SEND ? ' and sent' : ''}.`);
                }
                return;
            }

            if (this.CONFIG.REGULAR_PASTE_ENABLED) {
                const success = this.setPromptText(pastedText);
                if (success) {
                    if (this.CONFIG.REGULAR_AUTO_SEND) {
                        this.scheduleSendButtonClick();
                    }
                    this.showNotification(`Text pasted${this.CONFIG.REGULAR_AUTO_SEND ? ' and sent' : ''}.`);
                }
            }
        },

        handleEnterToSend(event) {
            if (!this.isChatGPTPage || !this.CONFIG.ENTER_TO_SEND_ENABLED) return;
            if (event.key !== 'Enter') return;
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

            const promptArea = this.findPromptArea();
            if (!promptArea || !this.isPromptFocused(promptArea)) return;

            event.preventDefault();
            const now = Date.now();
            if (now - this.lastEnterPressTime <= this.CONFIG.ENTER_TO_SEND_DOUBLE_PRESS_MS) {
                const sendButton = this.findSendButton();
                if (sendButton) {
                    this.capturePromptForHistoryFromPromptArea('double-enter-send');
                    sendButton.click();
                }
                this.lastEnterPressTime = 0;
                return;
            }
            this.lastEnterPressTime = now;
        },

        // =============================================================================
    });
})();
