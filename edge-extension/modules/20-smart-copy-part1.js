(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    // saved/local pages keep the pre-2026-09 DOM; chatgpt.com uses the pack
    const LEGACY_DOM = {
        BUS_SELECTOR: '[data-message-author-role], section[data-turn]',
        ROLE_MESSAGES: '[data-message-author-role="assistant"], [data-message-author-role="user"]',
        TURN_MESSAGES: 'section[data-turn="assistant"], section[data-turn="user"]',
        ROLE_ATTRIBUTE: 'data-message-author-role',
        ROLE_CONTAINER: '[data-message-author-role]',
        TURN_ATTRIBUTE: 'data-turn',
        TURN_CONTAINER: 'section[data-turn]',
        CONTENT_ROOT: '.whitespace-pre-wrap, .markdown',
        TURN_NODE: 'section[data-testid*="conversation-turn-"], [data-testid*="conversation-turn-"]',
        TEST_ID_ATTRIBUTE: 'data-testid',
        ALLOWLIST: [
            '[data-message-author-role]',
            '[data-message-author-role] *',
            '[data-message-author-role] .markdown',
            '[data-message-author-role] .whitespace-pre-wrap',
            'section[data-turn]',
            'section[data-turn] *',
            'section[data-turn] .markdown',
            'section[data-turn] .whitespace-pre-wrap'
        ]
    };

    Object.assign(ns.TTSReader, {
        // SECTION 05: Smart Copy & Transcript
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        initSmartCopyEnhancements() {
            const hasExchangeBus = Boolean(ns.observerBus && typeof ns.observerBus.subscribeExchanges === 'function');
            if (!this.copyBusUnsubscribe && this.isChatGPTPage && hasExchangeBus) {
                // S3.5: wake on exchange mutations (message units live inside
                // exchanges); the old dead role-attribute selector never matched.
                this.copyBusUnsubscribe = ns.observerBus.subscribeExchanges({
                    name: 'smart-copy',
                    onExchangeChange: () => {
                        this.updateCopyButtons();
                        this.applySmartCopySelectionAllowlist();
                    }
                });
            }
            if (!this.copyBusUnsubscribe && !this.isChatGPTPage && ns.observerBus) {
                this.copyBusUnsubscribe = ns.observerBus.subscribe({
                    name: 'smart-copy',
                    selector: LEGACY_DOM.BUS_SELECTOR,
                    onFlush: () => {
                        this.updateCopyButtons();
                        this.applySmartCopySelectionAllowlist();
                    }
                });
            }
            if (!this.copyBusUnsubscribe) {
                this.copyBusUnsubscribe = () => {};
                setTimeout(() => {
                    this.updateCopyButtons();
                    this.applySmartCopySelectionAllowlist();
                }, 200);
            }
            this.applySmartCopySelectionAllowlist();
            this.updateCopyButtons();
        },

        isConversationSurfaceAvailable() {
            // S3.5: "any messages present" = at least one exchange with a resolvable
            // unit (exchangeRoot enumeration; the dead role attributes are gone).
            return this.getConversationMessageElements().length > 0;
        },

        getExchangeUnitsInDomOrder(exchangeEl) {
            // S3.5: the exchange's userUnit + assistantUnit in DOM order (S0.2: user
            // precedes assistant in every observed exchange; compareDocumentPosition
            // decides rather than assuming it). 4 = Node.DOCUMENT_POSITION_FOLLOWING.
            const units = [];
            const userUnit = this.resolveInExchange('userUnit', exchangeEl);
            const assistantUnit = this.resolveInExchange('assistantUnit', exchangeEl);
            const userFirst = userUnit && assistantUnit
                && typeof userUnit.compareDocumentPosition === 'function'
                && (userUnit.compareDocumentPosition(assistantUnit) & 4);
            if (userFirst) {
                units.push(userUnit, assistantUnit);
            } else {
                if (assistantUnit) units.push(assistantUnit);
                if (userUnit) units.push(userUnit);
            }
            return units;
        },

        getConversationMessageElements() {
            if (!this.isChatGPTPage) {
                const roleNodes = Array.from(document.querySelectorAll(LEGACY_DOM.ROLE_MESSAGES));
                if (roleNodes.length > 0) return roleNodes;

                const sectionNodes = Array.from(document.querySelectorAll(LEGACY_DOM.TURN_MESSAGES));
                if (sectionNodes.length > 0) return sectionNodes;

                return [];
            }
            // S3.5: units per exchange, exchanges in DOM order — replaces the dead
            // document-wide role/turn attribute queries.
            const result = [];
            this.exchanges().forEach((exchangeEl) => {
                result.push(...this.getExchangeUnitsInDomOrder(exchangeEl));
            });
            return result;
        },

        getMessageRoleFromElement(element) {
            if (!element) return '';

            if (!this.isChatGPTPage) {
                const directRole = (element.getAttribute && element.getAttribute(LEGACY_DOM.ROLE_ATTRIBUTE)) || '';
                if (directRole === 'assistant' || directRole === 'user') return directRole;

                const roleContainer = element.closest ? element.closest(LEGACY_DOM.ROLE_CONTAINER) : null;
                const containerRole = roleContainer ? roleContainer.getAttribute(LEGACY_DOM.ROLE_ATTRIBUTE) : '';
                if (containerRole === 'assistant' || containerRole === 'user') return containerRole;

                const directTurn = (element.getAttribute && element.getAttribute(LEGACY_DOM.TURN_ATTRIBUTE)) || '';
                if (directTurn === 'assistant' || directTurn === 'user') return directTurn;

                const section = element.closest ? element.closest(LEGACY_DOM.TURN_CONTAINER) : null;
                const sectionTurn = section ? section.getAttribute(LEGACY_DOM.TURN_ATTRIBUTE) : '';
                if (sectionTurn === 'assistant' || sectionTurn === 'user') return sectionTurn;

                if (this.isUserMessageElement(element)) return 'user';
                return 'assistant';
            }

            // S3.5: role from the per-exchange unit anchors — map the element to its
            // exchange, then classify by containment against that exchange's units.
            const exchangeEl = typeof this.exchangeForElement === 'function' ? this.exchangeForElement(element) : null;
            if (exchangeEl && typeof this.resolveInExchange === 'function') {
                const userUnit = this.resolveInExchange('userUnit', exchangeEl);
                if (userUnit && (userUnit === element || userUnit.contains(element))) return 'user';
                const assistantUnit = this.resolveInExchange('assistantUnit', exchangeEl);
                if (assistantUnit && (assistantUnit === element || assistantUnit.contains(element))) return 'assistant';
            }

            return '';
        },

        getPreferredMessageContentNode(messageElement) {
            if (!messageElement) return null;
            if (!this.isChatGPTPage) {
                return messageElement.querySelector(LEGACY_DOM.CONTENT_ROOT) || messageElement;
            }
            // S3.5: assistant content comes from the exchange's assistantMarkdownRoot;
            // user units are read directly (the unit itself is the content container).
            const exchangeEl = typeof this.exchangeForElement === 'function' ? this.exchangeForElement(messageElement) : null;
            if (!exchangeEl || typeof this.resolveInExchange !== 'function') return messageElement;
            const assistantUnit = this.resolveInExchange('assistantUnit', exchangeEl);
            const isAssistantContent = assistantUnit
                && (assistantUnit === messageElement || assistantUnit.contains(messageElement));
            if (isAssistantContent) {
                return this.resolveInExchange('assistantMarkdownRoot', exchangeEl) || messageElement;
            }
            return messageElement;
        },

        getConversationTurnIndex(messageElement) {
            if (this.isChatGPTPage) return null;
            if (!messageElement || !messageElement.closest) return null;
            const turnNode = messageElement.closest(LEGACY_DOM.TURN_NODE);
            if (!turnNode || !turnNode.getAttribute) return null;
            const testId = turnNode.getAttribute(LEGACY_DOM.TEST_ID_ATTRIBUTE) || '';
            const match = testId.match(/conversation-turn-(\d+)/i);
            if (!match) return null;
            const value = Number(match[1]);
            return Number.isFinite(value) ? value : null;
        },

        getMessageOrderInsideTurn(messageElement) {
            if (!this.isChatGPTPage) {
                if (!messageElement || !messageElement.closest) return null;
                const turnNode = messageElement.closest(LEGACY_DOM.TURN_NODE);
                if (!turnNode || !turnNode.querySelectorAll) return null;
                const siblings = Array.from(turnNode.querySelectorAll(LEGACY_DOM.ROLE_CONTAINER));
                const idx = siblings.indexOf(messageElement);
                return idx >= 0 ? idx : null;
            }
            // S3.5: order among the element's exchange units in DOM order.
            if (!messageElement) return null;
            const exchangeEl = typeof this.exchangeForElement === 'function' ? this.exchangeForElement(messageElement) : null;
            if (!exchangeEl) return null;
            const idx = this.getExchangeUnitsInDomOrder(exchangeEl).indexOf(messageElement);
            return idx >= 0 ? idx : null;
        },

        applySmartCopySelectionAllowlist() {
            // S3.5: allowlist semantics kept (force user-select on message content);
            // the site entries come from pack data (R7).
            const selectors = this.isChatGPTPage
                ? (typeof this.packData === 'function' ? this.packData('nativeSelectionAllowlist') : [])
                : LEGACY_DOM.ALLOWLIST;
            if (selectors.length === 0) return;
            document.querySelectorAll(selectors.join(', ')).forEach((node) => {
                if (!node || !node.style) return;
                node.style.userSelect = 'text';
                node.style.webkitUserSelect = 'text';
            });
        },

        cleanSmartCopyWorkingNode(node) {
            if (!node || !node.querySelectorAll) return;
            node.querySelectorAll(
                [
                    '[data-tmx-control]',
                    '.tmx-copy-row',
                    '.tmx-copy-button',
                    '[data-tts-ui]',
                    '.sr-only',
                    'button',
                    '[data-testid="copy-turn-action-button"]',
                    '[data-testid*="turn-action"]',
                    '[aria-label="Response actions"]',
                    '[aria-label="Your message actions"]',
                    '[role="group"][aria-label*="actions"]'
                ].join(', ')
            ).forEach((target) => target.remove());
        },

        normalizeSmartCopyText(text) {
            const lines = String(text || '')
                .replace(/\r\n/g, '\n')
                .split('\n')
                .map((line) => line.replace(/\s+$/g, ''));
            const normalized = [];
            let pendingBlank = false;

            lines.forEach((line) => {
                const trimmed = line.trim();
                if (!trimmed) {
                    if (normalized.length > 0) pendingBlank = true;
                    return;
                }
                if (/^copy$/i.test(trimmed)) return;
                if (/^thought for\b/i.test(trimmed)) return;
                if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(trimmed)) return;
                if (/^you said$/i.test(trimmed)) return;
                if (pendingBlank) {
                    normalized.push('');
                    pendingBlank = false;
                }
                normalized.push(trimmed);
            });

            while (normalized.length > 0 && normalized[0] === '') normalized.shift();
            while (normalized.length > 0 && normalized[normalized.length - 1] === '') normalized.pop();
            return normalized.join('\n').trim();
        },

        extractConversationTextFromNode(node) {
            if (!node) return '';
            const clone = node.cloneNode(true);
            this.cleanSmartCopyWorkingNode(clone);
            const text = clone.innerText || clone.textContent || '';
            return this.normalizeSmartCopyText(text);
        },

        extractConversationTextFromMessage(messageElement) {
            const preferred = this.getPreferredMessageContentNode(messageElement);
            if (preferred) return this.extractConversationTextFromNode(preferred);
            return this.extractConversationTextFromNode(messageElement);
        },

        formatSmartCopyEntries(entries) {
            if (!Array.isArray(entries) || entries.length === 0) return '';
            const formatted = entries
                .map((entry) => {
                    const role = entry && entry.role === 'user'
                        ? this.CONFIG.SMART_COPY_USER_LABEL
                        : this.CONFIG.SMART_COPY_ASSISTANT_LABEL;
                    const text = this.normalizeSmartCopyText(entry && entry.text ? entry.text : '');
                    if (!text) return '';
                    return `${role}: ${text}`;
                })
                .filter(Boolean);
            return formatted.join('\n\n').trim();
        },

        getStableSmartCopyEntryKey({ messageId = '', turnIndex = NaN, turnMessageIndex = NaN, role = '', text = '', fallbackIndex = 0 } = {}) {
            if (messageId) return `id:${messageId}`;
            if (Number.isFinite(turnIndex) && Number.isFinite(turnMessageIndex)) {
                return `turn:${turnIndex}:msg:${turnMessageIndex}:${role}`;
            }
            if (Number.isFinite(turnIndex)) {
                return `turn:${turnIndex}:${role}:${fallbackIndex}`;
            }
            return `k:${role}:${String(text || '').slice(0, 220)}:${fallbackIndex}`;
        },

        collectSmartCopyEntriesFromMessages(messageElements) {
            const orderedKeys = [];
            const entriesByKey = new Map();
            (messageElements || []).forEach((messageElement, index) => {
                const role = this.getMessageRoleFromElement(messageElement);
                if (role !== 'assistant' && role !== 'user') return;
                const text = this.extractConversationTextFromMessage(messageElement);
                if (!text) return;
                let messageId = (messageElement.getAttribute && messageElement.getAttribute('data-message-id')) || '';
                let turnIndex = this.getConversationTurnIndex(messageElement);
                if (this.isChatGPTPage) {
                    const exchangeEl = typeof this.exchangeForElement === 'function'
                        ? this.exchangeForElement(messageElement)
                        : null;
                    const stableExchangeKey = exchangeEl && typeof this.exchangeKey === 'function'
                        ? this.exchangeKey(exchangeEl)
                        : null;
                    messageId = stableExchangeKey ? `${stableExchangeKey}:${role}` : '';
                    turnIndex = null;
                }
                const turnMessageIndex = this.getMessageOrderInsideTurn(messageElement);
                const key = this.getStableSmartCopyEntryKey({
                    messageId,
                    turnIndex,
                    turnMessageIndex,
                    role,
                    text,
                    fallbackIndex: index
                });
                if (entriesByKey.has(key)) return;
                entriesByKey.set(key, { key, role, text, turnIndex, turnMessageIndex, firstSeenOrder: index });
                orderedKeys.push(key);
            });
            return orderedKeys.map((key) => entriesByKey.get(key)).filter(Boolean);
        },

        sortSmartCopyEntries(entries) {
            if (!Array.isArray(entries)) return [];
            return entries
                .filter(Boolean)
                .sort((a, b) => {
                    if (Number.isFinite(a.turnIndex) && Number.isFinite(b.turnIndex)) {
                        if (a.turnIndex !== b.turnIndex) return a.turnIndex - b.turnIndex;
                        const aMsg = Number.isFinite(a.turnMessageIndex) ? a.turnMessageIndex : Number.POSITIVE_INFINITY;
                        const bMsg = Number.isFinite(b.turnMessageIndex) ? b.turnMessageIndex : Number.POSITIVE_INFINITY;
                        if (aMsg !== bMsg) return aMsg - bMsg;
                    }

                    const aSeen = Number.isFinite(a.firstSeenOrder) ? a.firstSeenOrder : Number.POSITIVE_INFINITY;
                    const bSeen = Number.isFinite(b.firstSeenOrder) ? b.firstSeenOrder : Number.POSITIVE_INFINITY;
                    return aSeen - bSeen;
                });
        },

    });
})();
