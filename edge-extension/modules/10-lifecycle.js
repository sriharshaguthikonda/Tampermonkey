(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    const { getCurrentProfile } = ns.helpers;

    Object.assign(ns.TTSReader, {
        // =============================================================================
        // SECTION 03: Lifecycle & Init
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        init() {
            this.settingsProfile = getCurrentProfile();
            this.playbackOwnerId = this.generatePlaybackOwnerId();
            this.detectContext();
            this.applyChatGPTTextStyling();
            this.waitForPageLoad();
            this.createUI();
            this.setupEventListeners();
            this.loadVoices();
            this.fetchServerVoices();
            this.initParagraphObserver();
            this.initMediaEnhancements();
            this.initSmartCopyEnhancements();
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
        }
    });
})();
