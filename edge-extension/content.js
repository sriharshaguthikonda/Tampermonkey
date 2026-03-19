(function() {
    'use strict';

    const SETTINGS_STORAGE_KEY = 'settingsByProfile';
    const PROFILE_CHATGPT = 'chatgpt';
    const PROFILE_LOCAL = 'local';

    const BASE_DEFAULT_SETTINGS = {
        speechRate: 5,
        wordHighlight: true,
        gapTrim: true,
        readUserMessages: false,
        readReferences: false,
        autoRead: false,
        loopOnEnd: true,
        autoScrollEnabled: true,
        showPageOverlay: true,
        overlayPosition: null,
        showDiagnostics: true,
        volumeBoostEnabled: true,
        volumeBoostLevel: 1.3,
        enterToSendEnabled: true,
        globalPasteEnabled: true,
        regularPasteEnabled: true,
        regularAutoSend: false,
        regularAutoSendInInput: false,
        niceAutoPasteEnabled: true,
        niceAutoSend: false,
        copyButtonEnabled: true,
        doubleClickEditEnabled: true,
        autoCloseLimitWarning: true,
        limitWarningDelay: 1500,
        queueLookahead: 3,
        navFocusHoldMs: 800,
        navKeyupReadDelayMs: 150,
        navThrottleMs: 20,
        scrollThrottleMs: 250,
        scrollEdgePadding: 80,
        loopWaitMs: 1200,
        waitForMoreMs: 8000,
        autoReadCooldownMs: 1500,
        autoReadStableMs: 800,
        autoReadMinParagraphs: 3
    };

    const PROFILE_DEFAULT_SETTINGS = {
        [PROFILE_CHATGPT]: { ...BASE_DEFAULT_SETTINGS },
        [PROFILE_LOCAL]: {
            ...BASE_DEFAULT_SETTINGS,
            autoRead: false,
            globalPasteEnabled: false,
            regularPasteEnabled: false,
            regularAutoSend: false,
            regularAutoSendInInput: false,
            niceAutoPasteEnabled: false,
            niceAutoSend: false
        }
    };

    function getProfileFromUrl(urlLike) {
        try {
            const url = new URL(urlLike || '');
            if (url.protocol === 'file:') return PROFILE_LOCAL;
            const host = (url.hostname || '').toLowerCase();
            if (host === 'chatgpt.com' || host === 'chat.openai.com') return PROFILE_CHATGPT;
            if (host === 'localhost' || host === '127.0.0.1') return PROFILE_LOCAL;
        } catch (_error) {
            // Fall back to chatgpt defaults when URL parsing fails.
        }
        return PROFILE_CHATGPT;
    }

    function getCurrentProfile() {
        return getProfileFromUrl(window.location && window.location.href ? window.location.href : '');
    }

    function getProfileDefaults(profile) {
        return PROFILE_DEFAULT_SETTINGS[profile] || PROFILE_DEFAULT_SETTINGS[PROFILE_CHATGPT];
    }

    function pickLegacySettings(items) {
        const legacy = {};
        for (const key of Object.keys(BASE_DEFAULT_SETTINGS)) {
            if (Object.prototype.hasOwnProperty.call(items, key)) {
                legacy[key] = items[key];
            }
        }
        return legacy;
    }

    function persistProfileSetting(profile, key, value) {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) return;
        chrome.storage.sync.get({ [SETTINGS_STORAGE_KEY]: {} }, (items) => {
            const settingsByProfile = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
                ? { ...items[SETTINGS_STORAGE_KEY] }
                : {};
            const nextProfile = profile || getCurrentProfile();
            const nextSettings = {
                ...getProfileDefaults(nextProfile),
                ...(settingsByProfile[nextProfile] || {})
            };
            nextSettings[key] = value;
            settingsByProfile[nextProfile] = nextSettings;
            chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settingsByProfile });
        });
    }

    const TTSReader = {
        speechSynthesis: window.speechSynthesis,
        ttsActive: false,
        isPaused: false,
        isNavigating: false,
        continuousReadingActive: false,
        pageFullyLoaded: false,
        lastSpokenElement: null,
        currentWordSpan: null,
        lastScrollTime: 0,
        autoScrollIntervalId: null,
        autoScrollInProgress: false,
        autoScrollInProgressId: null,
        userInteractingUntil: 0,
        autoScrollResumeId: null,
        navigationTimeoutId: null,
        pointerLoopId: null,
        paragraphsList: [],
        queuedParagraphs: new Set(),
        paragraphObserver: null,
        paragraphsDirty: true,
        currentParagraphIndex: -1,
        pendingNavIndex: -1,
        navKeyHeld: false,
        prewrappedParagraphs: new Map(),
        wordHighlightActiveForCurrent: false,
        pendingReverts: [],
        pendingRevertId: null,
        pendingRevertUsesIdle: false,
        overlayPanel: null,
        diagnosticsPanel: null,
        progressPanel: null,
        navigationPanel: null,
        navigationPanelHideId: null,
        lastUtteranceEndTime: 0,
        lastGapMs: null,
        lastWrapMs: null,
        autoReadObserver: null,
        autoReadDebounceId: null,
        lastAutoReadMessageElement: null,
        lastAutoReadTriggeredAt: 0,
        autoReadMessageActivity: new WeakMap(),
        waitingForMoreContent: false,
        waitForMoreTimeoutId: null,
        waitForMoreSince: 0,
        waitForMoreNextIndex: -1,
        audioContexts: new Map(),
        mediaObserver: null,
        lastEnterPressTime: 0,
        pasteHandler: null,
        copyObserver: null,
        editObserver: null,
        limitWarningObserver: null,
        isChatGPTPage: false,
        settingsProfile: PROFILE_CHATGPT,
        processedParagraph: { element: null, originalHTML: '', wordSpans: [], wordOffsets: [] },

        CONFIG: {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, .markdown, div[class*="content"], article',
            // Add #content-root and all its descendants to ignore list
            IGNORE_SELECTORS: '.settings-header, nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-tts-ui], pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token, #thread-bottom-container, #content-root, #content-root *',
            SPEECH_RATE: 5,
            QUEUE_LOOKAHEAD: 3,
            NAV_READ_DELAY_MS: 0,
            NAV_THROTTLE_MS: 20,
            NAV_FOCUS_HOLD_MS: 800,
            NAV_KEYUP_READ_DELAY_MS: 150,
            NAV_FOCUS_FADE_MS: 800,
            NAV_STATUS_VISIBLE_MS: 1200,
            SCROLL_THROTTLE_MS: 250,
            SCROLL_EDGE_PADDING: 80,
            AUTO_SCROLL_ENABLED: true,
            SHOW_PAGE_OVERLAY: true,
            OVERLAY_POSITION: null,
            AUTO_SCROLL_MODE: 'paragraph',
            AUTO_SCROLL_INTERVAL_MS: 2000,
            AUTO_SCROLL_USER_PAUSE_MS: 2000,
            AUTO_SCROLL_SUPPRESS_SCROLL_MS: 400,
            WORD_HIGHLIGHT_ENABLED: true,
            GAP_TRIM_ENABLED: true,
            READ_USER_MESSAGES: false,
            READ_REFERENCES: false,
            REFERENCE_SELECTORS: '[data-testid="webpage-citation-pill"], [data-testid*="citation"], .webpage-citation-pill, .citation-pill, [data-source], cite',
            PREWRAP_IDLE_TIMEOUT_MS: 250,
            DEFERRED_REVERT_IDLE_MS: 250,
            SHOW_DIAGNOSTICS_PANEL: true,
            AUTO_READ_NEW_MESSAGES: false,
            AUTO_READ_COOLDOWN_MS: 1500,
            AUTO_READ_STABLE_MS: 800,
            AUTO_READ_MIN_PARAGRAPHS: 3,
            WAIT_FOR_MORE_MS: 8000,
            WAIT_RETRY_MS: 250,
            LOOP_WAIT_MS: 1200,
            LOOP_ON_END: true,
            VOLUME_BOOST_ENABLED: true,
            VOLUME_BOOST_LEVEL: 1.3,
            ENTER_TO_SEND_ENABLED: true,
            ENTER_TO_SEND_DOUBLE_PRESS_MS: 300,
            GLOBAL_PASTE_ENABLED: true,
            REGULAR_PASTE_ENABLED: true,
            REGULAR_AUTO_SEND: false,
            REGULAR_AUTO_SEND_IN_INPUT: false,
            NICE_AUTO_PASTE_ENABLED: true,
            NICE_AUTO_SEND: false,
            COPY_BUTTON_ENABLED: true,
            DOUBLE_CLICK_EDIT_ENABLED: true,
            AUTO_CLOSE_LIMIT_WARNING: true,
            LIMIT_WARNING_DELAY_MS: 1500,
            HOTKEYS: { ACTIVATE: 'U', PAUSE_RESUME: 'P', NAV_NEXT: 'ArrowRight', NAV_PREV: 'ArrowLeft', STOP: 'Escape' },
            EMOJI_REGEX: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/ug
        },

        init() {
            this.settingsProfile = getCurrentProfile();
            this.detectContext();
            this.waitForPageLoad();
            this.createUI();
            this.setupEventListeners();
            this.loadVoices();
            this.initParagraphObserver();
            this.initMediaEnhancements();
            if (this.isChatGPTPage) {
                this.initChatGPTEnhancements();
                this.initAutoReadObserver();
            }
        },

        detectContext() {
            const host = (window.location && window.location.hostname) ? window.location.hostname : '';
            const isChatGPTHost = host === 'chat.openai.com' || host === 'chatgpt.com';
            this.isChatGPTPage = isChatGPTHost;
            if (!this.isChatGPTPage) {
                this.CONFIG.CANDIDATE_SELECTORS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, code, article, section, main, div';
                this.CONFIG.IGNORE_SELECTORS = 'script, style, noscript, [aria-hidden="true"], [data-tts-ui]';
                this.CONFIG.AUTO_READ_NEW_MESSAGES = false;
                this.CONFIG.AUTO_READ_MIN_PARAGRAPHS = 0;
                this.CONFIG.AUTO_READ_STABLE_MS = 0;
                this.CONFIG.SHOW_DIAGNOSTICS_PANEL = false;
                this.CONFIG.WAIT_FOR_MORE_MS = 0;
                this.CONFIG.LOOP_WAIT_MS = 0;
            }
        },

        initMediaEnhancements() {
            if (this.mediaObserver) return;
            const run = () => this.handleMediaElements();
            this.mediaObserver = new MutationObserver(run);
            this.mediaObserver.observe(document.body, { childList: true, subtree: true });
            run();
        },

        initChatGPTEnhancements() {
            if (!this.isChatGPTPage) return;
            if (!this.pasteHandler) {
                this.pasteHandler = (event) => this.handleGlobalPaste(event);
                document.addEventListener('paste', this.pasteHandler, true);
            }

            if (!this.copyObserver) {
                this.copyObserver = new MutationObserver(() => this.updateCopyButtons());
                this.copyObserver.observe(document.body, { childList: true, subtree: true });
            }
            this.updateCopyButtons();

            if (!this.editObserver) {
                this.editObserver = new MutationObserver(() => this.attachDoubleClickListeners());
                this.editObserver.observe(document.body, { childList: true, subtree: true });
            }
            this.attachDoubleClickListeners();

            if (!this.limitWarningObserver) {
                this.limitWarningObserver = new MutationObserver(() => this.checkAndCloseLimitWarnings());
                this.limitWarningObserver.observe(document.body, { childList: true, subtree: true });
            }
            this.checkAndCloseLimitWarnings();
        },

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

        findSendButton() {
            const selectors = [
                'button[aria-label="Send prompt"]',
                'button[data-testid="send-button"]',
                'button.btn.relative.btn-primary:not([aria-label="Dictate button"])'
            ];
            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled) return button;
            }
            return null;
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
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            };

            const modal = Array.from(document.querySelectorAll('[role="dialog"]')).find(visible);
            if (modal) return true;

            const menu = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [data-state="open"]')).find(visible);
            if (menu) return true;

            const editBox = document.querySelector('.bg-token-main-surface-tertiary textarea');
            if (editBox && editBox.offsetParent !== null) return true;

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
                    sendButton.click();
                }
                this.lastEnterPressTime = 0;
                return;
            }
            this.lastEnterPressTime = now;
        },

        boostMediaElement(mediaElement) {
            if (!mediaElement || !this.CONFIG.VOLUME_BOOST_ENABLED) return;
            if (!this.audioContexts.has(mediaElement)) {
                try {
                    const Ctx = window.AudioContext || window.webkitAudioContext;
                    if (!Ctx) return;
                    const ctx = new Ctx();
                    const source = ctx.createMediaElementSource(mediaElement);
                    const gainNode = ctx.createGain();
                    source.connect(gainNode);
                    gainNode.connect(ctx.destination);
                    this.audioContexts.set(mediaElement, { ctx, gainNode });
                } catch (error) {
                    console.warn('Volume boost unavailable for media element:', error);
                    return;
                }
            }

            const audio = this.audioContexts.get(mediaElement);
            if (!audio) return;
            audio.gainNode.gain.value = this.CONFIG.VOLUME_BOOST_LEVEL;
            mediaElement.volume = 1;
            if (audio.ctx.state === 'suspended') {
                audio.ctx.resume().catch(() => {});
            }
        },

        updateVolumeBoostForTrackedMedia() {
            for (const [mediaElement, audio] of this.audioContexts.entries()) {
                if (!mediaElement || !mediaElement.isConnected) {
                    try {
                        if (audio && audio.ctx && typeof audio.ctx.close === 'function') {
                            audio.ctx.close();
                        }
                    } catch (_err) {}
                    this.audioContexts.delete(mediaElement);
                    continue;
                }
                audio.gainNode.gain.value = this.CONFIG.VOLUME_BOOST_ENABLED ? this.CONFIG.VOLUME_BOOST_LEVEL : 1;
            }
        },

        handleMediaElements() {
            const mediaElements = document.querySelectorAll('video, audio');
            mediaElements.forEach((mediaElement) => {
                if (mediaElement.dataset.ttsVolumeBound !== '1') {
                    mediaElement.dataset.ttsVolumeBound = '1';
                    mediaElement.addEventListener('play', () => this.boostMediaElement(mediaElement));
                }
                if (!mediaElement.paused) {
                    this.boostMediaElement(mediaElement);
                }
            });
            this.updateVolumeBoostForTrackedMedia();
        },

        setVolumeBoostEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.VOLUME_BOOST_ENABLED === nextValue) return;
            this.CONFIG.VOLUME_BOOST_ENABLED = nextValue;
            if (nextValue) {
                this.handleMediaElements();
            }
            this.updateVolumeBoostForTrackedMedia();
            if (!silent) {
                this.showNotification(`Volume boost ${this.CONFIG.VOLUME_BOOST_ENABLED ? 'on' : 'off'}`);
            }
        },

        setVolumeBoostLevel(level, silent = false) {
            const parsed = Number(level);
            if (!Number.isFinite(parsed)) return;
            const clamped = Math.max(1, Math.min(2, parsed));
            this.CONFIG.VOLUME_BOOST_LEVEL = clamped;
            this.updateVolumeBoostForTrackedMedia();
            if (!silent) {
                this.showNotification(`Volume boost ${clamped.toFixed(1)}x`);
            }
        },

        setEnterToSendEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.ENTER_TO_SEND_ENABLED === nextValue) return;
            this.CONFIG.ENTER_TO_SEND_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Enter-to-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        setGlobalPasteEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.GLOBAL_PASTE_ENABLED === nextValue) return;
            this.CONFIG.GLOBAL_PASTE_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Global paste ${nextValue ? 'on' : 'off'}`);
            }
        },

        setRegularPasteEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.REGULAR_PASTE_ENABLED === nextValue) return;
            this.CONFIG.REGULAR_PASTE_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Regular paste ${nextValue ? 'on' : 'off'}`);
            }
        },

        setRegularAutoSendEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.REGULAR_AUTO_SEND === nextValue) return;
            this.CONFIG.REGULAR_AUTO_SEND = nextValue;
            if (!silent) {
                this.showNotification(`Regular auto-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        setRegularAutoSendInInputEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.REGULAR_AUTO_SEND_IN_INPUT === nextValue) return;
            this.CONFIG.REGULAR_AUTO_SEND_IN_INPUT = nextValue;
            if (!silent) {
                this.showNotification(`Textbox auto-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        setNiceAutoPasteEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.NICE_AUTO_PASTE_ENABLED === nextValue) return;
            this.CONFIG.NICE_AUTO_PASTE_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`NICE auto-paste ${nextValue ? 'on' : 'off'}`);
            }
        },

        setNiceAutoSendEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.NICE_AUTO_SEND === nextValue) return;
            this.CONFIG.NICE_AUTO_SEND = nextValue;
            if (!silent) {
                this.showNotification(`NICE auto-send ${nextValue ? 'on' : 'off'}`);
            }
        },

        addCopyButton(target) {
            if (!target || !target.isConnected) return;

            const existingRow = target.querySelector('.tmx-copy-row');
            if (existingRow) return;
            target.querySelectorAll('.tmx-copy-button').forEach((button) => button.remove());

            const row = document.createElement('div');
            row.className = 'tmx-copy-row';
            row.style.cssText = 'display:flex; justify-content:flex-end; margin-top:8px;';
            const copyButton = document.createElement('button');
            copyButton.className = 'tmx-copy-button';
            copyButton.type = 'button';
            copyButton.textContent = 'Copy';
            copyButton.style.cssText = 'padding:3px 8px; font-size:12px; line-height:1.2; border:none; border-radius:6px; background:#0b5ed7; color:#fff; cursor:pointer;';
            copyButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const clone = target.cloneNode(true);
                clone.querySelectorAll('.tmx-copy-row, .tmx-copy-button').forEach((node) => node.remove());
                const text = (clone.innerText || clone.textContent || '').trim();
                if (!text) return;
                navigator.clipboard.writeText(text)
                    .then(() => this.showNotification('Copied to clipboard.'))
                    .catch(() => this.showNotification('Copy failed.'));
            });

            row.appendChild(copyButton);
            target.appendChild(row);
        },

        removeCopyButtons() {
            document.querySelectorAll('.tmx-copy-row, .tmx-copy-button').forEach((node) => node.remove());
        },

        updateCopyButtons() {
            if (!this.isChatGPTPage) return;
            if (!this.CONFIG.COPY_BUTTON_ENABLED) {
                this.removeCopyButtons();
                return;
            }
            document.querySelectorAll('.whitespace-pre-wrap').forEach((target) => this.addCopyButton(target));
        },

        setCopyButtonEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.COPY_BUTTON_ENABLED === nextValue) return;
            this.CONFIG.COPY_BUTTON_ENABLED = nextValue;
            this.updateCopyButtons();
            if (!silent) {
                this.showNotification(`Copy buttons ${nextValue ? 'on' : 'off'}`);
            }
        },

        handleDoubleClickEdit(event) {
            if (!this.isChatGPTPage || !this.CONFIG.DOUBLE_CLICK_EDIT_ENABLED) return;
            const messageContainer = event.target.closest('.group\\/conversation-turn, [data-message-author-role="user"]');
            if (!messageContainer) return;
            const editButton = messageContainer.querySelector('button[aria-label="Edit message"]');
            if (!editButton) return;
            editButton.click();
            setTimeout(() => {
                const editor = document.querySelector('textarea, [contenteditable="true"]');
                if (editor) editor.focus();
            }, 80);
        },

        attachDoubleClickListeners() {
            if (!this.isChatGPTPage) return;
            const containers = document.querySelectorAll('.group\\/conversation-turn, .group\\/turn-messages, [data-message-author-role]');
            containers.forEach((container) => {
                if (container.dataset.tmxEditListener === '1') return;
                container.dataset.tmxEditListener = '1';
                container.addEventListener('dblclick', (event) => this.handleDoubleClickEdit(event));
            });
        },

        setDoubleClickEditEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.DOUBLE_CLICK_EDIT_ENABLED === nextValue) return;
            this.CONFIG.DOUBLE_CLICK_EDIT_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Double-click edit ${nextValue ? 'on' : 'off'}`);
            }
        },

        checkAndCloseLimitWarnings() {
            if (!this.isChatGPTPage || !this.CONFIG.AUTO_CLOSE_LIMIT_WARNING) return;
            const closeButtons = Array.from(document.querySelectorAll('button[data-testid="close-button"]'));
            closeButtons.forEach((button) => {
                if (button.dataset.tmxLimitCloseScheduled === '1') return;
                const text = (button.closest('div')?.textContent || '').toLowerCase();
                if (!/(limit|usage|cap|plan)/.test(text)) return;
                button.dataset.tmxLimitCloseScheduled = '1';
                setTimeout(() => {
                    if (this.CONFIG.AUTO_CLOSE_LIMIT_WARNING && button.isConnected) {
                        button.click();
                    }
                    delete button.dataset.tmxLimitCloseScheduled;
                }, this.CONFIG.LIMIT_WARNING_DELAY_MS);
            });
        },

        setAutoCloseLimitWarningEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.AUTO_CLOSE_LIMIT_WARNING === nextValue) return;
            this.CONFIG.AUTO_CLOSE_LIMIT_WARNING = nextValue;
            if (nextValue) this.checkAndCloseLimitWarnings();
            if (!silent) {
                this.showNotification(`Auto-close warning ${nextValue ? 'on' : 'off'}`);
            }
        },

        setLimitWarningDelay(delayMs, silent = false) {
            const parsed = Number(delayMs);
            if (!Number.isFinite(parsed)) return;
            const clamped = Math.max(100, Math.round(parsed));
            this.CONFIG.LIMIT_WARNING_DELAY_MS = clamped;
            if (!silent) {
                this.showNotification(`Warning delay ${clamped} ms`);
            }
        },

        // ... (All functions from waitForPageLoad to triggerTTS are unchanged) ...
        waitForPageLoad() {
            if (document.readyState === 'complete') {
                setTimeout(() => { this.pageFullyLoaded = true; }, 1000);
            } else {
                window.addEventListener('load', () => setTimeout(() => { this.pageFullyLoaded = true; }, 2000));
            }
        },

        loadVoices() {
            return new Promise((resolve) => {
                const voices = this.speechSynthesis.getVoices();
                if (voices.length > 0) resolve(voices);
                else this.speechSynthesis.onvoiceschanged = () => resolve(this.speechSynthesis.getVoices());
            });
        },

        initParagraphObserver() {
            if (this.paragraphObserver) return;
            this.paragraphObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        this.paragraphsDirty = true;
                        if (this.waitingForMoreContent) {
                            this.scheduleWaitForMore();
                        }
                        break;
                    }
                }
            });
            this.paragraphObserver.observe(document.body, { childList: true, subtree: true });
        },

        refreshParagraphsIfNeeded(force = false) {
            if (!force && !this.paragraphsDirty && this.paragraphsList.length > 0) return;
            this.paragraphsList = this.findAllParagraphs();
            this.paragraphsDirty = false;
            this.prunePrewrappedParagraphs();
        },

        refreshParagraphIndex(currentIndex) {
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (this.lastSpokenElement) {
                const idx = this.paragraphsList.findIndex(p => p.element === this.lastSpokenElement);
                if (idx !== -1) return idx;
            }
            return currentIndex;
        },

        cleanTextForTTS(text) {
            return text.replace(this.CONFIG.EMOJI_REGEX, '').replace(/\s+/g, ' ');
        },

        trimGapForParagraphEnd(text) {
            if (!this.CONFIG.GAP_TRIM_ENABLED) return text;
            let trimmed = text.replace(/\s+$/g, '');
            trimmed = trimmed.replace(/[.!?]+$/g, '');
            return trimmed.replace(/\s+$/g, '');
        },

        getTextFromElement(element) {
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
                    rawText = clone.textContent || '';
                } else {
                    rawText = element.textContent || '';
                }
            } else {
                rawText = element.textContent || '';
            }
            const cleaned = this.cleanTextForTTS(rawText);
            return this.trimGapForParagraphEnd(cleaned);
        },

        isVisiblyReadable(element) {
            if (!element || !element.tagName || element.offsetParent === null || window.getComputedStyle(element).visibility === 'hidden' || window.getComputedStyle(element).display === 'none') {
                return false;
            }
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            if (this.isChatGPTPage && !this.CONFIG.READ_USER_MESSAGES && element.closest('[data-message-author-role="user"]')) return false;
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

            return finalParagraphs.map(element => ({
                element: element,
                text: this.getTextFromElement(element)
            }));
        },

        clearHighlights(keepFading = false) {
            const selectors = ['.tts-current-sentence', '.tts-current-word'];
            if (!keepFading) {
                selectors.push('.tts-navigation-focus', '.tts-focus-fade-out', '.tts-navigation-ping');
            }
            document.querySelectorAll(selectors.join(', ')).forEach(el => {
                el.classList.remove(...selectors.map(s => s.substring(1)));
            });
            this.currentWordSpan = null;
        },

        revertParagraph() {
            const { element, originalHTML } = this.processedParagraph;
            if (element && originalHTML) {
                element.innerHTML = originalHTML;
            }
            this.processedParagraph = { element: null, originalHTML: '', wordSpans: [], wordOffsets: [] };
            this.clearHighlights();
        },

        prepareParagraphForReading(paraElement) {
            if (this.processedParagraph.element && this.processedParagraph.element !== paraElement) {
                this.deferProcessedParagraphRevert();
            }
            if (!paraElement || !paraElement.parentNode) return null;

            if (!this.wordHighlightActiveForCurrent) {
                return this.getTextFromElement(paraElement);
            }

            const cached = this.prewrappedParagraphs.get(paraElement);
            if (cached) {
                this.processedParagraph.element = paraElement;
                this.processedParagraph.originalHTML = cached.originalHTML;
                this.processedParagraph.wordSpans = cached.wordSpans;
                this.processedParagraph.wordOffsets = cached.wordOffsets;
                this.prewrappedParagraphs.delete(paraElement);
                return this.processedParagraph.wordSpans.map(s => s.textContent).join(' ');
            }

            this.processedParagraph.element = paraElement;
            this.processedParagraph.originalHTML = paraElement.innerHTML;
            const wordSpans = [];
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];
            while(walker.nextNode()) {
                if (walker.currentNode.textContent.trim().length > 0) nodesToProcess.push(walker.currentNode);
            }

            nodesToProcess.forEach(node => {
                const fragment = document.createDocumentFragment();
                const cleanedText = this.cleanTextForTTS(node.textContent);
                const parts = cleanedText.split(/(\s+)/);

                parts.forEach(part => {
                    if (/\S/.test(part)) {
                        const span = document.createElement('span');
                        span.textContent = part;
                        fragment.appendChild(span);
                        wordSpans.push(span);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                if (node.parentNode) node.parentNode.replaceChild(fragment, node);
            });

            this.processedParagraph.wordSpans = wordSpans;
            const wordOffsets = new Array(wordSpans.length);
            let offset = 0;
            for (let i = 0; i < wordSpans.length; i++) {
                wordOffsets[i] = offset;
                offset += wordSpans[i].textContent.length + 1;
            }
            this.processedParagraph.wordOffsets = wordOffsets;
            return this.processedParagraph.wordSpans.map(s => s.textContent).join(' ');
        },

        prewrapParagraph(paraElement) {
            if (!paraElement || !paraElement.parentNode) return null;
            if (this.prewrappedParagraphs.has(paraElement)) return this.prewrappedParagraphs.get(paraElement);

            const originalHTML = paraElement.innerHTML;
            const wordSpans = [];
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];
            while(walker.nextNode()) {
                if (walker.currentNode.textContent.trim().length > 0) nodesToProcess.push(walker.currentNode);
            }

            nodesToProcess.forEach(node => {
                const fragment = document.createDocumentFragment();
                const cleanedText = this.cleanTextForTTS(node.textContent);
                const parts = cleanedText.split(/(\s+)/);

                parts.forEach(part => {
                    if (/\S/.test(part)) {
                        const span = document.createElement('span');
                        span.textContent = part;
                        fragment.appendChild(span);
                        wordSpans.push(span);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                if (node.parentNode) node.parentNode.replaceChild(fragment, node);
            });

            const wordOffsets = new Array(wordSpans.length);
            let offset = 0;
            for (let i = 0; i < wordSpans.length; i++) {
                wordOffsets[i] = offset;
                offset += wordSpans[i].textContent.length + 1;
            }

            const data = { element: paraElement, originalHTML, wordSpans, wordOffsets };
            this.prewrappedParagraphs.set(paraElement, data);
            return data;
        },

        prewrapNextParagraph(currentIndex) {
            if (!this.continuousReadingActive) return;
            const nextIndex = currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) return;
            const nextElement = this.paragraphsList[nextIndex].element;
            if (!nextElement) return;
            if (!this.shouldHighlightWordsForElement(nextElement)) return;

            const schedule = () => this.prewrapParagraph(nextElement);
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => schedule(), { timeout: this.CONFIG.PREWRAP_IDLE_TIMEOUT_MS });
            } else {
                setTimeout(schedule, 0);
            }
        },

        prunePrewrappedParagraphs() {
            if (this.prewrappedParagraphs.size === 0) return;
            const validElements = new Set(this.paragraphsList.map(p => p.element));
            for (const [element, data] of this.prewrappedParagraphs.entries()) {
                const isValid = element && element.isConnected && validElements.has(element);
                if (!isValid) {
                    if (element && element.isConnected && data.originalHTML) {
                        element.innerHTML = data.originalHTML;
                    }
                    this.prewrappedParagraphs.delete(element);
                }
            }
        },

        clearPrewrappedParagraphs() {
            if (this.prewrappedParagraphs.size === 0) return;
            for (const [element, data] of this.prewrappedParagraphs.entries()) {
                if (element && element.isConnected && data.originalHTML) {
                    element.innerHTML = data.originalHTML;
                }
            }
            this.prewrappedParagraphs.clear();
        },

        deferProcessedParagraphRevert() {
            const { element, originalHTML } = this.processedParagraph;
            if (element && originalHTML) {
                this.pendingReverts.push({ element, originalHTML });
                this.schedulePendingRevert();
            }
            this.processedParagraph = { element: null, originalHTML: '', wordSpans: [], wordOffsets: [] };
            this.currentWordSpan = null;
        },

        schedulePendingRevert() {
            if (this.pendingRevertId) return;
            const run = () => {
                this.pendingRevertId = null;
                this.pendingRevertUsesIdle = false;
                if (this.pendingReverts.length === 0) return;
                const next = this.pendingReverts.shift();
                if (next && next.element && next.element.isConnected && next.originalHTML) {
                    next.element.innerHTML = next.originalHTML;
                }
                if (this.pendingReverts.length > 0) {
                    this.schedulePendingRevert();
                }
            };

            if ('requestIdleCallback' in window) {
                this.pendingRevertUsesIdle = true;
                this.pendingRevertId = requestIdleCallback(run, { timeout: this.CONFIG.DEFERRED_REVERT_IDLE_MS });
            } else {
                this.pendingRevertUsesIdle = false;
                this.pendingRevertId = setTimeout(run, this.CONFIG.DEFERRED_REVERT_IDLE_MS);
            }
        },

        cancelPendingRevert() {
            if (!this.pendingRevertId) return;
            if (this.pendingRevertUsesIdle && 'cancelIdleCallback' in window) {
                cancelIdleCallback(this.pendingRevertId);
            } else {
                clearTimeout(this.pendingRevertId);
            }
            this.pendingRevertId = null;
            this.pendingRevertUsesIdle = false;
        },

        flushPendingReverts() {
            this.cancelPendingRevert();
            while (this.pendingReverts.length > 0) {
                const next = this.pendingReverts.shift();
                if (next && next.element && next.element.isConnected && next.originalHTML) {
                    next.element.innerHTML = next.originalHTML;
                }
            }
        },

        updateDiagnosticsPanel() {
            if (!this.diagnosticsPanel) return;
            const gap = this.lastGapMs === null ? '--' : Math.round(this.lastGapMs);
            const wrap = this.lastWrapMs === null ? '--' : Math.round(this.lastWrapMs);
            this.diagnosticsPanel.textContent = `gap: ${gap} ms | wrap: ${wrap} ms`;
        },

        updateProgressPanel(forceHide = false) {
            if (!this.progressPanel) return;
            if (forceHide || (!this.ttsActive && !this.continuousReadingActive) || this.currentParagraphIndex < 0) {
                this.progressPanel.style.opacity = '0';
                return;
            }
            const total = this.paragraphsList.length;
            const current = this.currentParagraphIndex >= 0 ? this.currentParagraphIndex + 1 : 0;
            this.progressPanel.textContent = `Reading ${current}/${total}`;
            this.progressPanel.style.opacity = '1';
        },

        showNavigationStatus(index, direction = 0) {
            if (!this.navigationPanel) return;
            const total = this.paragraphsList.length;
            const current = index + 1;
            const arrow = direction > 0 ? '↓' : direction < 0 ? '↑' : '•';
            const para = this.paragraphsList[index];
            let snippet = para && para.text ? para.text.replace(/\s+/g, ' ').trim() : '';
            if (snippet.length > 72) {
                snippet = `${snippet.slice(0, 72)}...`;
            }
            this.navigationPanel.textContent = snippet
                ? `${arrow} ${current}/${total} ${snippet}`
                : `${arrow} ${current}/${total}`;
            this.navigationPanel.style.opacity = '1';
            this.navigationPanel.style.transform = 'translateX(-50%) translateY(0)';
            if (this.navigationPanelHideId) {
                clearTimeout(this.navigationPanelHideId);
            }
            this.navigationPanelHideId = setTimeout(() => {
                this.navigationPanelHideId = null;
                this.hideNavigationStatus();
            }, this.CONFIG.NAV_STATUS_VISIBLE_MS);
        },

        hideNavigationStatus(force = false) {
            if (!this.navigationPanel) return;
            if (force && this.navigationPanelHideId) {
                clearTimeout(this.navigationPanelHideId);
                this.navigationPanelHideId = null;
            }
            this.navigationPanel.style.opacity = '0';
            this.navigationPanel.style.transform = 'translateX(-50%) translateY(8px)';
        },

        triggerNavigationPulse(element) {
            if (!element) return;
            element.classList.remove('tts-navigation-ping');
            void element.offsetWidth;
            element.classList.add('tts-navigation-ping');
            setTimeout(() => {
                if (element && element.isConnected) {
                    element.classList.remove('tts-navigation-ping');
                }
            }, 450);
        },

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

            const startIndex = this.paragraphsList.findIndex(p => messageElement.contains(p.element));
            if (startIndex === -1) return;

            this.lastAutoReadMessageElement = messageElement;
            this.lastAutoReadTriggeredAt = now;
            this.continuousReadingActive = true;
            this.readFromParagraph(startIndex);
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

            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }
            this.continuousReadingActive = true;
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

            const idx = this.findWordIndexByChar(event.charIndex);
            if (idx === -1) return;
            const span = this.processedParagraph.wordSpans[idx];
            if (!span) return;
            span.classList.add('tts-current-word');
            this.currentWordSpan = span;
        },

        triggerTTS(text, onComplete = null) {
            if (!text || text.length === 0) {
                if (onComplete) onComplete();
                return;
            }

            this.ttsActive = true;
            this.isPaused = false;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.CONFIG.SPEECH_RATE;
            utterance.volume = 0.9;
            const voices = this.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Ava') && !v.name.includes('Multilingual')) || voices.find(v => v.lang.startsWith('en'));
            if(preferredVoice) utterance.voice = preferredVoice;

            if (this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                utterance.onboundary = (event) => this.highlightCurrentWord(event);
            }

            utterance.onend = () => {
                this.ttsActive = false;
                if (onComplete && this.continuousReadingActive) {
                    onComplete();
                } else {
                    this.stopTTS(false);
                }
            };
            utterance.onerror = (e) => {
                console.error("Speech Synthesis Error:", e);
                this.ttsActive = false;
                this.revertParagraph();
                if (onComplete && this.continuousReadingActive) onComplete();
            };

            this.speechSynthesis.speak(utterance);
        },

        enqueueParagraph(index) {
            if (!this.continuousReadingActive) return;
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (index < 0 || index >= this.paragraphsList.length) return;
            if (this.queuedParagraphs.has(index)) return;

            const para = this.paragraphsList[index];
            if (!para || !para.element || !para.text) return;

            const utterance = new SpeechSynthesisUtterance(para.text);
            utterance.rate = this.CONFIG.SPEECH_RATE;
            utterance.volume = 0.9;
            const voices = this.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Ava') && !v.name.includes('Multilingual')) || voices.find(v => v.lang.startsWith('en'));
            if (preferredVoice) utterance.voice = preferredVoice;

            utterance.onstart = () => this.onUtteranceStart(index);
            if (this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                utterance.onboundary = (event) => this.highlightCurrentWord(event);
            }
            utterance.onend = () => this.onUtteranceEnd(index);
            utterance.onerror = (e) => this.onUtteranceError(index, e);

            this.queuedParagraphs.add(index);
            this.speechSynthesis.speak(utterance);
        },

        queueFromIndex(startIndex) {
            this.queuedParagraphs.clear();
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }
            const maxIndex = Math.min(this.paragraphsList.length - 1, startIndex + this.CONFIG.QUEUE_LOOKAHEAD);
            for (let i = startIndex; i <= maxIndex; i++) {
                this.enqueueParagraph(i);
            }
        },

        onUtteranceStart(index) {
            this.ttsActive = true;
            this.isPaused = false;
            this.hideNavigationStatus(true);

            const startTime = performance.now();
            this.lastGapMs = this.lastUtteranceEndTime ? startTime - this.lastUtteranceEndTime : null;

            this.currentParagraphIndex = index;
            const para = this.paragraphsList[index];
            if (!para || !para.element) return;

            this.wordHighlightActiveForCurrent = this.shouldHighlightWordsForElement(para.element);
            this.lastSpokenElement = para.element;
            this.startAutoScroll();
            this.maybeAutoScrollOnStart();

            const wrapStart = performance.now();
            const textToRead = this.prepareParagraphForReading(para.element);
            this.lastWrapMs = performance.now() - wrapStart;
            this.updateDiagnosticsPanel();
            this.updateProgressPanel();
            if (!textToRead) return;

            this.clearHighlights(true);
            para.element.classList.add('tts-current-sentence');

            if (this.pointerLoopId) cancelAnimationFrame(this.pointerLoopId);
            this.updatePointerArrow();
            this.prewrapNextParagraph(index);
            this.prewarmNextUtterance(index);
        },

        onUtteranceEnd(index) {
            this.ttsActive = false;
            this.queuedParagraphs.delete(index);
            this.lastUtteranceEndTime = performance.now();
            this.clearHighlights(true);
            this.deferProcessedParagraphRevert();

            if (!this.continuousReadingActive) return;

            const refreshedIndex = this.refreshParagraphIndex(index);
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
        },

        onUtteranceError(index, error) {
            console.error('Speech Synthesis Error:', error);
            this.ttsActive = false;
            this.queuedParagraphs.delete(index);
            this.flushPendingReverts();
            this.revertParagraph();
            if (!this.continuousReadingActive) return;

            const nextIndex = index + 1;
            this.enqueueParagraph(nextIndex);
        },

        prewarmNextUtterance(index) {
            if (!this.continuousReadingActive) return;
            let nextIndex = index + this.CONFIG.QUEUE_LOOKAHEAD + 1;
            if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) {
                if (this.paragraphsDirty) {
                    this.refreshParagraphsIfNeeded(true);
                }
                if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) return;
            }
            this.enqueueParagraph(nextIndex);
        },

        readFromParagraph(index) {
            if (!this.continuousReadingActive) {
                this.revertParagraph();
                return;
            }

            if (index < 0 || index >= this.paragraphsList.length) {
                this.stopTTS(false);
                return;
            }

            this.queueFromIndex(index);
        },

        stopTTS(notify = true) {
            this.continuousReadingActive = false;
            clearTimeout(this.navigationTimeoutId);
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.speechSynthesis.cancel();
            }
            this.queuedParagraphs.clear();
            this.waitingForMoreContent = false;
            this.waitForMoreNextIndex = -1;
            clearTimeout(this.waitForMoreTimeoutId);
            this.waitForMoreTimeoutId = null;
            this.clearPrewrappedParagraphs();
            this.flushPendingReverts();
            this.revertParagraph();
            this.currentParagraphIndex = -1;
            this.wordHighlightActiveForCurrent = false;
            this.lastUtteranceEndTime = 0;
            this.lastGapMs = null;
            this.lastWrapMs = null;

            // Stop the pointer arrow loop and hide the arrow
            if (this.pointerLoopId) {
                cancelAnimationFrame(this.pointerLoopId);
                this.pointerLoopId = null;
            }
            this.hidePointerArrow();
            this.stopAutoScroll();
            this.updateProgressPanel(true);
            this.hideNavigationStatus(true);

            if (notify) this.showNotification('All TTS stopped');
            return true;
        },

        shouldHighlightWordsForElement(element) {
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED) return false;
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            return rect.bottom > 0 && rect.top < viewportHeight;
        },

        // ... (pauseResumeTTS, navigate, startReadingOnClick, setupEventListeners are unchanged) ...
        pauseResumeTTS() {
            if (!this.speechSynthesis.speaking && !this.isPaused) return;
            if (this.isPaused) {
                this.speechSynthesis.resume();
                this.isPaused = false;
                this.showNotification('Resumed');
            } else {
                this.speechSynthesis.pause();
                this.isPaused = true;
                this.showNotification('Paused');
            }
        },

        navigate(direction, options = {}) {
            const previewOnly = options.previewOnly === true;
            if (this.isNavigating) return;
            this.isNavigating = true;
            setTimeout(() => { this.isNavigating = false; }, this.CONFIG.NAV_THROTTLE_MS);

            this.stopTTS(false);

            this.refreshParagraphsIfNeeded(false);
            if (this.paragraphsList.length === 0) return this.showNotification("No readable text found.");

            const currentFocus = document.querySelector('.tts-navigation-focus');
            if(currentFocus) {
                currentFocus.classList.remove('tts-navigation-focus');
                currentFocus.classList.add('tts-focus-fade-out');
                setTimeout(() => currentFocus.classList.remove('tts-focus-fade-out'), this.CONFIG.NAV_FOCUS_FADE_MS);
            }

            let currentIndex = this.currentParagraphIndex;
            if (currentIndex < 0 || currentIndex >= this.paragraphsList.length || (this.lastSpokenElement && this.paragraphsList[currentIndex].element !== this.lastSpokenElement)) {
                currentIndex = this.lastSpokenElement
                    ? this.paragraphsList.findIndex(p => p.element === this.lastSpokenElement)
                    : -1;
            }

            if (currentIndex === -1) {
                const threshold = window.innerHeight * 0.2;
                currentIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
                currentIndex = (currentIndex === -1) ? 0 : currentIndex - 1;
            }

            const newIndex = currentIndex + direction;

            if (newIndex >= 0 && newIndex < this.paragraphsList.length) {
                const targetElement = this.paragraphsList[newIndex].element;
                this.clearHighlights(true);
                targetElement.classList.add('tts-navigation-focus');
                this.triggerNavigationPulse(targetElement);
                this.gentleScrollToElement(targetElement); // Still useful for navigation highlight
                this.lastSpokenElement = targetElement;
                this.showNavigationStatus(newIndex, direction);

                this.pendingNavIndex = newIndex;
                clearTimeout(this.navigationTimeoutId);
                if (!previewOnly) {
                    this.navigationTimeoutId = setTimeout(() => {
                        if (this.pendingNavIndex === -1) return;
                        this.continuousReadingActive = true;
                        this.readFromParagraph(this.pendingNavIndex);
                    }, this.CONFIG.NAV_FOCUS_HOLD_MS);
                }
            } else {
                 this.showNotification(direction > 0 ? "End of page." : "Start of page.");
            }
        },

        startReadingFromPendingNav() {
            if (this.pendingNavIndex === -1) return;
            clearTimeout(this.navigationTimeoutId);
            this.navigationTimeoutId = setTimeout(() => {
                if (this.pendingNavIndex === -1) return;
                this.continuousReadingActive = true;
                this.readFromParagraph(this.pendingNavIndex);
            }, this.CONFIG.NAV_KEYUP_READ_DELAY_MS);
        },

        startReadingOnClick(event) {
            if (event.target.closest('#thread-bottom-container')) return;

            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            let startParaIndex = -1;

            const containingParagraph = this.paragraphsList.find(p => p.element.contains(event.target));
            if (containingParagraph) {
                startParaIndex = this.paragraphsList.indexOf(containingParagraph);
            } else {
                const clickY = event.clientY;
                for(let i = 0; i < this.paragraphsList.length; i++) {
                    const rect = this.paragraphsList[i].element.getBoundingClientRect();
                    if (rect.top > clickY) {
                        startParaIndex = i;
                        break;
                    }
                }
            }

            if (startParaIndex !== -1) {
                this.continuousReadingActive = true;
                this.readFromParagraph(startParaIndex);
            } else {
                this.showNotification('No readable text found at or below your click.');
            }
        },

        startReadingFromTop() {
            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }
            this.continuousReadingActive = true;
            this.readFromParagraph(0);
        },

        startReadingFromSelection() {
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString() : '';
            const cleaned = this.cleanTextForTTS(selectedText).trim();
            if (!cleaned) {
                this.showNotification('No text selected.');
                return;
            }
            this.stopTTS(false);
            this.continuousReadingActive = false;
            this.triggerTTS(cleaned);
        },

        startReadingFromViewport() {
            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }

            const threshold = window.innerHeight * 0.2;
            let startIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
            if (startIndex === -1) startIndex = 0;

            this.continuousReadingActive = true;
            this.readFromParagraph(startIndex);
        },

        navigateImmediate(direction) {
            this.navigate(direction, { previewOnly: true });
            if (this.pendingNavIndex === -1) return;
            this.continuousReadingActive = true;
            this.readFromParagraph(this.pendingNavIndex);
        },

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                this.markUserInteraction();
                this.handleEnterToSend(e);

                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
                const key = e.key;
                const shiftOnly = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
                const ctrlShift = e.ctrlKey && e.shiftKey;
                const KEY = this.CONFIG.HOTKEYS;

                switch (key) {
                    case KEY.NAV_NEXT:
                        e.preventDefault();
                        this.navKeyHeld = true;
                        this.navigate(1, { previewOnly: true });
                        break;
                    case KEY.NAV_PREV:
                        e.preventDefault();
                        this.navKeyHeld = true;
                        this.navigate(-1, { previewOnly: true });
                        break;
                    case KEY.STOP: e.preventDefault(); this.stopTTS(); break;
                }

                if (shiftOnly && key.toUpperCase() === KEY.ACTIVATE) {
                    e.preventDefault();
                    if (this.ttsActive) { this.stopTTS(); return; }
                    document.body.style.cursor = 'crosshair';
                    this.showNotification('Click where you want to start reading');

                    const clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.style.cursor = 'default';
                        this.startReadingOnClick(ev);
                    };
                    document.addEventListener('click', clickHandler, { once: true, capture: true });
                } else if (ctrlShift && key.toUpperCase() === KEY.PAUSE_RESUME) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                }
            });
            document.addEventListener('keyup', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;

                const key = e.key;
                const KEY = this.CONFIG.HOTKEYS;
                if (key === KEY.NAV_NEXT || key === KEY.NAV_PREV) {
                    e.preventDefault();
                    this.navKeyHeld = false;
                    this.startReadingFromPendingNav();
                }
            });
            const interactionHandler = () => this.markUserInteraction();
            window.addEventListener('wheel', interactionHandler, { passive: true });
            window.addEventListener('touchstart', interactionHandler, { passive: true });
            window.addEventListener('pointerdown', interactionHandler, { passive: true });
            window.addEventListener('scroll', () => {
                if (!this.autoScrollInProgress) this.markUserInteraction();
            }, { passive: true });
            window.addEventListener('resize', () => {
                this.applyOverlayPanelPosition(this.CONFIG.OVERLAY_POSITION);
            });
            window.addEventListener('beforeunload', () => this.stopTTS(false));
        },

        // --- UI AND POINTER LOGIC ---

        createUI() {
            document.documentElement.style.setProperty('--tts-focus-fade-ms', `${this.CONFIG.NAV_FOCUS_FADE_MS}ms`);
            const style = document.createElement('style');
            style.textContent = `
                /* ... (highlighting styles are the same) ... */
                .tts-current-sentence { background-color: rgba(46, 204, 113, 0.08) !important; box-shadow: inset 4px 0 0 #2ecc71 !important; transition: background-color 0.3s, box-shadow 0.3s; }
                .tts-current-word { background-color: rgba(250, 210, 50, 0.9) !important; font-weight: bold !important; color: black !important; border-radius: 3px; transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: background-color 0.1s, transform 0.1s; }
                .tts-navigation-focus { background-color: rgba(52, 152, 219, 0.3) !important; box-shadow: inset 4px 0 0 #3498db !important; transition: background-color 0.3s, box-shadow 0.3s; }
                .tts-focus-fade-out { box-shadow: none !important; background-color: transparent !important; transition: background-color var(--tts-focus-fade-ms, 500ms) ease, box-shadow var(--tts-focus-fade-ms, 500ms) ease; }
                .tts-navigation-ping { animation: tts-nav-ping 0.42s ease-out; }
                @keyframes tts-nav-ping {
                    from { box-shadow: inset 4px 0 0 #3498db, 0 0 0 0 rgba(52, 152, 219, 0.55); }
                    to { box-shadow: inset 4px 0 0 #3498db, 0 0 0 14px rgba(52, 152, 219, 0); }
                }
                .tts-overlay-hidden [data-tts-ui] { display: none !important; }

                /* NEW: In-game waypoint style pointer */
                #tts-pointer {
                    position: fixed;
                    width: 36px;
                    height: 44px;
                    background-color: #e74c3c;
                    opacity: 0;
                    visibility: hidden;
                    cursor: pointer;
                    z-index: 2147483646;
                    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                    filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));
                    transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.1s linear;
                    pointer-events: none; /* Hide from mouse until visible */
                }
                #tts-pointer.visible {
                    opacity: 0.9;
                    visibility: visible;
                    pointer-events: auto; /* Allow clicks when visible */
                }
                #tts-pointer:hover {
                    opacity: 1;
                    transform: scale(1.15);
                }
            `;
            document.head.appendChild(style);

            // Create the single waypoint pointer
            const pointer = document.createElement('div');
            pointer.id = 'tts-pointer';
            pointer.setAttribute('data-tts-ui', 'true');
            pointer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(pointer);

            pointer.addEventListener('click', () => {
                const currentSentence = document.querySelector('.tts-current-sentence');
                if (currentSentence) {
                    currentSentence.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            // ... (rest of the UI panel code remains the same) ...
            const uiPanel = document.createElement('div');
            uiPanel.id = 'tts-control-panel';
            uiPanel.setAttribute('data-tts-ui', 'true');
            uiPanel.setAttribute('aria-hidden', 'true');
            uiPanel.style.cssText = `position: fixed; top: 80px; left: 10%; width: 180px; padding: 8px; background: rgba(0,0,0,0.7); color: #fff; font-family: Arial, sans-serif; font-size: 13px; border-radius: 6px; cursor: move; z-index: 2147483647; user-select: none; -webkit-user-select: none;`;
            uiPanel.innerHTML = `<div style="font-weight:bold; text-align:center; margin-bottom: 5px;">TTS Reader</div><label for="tts-speed" style="display:block; margin-bottom:4px;">Speed: <span id="speed-value">${this.CONFIG.SPEECH_RATE.toFixed(1)}</span>x</label><input type="range" id="tts-speed" min="0.5" max="5" step="0.1" value="${this.CONFIG.SPEECH_RATE}" style="width:100%;"><label for="tts-highlight-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-highlight-toggle" ${this.CONFIG.WORD_HIGHLIGHT_ENABLED ? 'checked' : ''} style="margin:0;">Word highlight</label><label for="tts-gap-trim-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-gap-trim-toggle" ${this.CONFIG.GAP_TRIM_ENABLED ? 'checked' : ''} style="margin:0;">Gap trim</label><label for="tts-read-user-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-read-user-toggle" ${this.CONFIG.READ_USER_MESSAGES ? 'checked' : ''} style="margin:0;">Read user msgs</label><label for="tts-read-refs-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-read-refs-toggle" ${this.CONFIG.READ_REFERENCES ? 'checked' : ''} style="margin:0;">Read refs</label><label for="tts-auto-read-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-auto-read-toggle" ${this.CONFIG.AUTO_READ_NEW_MESSAGES ? 'checked' : ''} style="margin:0;">Auto-read new</label><label for="tts-loop-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-loop-toggle" ${this.CONFIG.LOOP_ON_END ? 'checked' : ''} style="margin:0;">Loop to top</label><label for="tts-autoscroll-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-autoscroll-toggle" ${this.CONFIG.AUTO_SCROLL_ENABLED ? 'checked' : ''} style="margin:0;">Auto-scroll</label>`;
            document.body.appendChild(uiPanel);
            this.overlayPanel = uiPanel;
            this.applyOverlayPanelPosition(this.CONFIG.OVERLAY_POSITION);

            const speedInput = document.getElementById('tts-speed');
            speedInput.addEventListener('input', e => {
                this.CONFIG.SPEECH_RATE = parseFloat(e.target.value);
                document.getElementById('speed-value').textContent = this.CONFIG.SPEECH_RATE.toFixed(1);
            });
            speedInput.addEventListener('mousedown', e => e.stopPropagation());
            const highlightToggle = document.getElementById('tts-highlight-toggle');
            highlightToggle.addEventListener('change', e => {
                this.setWordHighlightEnabled(e.target.checked);
            });
            highlightToggle.addEventListener('mousedown', e => e.stopPropagation());
            const gapTrimToggle = document.getElementById('tts-gap-trim-toggle');
            gapTrimToggle.addEventListener('change', e => {
                this.setGapTrimEnabled(e.target.checked);
            });
            gapTrimToggle.addEventListener('mousedown', e => e.stopPropagation());
            const readUserToggle = document.getElementById('tts-read-user-toggle');
            readUserToggle.addEventListener('change', e => {
                this.setReadUserMessagesEnabled(e.target.checked);
            });
            readUserToggle.addEventListener('mousedown', e => e.stopPropagation());
            const readRefsToggle = document.getElementById('tts-read-refs-toggle');
            readRefsToggle.addEventListener('change', e => {
                this.setReadReferencesEnabled(e.target.checked);
            });
            readRefsToggle.addEventListener('mousedown', e => e.stopPropagation());
            const autoReadToggle = document.getElementById('tts-auto-read-toggle');
            autoReadToggle.addEventListener('change', e => {
                this.setAutoReadEnabled(e.target.checked);
            });
            autoReadToggle.addEventListener('mousedown', e => e.stopPropagation());
            const loopToggle = document.getElementById('tts-loop-toggle');
            loopToggle.addEventListener('change', e => {
                this.setLoopEnabled(e.target.checked);
            });
            loopToggle.addEventListener('mousedown', e => e.stopPropagation());
            const autoScrollToggle = document.getElementById('tts-autoscroll-toggle');
            autoScrollToggle.addEventListener('change', e => {
                this.setAutoScrollEnabled(e.target.checked);
            });
            autoScrollToggle.addEventListener('mousedown', e => e.stopPropagation());
            this.makeDraggable(uiPanel, (position) => {
                this.setOverlayPosition(position, { persist: true, silent: true });
            });

            if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                const diagnostics = document.createElement('div');
                diagnostics.id = 'tts-diagnostics-panel';
                diagnostics.setAttribute('data-tts-ui', 'true');
                diagnostics.setAttribute('aria-hidden', 'true');
                diagnostics.style.cssText = 'position: fixed; right: 12px; bottom: 12px; background: rgba(0,0,0,0.75); color: #fff; padding: 6px 8px; border-radius: 6px; font-family: Arial, sans-serif; font-size: 11px; z-index: 2147483647; pointer-events: none; user-select: none; -webkit-user-select: none;';
                diagnostics.textContent = 'gap: -- ms | wrap: -- ms';
                document.body.appendChild(diagnostics);
                this.diagnosticsPanel = diagnostics;
            }

            const progress = document.createElement('div');
            progress.id = 'tts-progress-panel';
            progress.setAttribute('data-tts-ui', 'true');
            progress.setAttribute('aria-hidden', 'true');
            progress.style.cssText = 'position: fixed; right: 12px; bottom: 44px; background: rgba(0,0,0,0.75); color: #fff; padding: 6px 8px; border-radius: 6px; font-family: Arial, sans-serif; font-size: 11px; z-index: 2147483647; pointer-events: none; user-select: none; -webkit-user-select: none; opacity: 0; transition: opacity 0.2s ease;';
            progress.textContent = 'Reading 0/0';
            document.body.appendChild(progress);
            this.progressPanel = progress;

            const navigation = document.createElement('div');
            navigation.id = 'tts-navigation-status';
            navigation.setAttribute('data-tts-ui', 'true');
            navigation.setAttribute('aria-hidden', 'true');
            navigation.style.cssText = 'position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%) translateY(8px); max-width: min(70vw, 560px); background: rgba(0,0,0,0.78); color: #fff; padding: 7px 10px; border-radius: 999px; font-family: Arial, sans-serif; font-size: 12px; z-index: 2147483647; pointer-events: none; user-select: none; -webkit-user-select: none; opacity: 0; transition: opacity 0.14s ease, transform 0.14s ease; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
            navigation.textContent = 'Navigation';
            document.body.appendChild(navigation);
            this.navigationPanel = navigation;
            this.applyOverlayVisibility();
        },

        // MODIFIED: This function is now mostly disabled for TTS reading.
        gentleScrollToElement(element) {
            if (!element) return;
            const now = Date.now();
            if (now - this.lastScrollTime < this.CONFIG.SCROLL_THROTTLE_MS) return;

            const rect = element.getBoundingClientRect();
            const padding = this.CONFIG.SCROLL_EDGE_PADDING;
            if (rect.top < padding || rect.bottom > window.innerHeight - padding) {
                this.lastScrollTime = now;
                element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        },

        canAutoScrollNow() {
            if (!this.continuousReadingActive || this.isPaused) return false;
            if (this.isNavigating || this.navKeyHeld) return false;
            if (Date.now() < this.userInteractingUntil) return false;
            return true;
        },

        scrollElementToCenter(element) {
            if (!element) return;
            this.autoScrollInProgress = true;
            if (this.autoScrollInProgressId) {
                clearTimeout(this.autoScrollInProgressId);
            }
            this.autoScrollInProgressId = setTimeout(() => {
                this.autoScrollInProgress = false;
                this.autoScrollInProgressId = null;
            }, this.CONFIG.AUTO_SCROLL_SUPPRESS_SCROLL_MS);
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        },

        markUserInteraction() {
            if (this.autoScrollInProgress) return;
            this.userInteractingUntil = Date.now() + this.CONFIG.AUTO_SCROLL_USER_PAUSE_MS;
            this.scheduleAutoScrollResume();
        },

        scheduleAutoScrollResume() {
            if (!this.CONFIG.AUTO_SCROLL_ENABLED) return;
            if (this.autoScrollResumeId) {
                clearTimeout(this.autoScrollResumeId);
            }
            const delay = Math.max(0, this.userInteractingUntil - Date.now());
            this.autoScrollResumeId = setTimeout(() => {
                this.autoScrollResumeId = null;
                if (this.canAutoScrollNow() && this.lastSpokenElement) {
                    this.scrollElementToCenter(this.lastSpokenElement);
                }
            }, delay);
        },

        maybeAutoScrollOnStart() {
            if (!this.CONFIG.AUTO_SCROLL_ENABLED) return;
            if (this.CONFIG.AUTO_SCROLL_MODE !== 'paragraph') return;
            if (this.canAutoScrollNow() && this.lastSpokenElement) {
                this.scrollElementToCenter(this.lastSpokenElement);
            } else {
                this.scheduleAutoScrollResume();
            }
        },

        startAutoScroll() {
            if (!this.CONFIG.AUTO_SCROLL_ENABLED) return;
            if (this.CONFIG.AUTO_SCROLL_MODE !== 'interval') return;
            if (this.autoScrollIntervalId) return;
            this.autoScrollIntervalId = setInterval(() => {
                if (!this.canAutoScrollNow()) return;
                if (this.lastSpokenElement) {
                    this.scrollElementToCenter(this.lastSpokenElement);
                }
            }, this.CONFIG.AUTO_SCROLL_INTERVAL_MS);
        },

        stopAutoScroll() {
            if (this.autoScrollIntervalId) {
                clearInterval(this.autoScrollIntervalId);
                this.autoScrollIntervalId = null;
            }
            if (this.autoScrollResumeId) {
                clearTimeout(this.autoScrollResumeId);
                this.autoScrollResumeId = null;
            }
        },

        // REWRITTEN: New intelligent waypoint arrow logic
        updatePointerArrow() {
            const currentSentence = document.querySelector('.tts-current-sentence');
            const pointer = document.getElementById('tts-pointer');

            // Exit conditions: No sentence, paused, or no pointer element.
            if (!currentSentence || !pointer || this.isPaused || !this.continuousReadingActive) {
                this.hidePointerArrow();
                this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
                return;
            }

            const rect = currentSentence.getBoundingClientRect();
            const viewport = { w: window.innerWidth, h: window.innerHeight };

            // THE CRUCIAL CHECK: If the element is visible on screen, hide the arrow.
            const isVisible = rect.bottom > 0 && rect.top < viewport.h;
            if (isVisible) {
                this.hidePointerArrow();
                this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
                return;
            }

            // --- If we reach here, the element is OFF-SCREEN ---
            pointer.classList.add('visible');

            // 1. Define the center of the screen (our arrow's origin)
            const origin = { x: viewport.w / 2, y: viewport.h / 2 };

            // 2. Define the target (the center of the off-screen element)
            const target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

            // 3. Calculate the angle from origin to target
            const angleDeg = Math.atan2(target.y - origin.y, target.x - origin.x) * (180 / Math.PI) + 90;

            // 4. Position the arrow on a small circle around the screen's center
            const radius = 80; // How far from the center the arrow sits
            const angleRad = (angleDeg - 90) * (Math.PI / 180);
            const pointerPos = {
                x: origin.x + radius * Math.cos(angleRad),
                y: origin.y + radius * Math.sin(angleRad)
            };

            // 5. Apply the position and rotation
            pointer.style.left = `${pointerPos.x}px`;
            pointer.style.top = `${pointerPos.y}px`;
            pointer.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;

            this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
        },

        // Helper to hide the single arrow
        hidePointerArrow() {
            const pointer = document.getElementById('tts-pointer');
            if (pointer) {
                pointer.classList.remove('visible');
            }
        },

        // ... (showNotification and makeDraggable are unchanged) ...
        showNotification(message) {
            let existing = document.getElementById('tts-notification-popup');
            if(existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = 'tts-notification-popup';
            notification.setAttribute('data-tts-ui', 'true');
            notification.setAttribute('aria-hidden', 'true');
            notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #333; color: white; padding: 10px 20px; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px; z-index: 2147483647; opacity: 0; transition: opacity 0.3s; user-select: none; -webkit-user-select: none;`;
            notification.textContent = message;
            document.body.appendChild(notification);
            setTimeout(() => { notification.style.opacity = '1'; }, 10);
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
            }, 2500);
        },

        makeDraggable(el, onDrop = null) {
            let isDown = false, startX, startY, origLeft, origTop;
            el.addEventListener('mousedown', e => {
                if(e.target.tagName === 'INPUT') return;
                isDown = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = el.getBoundingClientRect();
                origLeft = rect.left;
                origTop = rect.top;
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!isDown) return;
                el.style.left = (origLeft + e.clientX - startX) + 'px';
                el.style.top = (origTop + e.clientY - startY) + 'px';
            });
            document.addEventListener('mouseup', () => {
                if (!isDown) return;
                isDown = false;
                const rect = el.getBoundingClientRect();
                const position = this.clampOverlayPosition({ left: rect.left, top: rect.top }, el);
                el.style.left = `${position.left}px`;
                el.style.top = `${position.top}px`;
                if (typeof onDrop === 'function') {
                    onDrop(position);
                }
            });
        },
    };

    function getPlaybackState() {
        const synth = TTSReader.speechSynthesis;
        const hasSpeechActivity = Boolean(
            TTSReader.ttsActive ||
            (synth && (synth.speaking || synth.pending))
        );
        const hasQueuedSpeech = TTSReader.queuedParagraphs.size > 0;
        const hasActiveSession = Boolean(
            TTSReader.continuousReadingActive ||
            TTSReader.waitingForMoreContent ||
            hasSpeechActivity ||
            hasQueuedSpeech
        );
        if (!hasActiveSession) return 'stopped';
        return TTSReader.isPaused ? 'paused' : 'playing';
    }

    function applySettings(settings, options = {}) {
        if (!settings) return;
        const silent = options.silent === true;

        if (typeof settings.speechRate !== 'undefined') {
            const rate = Number(settings.speechRate);
            if (Number.isFinite(rate)) TTSReader.setSpeechRate(rate, silent);
        }
        if (typeof settings.wordHighlight === 'boolean') {
            TTSReader.setWordHighlightEnabled(settings.wordHighlight, silent);
        }
        if (typeof settings.gapTrim === 'boolean') {
            TTSReader.setGapTrimEnabled(settings.gapTrim, silent);
        }
        if (typeof settings.autoRead === 'boolean') {
            TTSReader.setAutoReadEnabled(settings.autoRead, silent);
        }
        if (typeof settings.readUserMessages === 'boolean') {
            TTSReader.setReadUserMessagesEnabled(settings.readUserMessages, silent);
        }
        if (typeof settings.readReferences === 'boolean') {
            TTSReader.setReadReferencesEnabled(settings.readReferences, silent);
        }
        if (typeof settings.loopOnEnd === 'boolean') {
            TTSReader.setLoopEnabled(settings.loopOnEnd, silent);
        }
        if (typeof settings.autoScrollEnabled === 'boolean') {
            TTSReader.setAutoScrollEnabled(settings.autoScrollEnabled, silent);
        }
        if (typeof settings.showPageOverlay === 'boolean') {
            TTSReader.setPageOverlayEnabled(settings.showPageOverlay, silent);
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'overlayPosition')) {
            TTSReader.setOverlayPosition(settings.overlayPosition, { silent: true });
        }
        if (typeof settings.volumeBoostEnabled === 'boolean') {
            TTSReader.setVolumeBoostEnabled(settings.volumeBoostEnabled, silent);
        }
        if (typeof settings.volumeBoostLevel !== 'undefined') {
            const level = Number(settings.volumeBoostLevel);
            if (Number.isFinite(level)) TTSReader.setVolumeBoostLevel(level, silent);
        }
        if (typeof settings.enterToSendEnabled === 'boolean') {
            TTSReader.setEnterToSendEnabled(settings.enterToSendEnabled, silent);
        }
        if (typeof settings.globalPasteEnabled === 'boolean') {
            TTSReader.setGlobalPasteEnabled(settings.globalPasteEnabled, silent);
        }
        if (typeof settings.regularPasteEnabled === 'boolean') {
            TTSReader.setRegularPasteEnabled(settings.regularPasteEnabled, silent);
        }
        if (typeof settings.regularAutoSend === 'boolean') {
            TTSReader.setRegularAutoSendEnabled(settings.regularAutoSend, silent);
        }
        if (typeof settings.regularAutoSendInInput === 'boolean') {
            TTSReader.setRegularAutoSendInInputEnabled(settings.regularAutoSendInInput, silent);
        }
        if (typeof settings.niceAutoPasteEnabled === 'boolean') {
            TTSReader.setNiceAutoPasteEnabled(settings.niceAutoPasteEnabled, silent);
        }
        if (typeof settings.niceAutoSend === 'boolean') {
            TTSReader.setNiceAutoSendEnabled(settings.niceAutoSend, silent);
        }
        if (typeof settings.copyButtonEnabled === 'boolean') {
            TTSReader.setCopyButtonEnabled(settings.copyButtonEnabled, silent);
        }
        if (typeof settings.doubleClickEditEnabled === 'boolean') {
            TTSReader.setDoubleClickEditEnabled(settings.doubleClickEditEnabled, silent);
        }
        if (typeof settings.autoCloseLimitWarning === 'boolean') {
            TTSReader.setAutoCloseLimitWarningEnabled(settings.autoCloseLimitWarning, silent);
        }
        if (typeof settings.limitWarningDelay !== 'undefined') {
            const delay = Number(settings.limitWarningDelay);
            if (Number.isFinite(delay)) TTSReader.setLimitWarningDelay(delay, silent);
        }

        if (typeof settings.showDiagnostics === 'boolean') {
            TTSReader.CONFIG.SHOW_DIAGNOSTICS_PANEL = settings.showDiagnostics;
            if (!settings.showDiagnostics && TTSReader.diagnosticsPanel) {
                TTSReader.diagnosticsPanel.remove();
                TTSReader.diagnosticsPanel = null;
            }
        }

        if (typeof settings.queueLookahead !== 'undefined') {
            const next = Number(settings.queueLookahead);
            if (Number.isFinite(next)) TTSReader.CONFIG.QUEUE_LOOKAHEAD = next;
        }
        if (typeof settings.navFocusHoldMs !== 'undefined') {
            const next = Number(settings.navFocusHoldMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_FOCUS_HOLD_MS = next;
        }
        if (typeof settings.navKeyupReadDelayMs !== 'undefined') {
            const next = Number(settings.navKeyupReadDelayMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_KEYUP_READ_DELAY_MS = next;
        }
        if (typeof settings.navThrottleMs !== 'undefined') {
            const next = Number(settings.navThrottleMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_THROTTLE_MS = next;
        }
        if (typeof settings.scrollThrottleMs !== 'undefined') {
            const next = Number(settings.scrollThrottleMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.SCROLL_THROTTLE_MS = next;
        }
        if (typeof settings.scrollEdgePadding !== 'undefined') {
            const next = Number(settings.scrollEdgePadding);
            if (Number.isFinite(next)) TTSReader.CONFIG.SCROLL_EDGE_PADDING = next;
        }
        if (typeof settings.loopWaitMs !== 'undefined') {
            const next = Number(settings.loopWaitMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.LOOP_WAIT_MS = next;
        }
        if (typeof settings.waitForMoreMs !== 'undefined') {
            const next = Number(settings.waitForMoreMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.WAIT_FOR_MORE_MS = next;
        }
        if (typeof settings.autoReadCooldownMs !== 'undefined') {
            const next = Number(settings.autoReadCooldownMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.AUTO_READ_COOLDOWN_MS = next;
        }
        if (typeof settings.autoReadStableMs !== 'undefined') {
            const next = Number(settings.autoReadStableMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.AUTO_READ_STABLE_MS = next;
        }
        if (typeof settings.autoReadMinParagraphs !== 'undefined') {
            const next = Number(settings.autoReadMinParagraphs);
            if (Number.isFinite(next)) TTSReader.CONFIG.AUTO_READ_MIN_PARAGRAPHS = next;
        }
    }

    function getStoredProfileSettings(items, profile) {
        const settingsByProfile = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
            ? items[SETTINGS_STORAGE_KEY]
            : {};
        const legacy = pickLegacySettings(items);
        return {
            ...getProfileDefaults(profile),
            ...(profile === PROFILE_CHATGPT ? legacy : {}),
            ...(settingsByProfile[profile] || {})
        };
    }

    function initWithStoredSettings() {
        chrome.storage.sync.get(null, (items) => {
            const profile = getCurrentProfile();
            TTSReader.settingsProfile = profile;
            const settings = getStoredProfileSettings(items || {}, profile);
            applySettings(settings, { silent: true });
            TTSReader.init();
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync') return;

            if (Object.prototype.hasOwnProperty.call(changes, SETTINGS_STORAGE_KEY)) {
                const profile = TTSReader.settingsProfile || getCurrentProfile();
                const nextProfiles = changes[SETTINGS_STORAGE_KEY].newValue || {};
                const profileSettings = {
                    ...getProfileDefaults(profile),
                    ...(nextProfiles[profile] || {})
                };
                applySettings(profileSettings, { silent: true });
                return;
            }

            const legacyUpdated = {};
            for (const key of Object.keys(BASE_DEFAULT_SETTINGS)) {
                if (Object.prototype.hasOwnProperty.call(changes, key)) {
                    legacyUpdated[key] = changes[key].newValue;
                }
            }
            if (Object.keys(legacyUpdated).length > 0) {
                applySettings(legacyUpdated, { silent: true });
            }
        });
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
        initWithStoredSettings();
    } else {
        TTSReader.init();
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (!message || !message.action) return false;

            switch (message.action) {
                case 'startReading':
                    TTSReader.startReadingFromViewport();
                    break;
                case 'readFromTop':
                    TTSReader.startReadingFromTop();
                    break;
                case 'readSelection':
                    TTSReader.startReadingFromSelection();
                    break;
                case 'pauseResume':
                    TTSReader.pauseResumeTTS();
                    break;
                case 'stopReading':
                    TTSReader.stopTTS();
                    break;
                case 'navigate':
                    if (message.direction === 'prev') {
                        TTSReader.navigateImmediate(-1);
                    } else if (message.direction === 'next') {
                        TTSReader.navigateImmediate(1);
                    }
                    break;
                case 'setRate':
                    TTSReader.setSpeechRate(message.rate, true);
                    break;
                case 'applySettings':
                    applySettings(message.settings || {}, { silent: message.silent === true });
                    break;
                case 'getState':
                    TTSReader.refreshParagraphsIfNeeded(false);
                    sendResponse({
                        state: getPlaybackState(),
                        profile: TTSReader.settingsProfile || getCurrentProfile(),
                        progress: {
                            current: TTSReader.currentParagraphIndex >= 0 ? TTSReader.currentParagraphIndex + 1 : 0,
                            total: TTSReader.paragraphsList.length
                        },
                        settings: {
                            speechRate: TTSReader.CONFIG.SPEECH_RATE,
                            wordHighlight: TTSReader.CONFIG.WORD_HIGHLIGHT_ENABLED,
                            gapTrim: TTSReader.CONFIG.GAP_TRIM_ENABLED,
                            readUserMessages: TTSReader.CONFIG.READ_USER_MESSAGES,
                            readReferences: TTSReader.CONFIG.READ_REFERENCES,
                            autoRead: TTSReader.CONFIG.AUTO_READ_NEW_MESSAGES,
                            loopOnEnd: TTSReader.CONFIG.LOOP_ON_END,
                            autoScrollEnabled: TTSReader.CONFIG.AUTO_SCROLL_ENABLED,
                            showPageOverlay: TTSReader.CONFIG.SHOW_PAGE_OVERLAY,
                            overlayPosition: TTSReader.CONFIG.OVERLAY_POSITION,
                            showDiagnostics: TTSReader.CONFIG.SHOW_DIAGNOSTICS_PANEL,
                            volumeBoostEnabled: TTSReader.CONFIG.VOLUME_BOOST_ENABLED,
                            volumeBoostLevel: TTSReader.CONFIG.VOLUME_BOOST_LEVEL,
                            enterToSendEnabled: TTSReader.CONFIG.ENTER_TO_SEND_ENABLED,
                            globalPasteEnabled: TTSReader.CONFIG.GLOBAL_PASTE_ENABLED,
                            regularPasteEnabled: TTSReader.CONFIG.REGULAR_PASTE_ENABLED,
                            regularAutoSend: TTSReader.CONFIG.REGULAR_AUTO_SEND,
                            regularAutoSendInInput: TTSReader.CONFIG.REGULAR_AUTO_SEND_IN_INPUT,
                            niceAutoPasteEnabled: TTSReader.CONFIG.NICE_AUTO_PASTE_ENABLED,
                            niceAutoSend: TTSReader.CONFIG.NICE_AUTO_SEND,
                            copyButtonEnabled: TTSReader.CONFIG.COPY_BUTTON_ENABLED,
                            doubleClickEditEnabled: TTSReader.CONFIG.DOUBLE_CLICK_EDIT_ENABLED,
                            autoCloseLimitWarning: TTSReader.CONFIG.AUTO_CLOSE_LIMIT_WARNING,
                            limitWarningDelay: TTSReader.CONFIG.LIMIT_WARNING_DELAY_MS
                        }
                    });
                    return true;
            }

            return false;
        });
    }

})();

