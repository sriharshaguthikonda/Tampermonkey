(function() {
    'use strict';

    if (window.__TTSNS) return;

    const SETTINGS_STORAGE_KEY = 'settingsByProfile';
    const PROFILE_CHATGPT = 'chatgpt';
    const PROFILE_LOCAL = 'local';
    const PROFILE_FILE = 'file';

    const BASE_DEFAULT_SETTINGS = {
        speechRate: 5,
        voiceUri: '',
        emojiVoiceMappings: [],
        wordHighlight: true,
        gapTrim: true,
        readUserMessages: false,
        readReferences: false,
        chatgptTextStyling: false,
        serverPrecacheMode: true,
        serverTextNormalizationEnabled: true,
        serverQuotePolicy: 'strip',
        serverNormalizePunctuation: true,
        serverNormalizeWhitespace: true,
        serverRemoveCitationMarkers: true,
        serverRemoveMarkdownMarkers: true,
        serverCustomRemovalMode: 'exact',
        serverCustomExactRemovals: '',
        serverCustomRegexRemovals: '',
        serverBaseUrl: 'http://127.0.0.1:7860',
        autoRead: false,
        loopOnEnd: true,
        autoScrollEnabled: true,
        idleArrowNavigation: true,
        promptHistoryNavEnabled: true,
        showPageOverlay: true,
        overlayPosition: null,
        showDiagnostics: true,
        hiddenTabPolicy: 'delay',
        autoPauseHiddenDelayMs: 5000,
        volumeBoostEnabled: true,
        volumeBoostLevel: 1.3,
        lowGapMode: true,
        enterToSendEnabled: true,
        globalPasteEnabled: true,
        regularPasteEnabled: true,
        regularAutoSend: false,
        regularAutoSendInInput: false,
        niceAutoPasteEnabled: true,
        niceAutoSend: false,
        copyButtonEnabled: true,
        smartCopyEnabled: true,
        smartCopyMode: 'selection-first',
        copyFormat: 'dialogue-plus-setup',
        clickStartSkipWords: 0,
        autoReadStartSkipChars: 0,
        autoReadLoopCurrentMessage: false,
        doubleClickEditEnabled: true,
        autoCloseLimitWarning: true,
        limitWarningDelay: 1500,
        queueLookahead: 5,
        navFocusHoldMs: 800,
        navKeyupReadDelayMs: 150,
        navThrottleMs: 20,
        navArrowJumpSegments: 1,
        navCtrlJumpSegments: 5,
        speedStep: 0.2,
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
            niceAutoSend: false,
            promptHistoryNavEnabled: false
        },
        [PROFILE_FILE]: {
            ...BASE_DEFAULT_SETTINGS,
            autoRead: false,
            globalPasteEnabled: false,
            regularPasteEnabled: false,
            regularAutoSend: false,
            regularAutoSendInInput: false,
            niceAutoPasteEnabled: false,
            niceAutoSend: false,
            promptHistoryNavEnabled: false
        }
    };

    function getProfileFromUrl(urlLike) {
        try {
            const url = new URL(urlLike || '');
            if (url.protocol === 'file:') return PROFILE_FILE;
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
        currentUtteranceStartOffset: 0,
        queuedStartOffsets: new Map(),
        chunkedParagraphState: new Map(),
        chunkContinuationTimeoutId: null,
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
        navigationTrailCanvas: null,
        navigationTrailCtx: null,
        navigationTrailPoints: [],
        navigationTrailAnimationId: null,
        navigationStateTimeoutId: null,
        lastUtteranceEndTime: 0,
        lastGapMs: null,
        lastWrapMs: null,
        autoReadObserver: null,
        autoReadDebounceId: null,
        lastAutoReadMessageElement: null,
        lastAutoReadTriggeredAt: 0,
        activeAutoReadMessageElement: null,
        activeAutoReadStartParagraphIndex: -1,
        activeAutoReadStartCharIndex: 0,
        autoReadMessageActivity: new WeakMap(),
        waitingForMoreContent: false,
        waitForMoreTimeoutId: null,
        waitForMoreSince: 0,
        waitForMoreNextIndex: -1,
        audioContexts: new Map(),
        mediaObserver: null,
        lastEnterPressTime: 0,
        pasteHandler: null,
        sendCaptureHandler: null,
        copyObserver: null,
        editObserver: null,
        limitWarningObserver: null,
        promptHistoryObserver: null,
        promptHistory: [],
        promptHistoryCursor: -1,
        promptHistoryDraft: '',
        promptHistoryDraftTooLarge: false,
        smartCopyCopyHandler: null,
        selectionSeekDebounceId: null,
        serverVoices: [],
        serverVoicesFetchedAt: 0,
        serverVoicesFetchPromise: null,
        serverAudioContext: null,
        serverAudioGainNode: null,
        serverCurrentSource: null,
        serverPlaybackState: null,
        scheduledNextSource: null,      // Look-ahead: pre-scheduled next audio source
        serverPlaybackStartTime: 0,     // Look-ahead: when current playback started (context time)
        serverSentenceAudioCache: new Map(),
        serverSentenceAudioInflight: new Map(),
        serverSentenceRequestIds: new Map(),
        serverPreparedAudioElements: new Map(),
        serverWordHighlightTimers: [],
        playbackOwnerId: null,
        playbackLockOwned: false,
        playbackLockHeartbeatId: null,
        playbackSessionId: 0,
        hiddenPauseTimeoutId: null,
        hiddenSince: 0,
        pausedForHiddenTab: false,
        interruptedRetryAttempts: new Map(),
        chatgptTextStyleElement: null,
        isChatGPTPage: false,
        settingsProfile: PROFILE_CHATGPT,
        processedParagraph: { element: null, originalHTML: '', wordSpans: [], wordOffsets: [] },

        CONFIG: {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, .markdown, article',
            // Add #content-root and all its descendants to ignore list
            IGNORE_SELECTORS: '.settings-header, nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-tts-ui], .sr-only, pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token, #thread-bottom-container, #content-root, #content-root *',
            SPEECH_RATE: 5,
            VOICE_URI: '',
            EMOJI_VOICE_MAPPINGS: [],
            QUEUE_LOOKAHEAD: 3,
            MAX_SYNTH_BACKLOG: 1,
            SPEECH_CHUNK_MAX_CHARS: 220,
            SPEECH_CHUNK_GAP_MS: 40,
            UNSTABLE_VOICE_RATE_CAP: 1.6,
            NAV_READ_DELAY_MS: 0,
            NAV_THROTTLE_MS: 20,
            NAV_FOCUS_HOLD_MS: 800,
            NAV_KEYUP_READ_DELAY_MS: 150,
            NAV_FOCUS_FADE_MS: 800,
            NAV_CTRL_JUMP_SEGMENTS: 5,
            NAV_TRAIL_FADE_MS: 2500,
            NAV_TRAIL_MAX_POINTS: 14,
            SPEED_STEP: 0.2,
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
            USER_MESSAGE_SELECTORS: '[data-message-author-role="user"], section[data-turn="user"], [data-turn="user"]',
            READ_REFERENCES: false,
            CHATGPT_TEXT_STYLING: false,
            REFERENCE_SELECTORS: '[data-testid="webpage-citation-pill"], [data-testid*="citation"], .webpage-citation-pill, .citation-pill, [data-source], cite',
            PREWRAP_IDLE_TIMEOUT_MS: 250,
            DEFERRED_REVERT_IDLE_MS: 250,
            SHOW_DIAGNOSTICS_PANEL: true,
            AUTO_READ_NEW_MESSAGES: false,
            AUTO_READ_START_SKIP_CHARS: 0,
            AUTO_READ_LOOP_CURRENT_MESSAGE: false,
            AUTO_READ_COOLDOWN_MS: 1500,
            AUTO_READ_STABLE_MS: 800,
            AUTO_READ_MIN_PARAGRAPHS: 3,
            WAIT_FOR_MORE_MS: 8000,
            WAIT_RETRY_MS: 250,
            LOOP_WAIT_MS: 1200,
            LOOP_ON_END: true,
            IDLE_ARROW_NAVIGATION: true,
            PROMPT_HISTORY_NAV_ENABLED: true,
            PROMPT_HISTORY_MAX: 200,
            PROMPT_HISTORY_MAX_CHARS: 6000,
            VOLUME_BOOST_ENABLED: true,
            VOLUME_BOOST_LEVEL: 1.3,
            LOW_GAP_MODE: true,
            SERVER_PRECACHE_MODE: true,
            SERVER_TEXT_NORMALIZATION_ENABLED: true,
            SERVER_QUOTE_POLICY: 'strip',
            SERVER_NORMALIZE_PUNCTUATION: true,
            SERVER_NORMALIZE_WHITESPACE: true,
            SERVER_REMOVE_CITATION_MARKERS: true,
            SERVER_REMOVE_MARKDOWN_MARKERS: true,
            SERVER_CUSTOM_REMOVAL_MODE: 'exact',
            SERVER_CUSTOM_EXACT_REMOVALS: '',
            SERVER_CUSTOM_REGEX_REMOVALS: '',
            SERVER_BASE_URL: 'http://127.0.0.1:7860',
            SERVER_PRECACHE_WORD_BUDGET: 100,
            SERVER_PRECACHE_MAX_SENTENCES: 8,
            SERVER_HANDOFF_WAIT_MS: 120,
            SERVER_TTS_SAMPLE_RATE: 24000,
            SERVER_TTS_DEFAULT_BASE_URL: 'http://127.0.0.1:7860',
            TEXT_PREPROCESS_CHARS: '',  // Legacy compatibility, prefer SERVER_CUSTOM_EXACT_REMOVALS
            SERVER_TTS_MIN_SPEED: 0.5,
            SERVER_TTS_MAX_SPEED: 2.0,
            ENTER_TO_SEND_DOUBLE_PRESS_MS: 300,
            GLOBAL_PASTE_ENABLED: true,
            REGULAR_PASTE_ENABLED: true,
            REGULAR_AUTO_SEND: false,
            REGULAR_AUTO_SEND_IN_INPUT: false,
            NICE_AUTO_PASTE_ENABLED: true,
            NICE_AUTO_SEND: false,
            COPY_BUTTON_ENABLED: true,
            SMART_COPY_ENABLED: true,
            SMART_COPY_MODE: 'selection-first',
            COPY_FORMAT: 'dialogue-plus-setup',
            CLICK_START_SKIP_WORDS: 0,
            SMART_COPY_USER_LABEL: 'Doctor',
            SMART_COPY_ASSISTANT_LABEL: 'ChatGPT',
            DOUBLE_CLICK_EDIT_ENABLED: true,
            AUTO_CLOSE_LIMIT_WARNING: true,
            LIMIT_WARNING_DELAY_MS: 1500,
            PLAYBACK_LOCK_HEARTBEAT_MS: 2500,
            HIDDEN_TAB_POLICY: 'delay',
            AUTO_PAUSE_HIDDEN_DELAY_MS: 5000,
            INTERRUPTED_RETRY_MAX: 1,
            INTERRUPTED_RETRY_DELAY_MS: 250,
            NAV_ARROW_JUMP_SEGMENTS: 1,
            HOTKEYS: {
                ACTIVATE: 'U',
                PAUSE_RESUME: 'P',
                NAV_NEXT: 'ArrowRight',
                NAV_PREV: 'ArrowLeft',
                STOP: 'Escape',
                BOUNDARY_START: 'Home',
                BOUNDARY_END: 'End',
                SESSION_PAUSE: 'Space',
                SPEED_DOWN: '[',
                SPEED_UP: ']',
                REPLAY: 'R',
                LOOP_TOGGLE: 'L',
                AUTOSCROLL_TOGGLE: 'A'
            },
            EMOJI_REGEX: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/ug,
            SPEAKER_EMOJI_REGEX: /^\s*((?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*))/u
        }
    };

    window.__TTSNS = {
        constants: {
            SETTINGS_STORAGE_KEY,
            PROFILE_CHATGPT,
            PROFILE_LOCAL,
            PROFILE_FILE,
            BASE_DEFAULT_SETTINGS,
            PROFILE_DEFAULT_SETTINGS,
        },
        helpers: {
            getProfileFromUrl,
            getCurrentProfile,
            getProfileDefaults,
            pickLegacySettings,
            persistProfileSetting,
        },
        TTSReader,
    };
})();
