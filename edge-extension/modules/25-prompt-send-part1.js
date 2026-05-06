(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 06: Prompt / Send / Paste
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        findPromptArea() {
            const selectors = [
                '#prompt-textarea[contenteditable="true"]',
                'div[contenteditable="true"][id="prompt-textarea"]',
                'div[data-testid="prompt-textarea"][contenteditable="true"]',
                'textarea#prompt-textarea',
                'textarea[data-testid="prompt-textarea"]'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) return element;
            }
            return null;
        },

        getSendButtonSelectors() {
            return [
                'button[aria-label="Send prompt"]',
                'button[data-testid="send-button"]',
                'button.btn.relative.btn-primary:not([aria-label="Dictate button"])'
            ];
        },

        findSendButton() {
            const selectors = this.getSendButtonSelectors();
            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled) return button;
            }
            return null;
        },

        isSendButtonElement(element) {
            if (!element || !element.matches) return false;
            return this.getSendButtonSelectors().some((selector) => {
                try {
                    return element.matches(selector);
                } catch (_error) {
                    return false;
                }
            });
        },

        isEditableElement(element) {
            if (!element || !element.tagName) return false;
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return true;
            return element.isContentEditable === true || element.getAttribute('contenteditable') === 'true';
        },

        isPromptFocused(promptArea) {
            if (!promptArea) return false;
            const activeElement = document.activeElement;
            if (!activeElement) return false;
            return activeElement === promptArea || promptArea.contains(activeElement);
        },

        setPromptText(text) {
            const promptArea = this.findPromptArea();
            if (!promptArea) return false;
            const normalizedText = String(text || '').replace(/\r\n/g, '\n');

            promptArea.focus();
            if (promptArea.tagName === 'TEXTAREA' || promptArea.tagName === 'INPUT') {
                promptArea.value = normalizedText;
                promptArea.dispatchEvent(new Event('input', { bubbles: true }));
                promptArea.selectionStart = promptArea.value.length;
                promptArea.selectionEnd = promptArea.value.length;
                return true;
            }

            const selection = window.getSelection();
            let insertedWithCommand = false;
            if (selection) {
                const selectAllRange = document.createRange();
                selectAllRange.selectNodeContents(promptArea);
                selection.removeAllRanges();
                selection.addRange(selectAllRange);
            }

            try {
                if (typeof document.execCommand === 'function') {
                    insertedWithCommand = document.execCommand('insertText', false, normalizedText);
                }
            } catch (_error) {
                insertedWithCommand = false;
            }

            if (!insertedWithCommand) {
                promptArea.textContent = normalizedText;
            }

            promptArea.dispatchEvent(new Event('input', { bubbles: true }));
            if (selection) {
                const range = document.createRange();
                range.selectNodeContents(promptArea);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            return true;
        },

        getPromptText(promptArea = null) {
            const el = promptArea || this.findPromptArea();
            if (!el) return '';
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                return String(el.value || '').replace(/\r\n/g, '\n');
            }
            return String(el.innerText || el.textContent || '').replace(/\r\n/g, '\n');
        },

        capturePromptForHistoryFromPromptArea(source = '') {
            if (!this.isChatGPTPage || !this.CONFIG.PROMPT_HISTORY_NAV_ENABLED) return;
            const promptArea = this.findPromptArea();
            if (!promptArea) return;
            const text = this.getPromptText(promptArea);
            if (!text || !text.trim()) return;
            this.addPromptToHistory(text);
            if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                console.debug('[TTS] Prompt captured for history', {
                    source,
                    length: text.length
                });
            }
        },

        capturePromptForNativeEnterSend(event) {
            if (!this.isChatGPTPage || !this.CONFIG.PROMPT_HISTORY_NAV_ENABLED) return;
            if (this.CONFIG.ENTER_TO_SEND_ENABLED) return;
            if (!event || event.key !== 'Enter') return;
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

            const promptArea = this.findPromptArea();
            if (!promptArea || !this.isPromptFocused(promptArea)) return;
            this.capturePromptForHistoryFromPromptArea('native-enter');
        },

        handleSendButtonCapture(event) {
            if (!this.isChatGPTPage || !this.CONFIG.PROMPT_HISTORY_NAV_ENABLED) return;
            const target = event && event.target && event.target.closest ? event.target.closest('button') : null;
            if (!target || !this.isSendButtonElement(target)) return;
            this.capturePromptForHistoryFromPromptArea('send-button-click');
        },

        normalizePromptHistoryText(text) {
            return String(text || '').replace(/\r\n/g, '\n').trim();
        },

    });
})();
