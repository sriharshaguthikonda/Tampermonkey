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
            if (last === normalized) {
                this.promptHistoryCursor = -1;
                this.promptHistoryDraft = '';
                this.promptHistoryDraftTooLarge = false;
                return;
            }

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

        extractUserMessageText(userUnit) {
            // S3.10: the element is a driftwatch userUnit; its text is the prompt minus the
            // unit's own action buttons (Edit/Copy).
            if (!userUnit || typeof userUnit.cloneNode !== 'function') return '';
            const clone = userUnit.cloneNode(true);
            clone.querySelectorAll('button').forEach((node) => node.remove());
            return this.extractCleanText(clone);
        },

        userUnitsInExchanges(exchangeEls) {
            // Each userUnit is read once: exchanges are re-reported on every mutation (a
            // streaming reply, a rating prompt), and re-reading an old unit would append a
            // stale prompt out of order.
            if (typeof this.resolveInExchange !== 'function') return [];
            if (!this.promptHistoryUnitsSeen) this.promptHistoryUnitsSeen = new WeakSet();
            const units = [];
            exchangeEls.forEach((exchangeEl) => {
                const unit = this.resolveInExchange('userUnit', exchangeEl);
                if (!unit || this.promptHistoryUnitsSeen.has(unit)) return;
                this.promptHistoryUnitsSeen.add(unit);
                units.push(unit);
            });
            return units;
        },

        hydratePromptHistoryFromDom() {
            this.promptHistory = [];
            this.promptHistoryUnitsSeen = new WeakSet();
            if (this.pendingPromptHistoryElements) this.pendingPromptHistoryElements.clear();
            const exchangeEls = typeof this.exchanges === 'function' ? this.exchanges() : [];
            this.userUnitsInExchanges(exchangeEls).forEach((userUnit) => {
                const text = this.extractUserMessageText(userUnit);
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
            // S3.10: queue the userUnit of each exchange a mutation batch touched.
            this.promptHistoryBusUnsubscribe = ns.observerBus.subscribeExchanges({
                name: 'prompt-history',
                onExchangeChange: ({ exchanges }) => {
                    this.userUnitsInExchanges(exchanges).forEach((userUnit) => this.queuePromptHistoryElement(userUnit));
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
            if (this.promptHistoryCursor === -1 || this.promptHistoryCursor >= this.promptHistory.length) {
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
            // S3.8: async (Promise<boolean>) — on a lazy new-chat page the text lands in
            // the pendingComposerInput stub and the send waits for the real composer to
            // mount (applyPromptText). No caller branches on the return synchronously.
            return this.applyPromptText(query, { autoSend });
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

            // S3.10: an open inline edit-message form (driftwatch editSurfaceForm) blocks paste.
            if (typeof this.exchanges === 'function' && typeof this.resolveInExchange === 'function') {
                const editOpen = this.exchanges().some((exchangeEl) => {
                    const form = this.resolveInExchange('editSurfaceForm', exchangeEl);
                    return Boolean(form) && visible(form);
                });
                if (editOpen) return true;
            }

            return false;
        },

        handleGlobalPaste(event) {
            if (!this.isChatGPTPage) return;
            const promptArea = this.findPromptArea();
            // S3.8 lazy new-chat: no composer form exists yet, only the pre-hydration
            // stub — paste still lands (applyPromptText hydrates through the stub and
            // waits for the real composer to mount).
            const pendingStub = promptArea ? null : this.findPendingComposerInput();
            if (!promptArea && !pendingStub) return;

            if (promptArea && this.isPromptFocused(promptArea)) {
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

            // Async path: applyPromptText notifies the user on failure itself, so only
            // the success notifications happen here.
            if (this.CONFIG.NICE_AUTO_PASTE_ENABLED) {
                const formattedQuery = `According to NICE guidelines, what is the answer for the following:\n\n${pastedText.trim()}`;
                this.applyPromptText(formattedQuery, { autoSend: this.CONFIG.NICE_AUTO_SEND })
                    .then((success) => {
                        if (success) {
                            this.showNotification(`NICE query pasted${this.CONFIG.NICE_AUTO_SEND ? ' and sent' : ''}.`);
                        }
                    })
                    .catch(() => { });
                return;
            }

            if (this.CONFIG.REGULAR_PASTE_ENABLED) {
                this.applyPromptText(pastedText, { autoSend: this.CONFIG.REGULAR_AUTO_SEND })
                    .then((success) => {
                        if (success) {
                            this.showNotification(`Text pasted${this.CONFIG.REGULAR_AUTO_SEND ? ' and sent' : ''}.`);
                        }
                    })
                    .catch(() => { });
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
