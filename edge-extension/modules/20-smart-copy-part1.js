(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // =============================================================================
        // SECTION 05: Smart Copy & Transcript
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        initSmartCopyEnhancements() {
            if (!this.copyObserver) {
                this.copyObserver = new MutationObserver(() => {
                    this.updateCopyButtons();
                    this.applySmartCopySelectionAllowlist();
                });
                this.copyObserver.observe(document.body, { childList: true, subtree: true });
            }
            this.applySmartCopySelectionAllowlist();
            this.updateCopyButtons();
        },

        isConversationSurfaceAvailable() {
            if (document.querySelector('[data-message-author-role="assistant"], [data-message-author-role="user"]')) return true;
            if (document.querySelector('section[data-turn="assistant"], section[data-turn="user"]')) return true;
            return false;
        },

        getConversationMessageElements() {
            const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], [data-message-author-role="user"]'));
            if (roleNodes.length > 0) return roleNodes;

            const sectionNodes = Array.from(document.querySelectorAll('section[data-turn="assistant"], section[data-turn="user"]'));
            if (sectionNodes.length > 0) return sectionNodes;

            return [];
        },

        getMessageRoleFromElement(element) {
            if (!element) return '';

            const directRole = (element.getAttribute && element.getAttribute('data-message-author-role')) || '';
            if (directRole === 'assistant' || directRole === 'user') return directRole;

            const roleContainer = element.closest ? element.closest('[data-message-author-role]') : null;
            const containerRole = roleContainer ? roleContainer.getAttribute('data-message-author-role') : '';
            if (containerRole === 'assistant' || containerRole === 'user') return containerRole;

            const directTurn = (element.getAttribute && element.getAttribute('data-turn')) || '';
            if (directTurn === 'assistant' || directTurn === 'user') return directTurn;

            const section = element.closest ? element.closest('section[data-turn]') : null;
            const sectionTurn = section ? section.getAttribute('data-turn') : '';
            if (sectionTurn === 'assistant' || sectionTurn === 'user') return sectionTurn;

            if (this.isUserMessageElement(element)) return 'user';
            return 'assistant';
        },

        getPreferredMessageContentNode(messageElement) {
            if (!messageElement) return null;
            return messageElement.querySelector('.whitespace-pre-wrap, .markdown') || messageElement;
        },

        getConversationTurnIndex(messageElement) {
            if (!messageElement || !messageElement.closest) return null;
            const turnNode = messageElement.closest('section[data-testid*="conversation-turn-"], [data-testid*="conversation-turn-"]');
            if (!turnNode || !turnNode.getAttribute) return null;
            const testId = turnNode.getAttribute('data-testid') || '';
            const match = testId.match(/conversation-turn-(\d+)/i);
            if (!match) return null;
            const value = Number(match[1]);
            return Number.isFinite(value) ? value : null;
        },

        getMessageOrderInsideTurn(messageElement) {
            if (!messageElement || !messageElement.closest) return null;
            const turnNode = messageElement.closest('section[data-testid*="conversation-turn-"], [data-testid*="conversation-turn-"]');
            if (!turnNode || !turnNode.querySelectorAll) return null;
            const siblings = Array.from(turnNode.querySelectorAll('[data-message-author-role]'));
            const idx = siblings.indexOf(messageElement);
            return idx >= 0 ? idx : null;
        },

        applySmartCopySelectionAllowlist() {
            const selectors = [
                '[data-message-author-role]',
                '[data-message-author-role] *',
                '[data-message-author-role] .markdown',
                '[data-message-author-role] .whitespace-pre-wrap',
                'section[data-turn]',
                'section[data-turn] *',
                'section[data-turn] .markdown',
                'section[data-turn] .whitespace-pre-wrap'
            ];
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
                const messageId = (messageElement.getAttribute && messageElement.getAttribute('data-message-id')) || '';
                const turnIndex = this.getConversationTurnIndex(messageElement);
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
                entriesByKey.set(key, { key, role, text, turnIndex, turnMessageIndex });
                orderedKeys.push(key);
            });
            return orderedKeys.map((key) => entriesByKey.get(key)).filter(Boolean);
        },

        sortSmartCopyEntries(entries) {
            if (!Array.isArray(entries)) return [];
            return entries
                .filter(Boolean)
                .sort((a, b) => {
                    const aTurn = Number.isFinite(a.turnIndex) ? a.turnIndex : Number.POSITIVE_INFINITY;
                    const bTurn = Number.isFinite(b.turnIndex) ? b.turnIndex : Number.POSITIVE_INFINITY;
                    if (aTurn !== bTurn) return aTurn - bTurn;

                    const aMsg = Number.isFinite(a.turnMessageIndex) ? a.turnMessageIndex : Number.POSITIVE_INFINITY;
                    const bMsg = Number.isFinite(b.turnMessageIndex) ? b.turnMessageIndex : Number.POSITIVE_INFINITY;
                    if (aMsg !== bMsg) return aMsg - bMsg;

                    const aSeen = Number.isFinite(a.firstSeenOrder) ? a.firstSeenOrder : Number.POSITIVE_INFINITY;
                    const bSeen = Number.isFinite(b.firstSeenOrder) ? b.firstSeenOrder : Number.POSITIVE_INFINITY;
                    return aSeen - bSeen;
                });
        },

        buildSmartCopyTranscriptText() {
            if (this.CONFIG.COPY_FORMAT !== 'dialogue-plus-setup') return '';
            const entries = this.sortSmartCopyEntries(
                this.collectSmartCopyEntriesFromMessages(this.getConversationMessageElements())
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
        }
    });
})();
