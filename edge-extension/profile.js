(function () {
    'use strict';

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
        autoReadMinParagraphs: 3,
        hotkeys: {
            activate: 'U',
            pauseResume: 'P',
            navNext: 'ArrowRight',
            navPrev: 'ArrowLeft',
            stop: 'Escape',
            boundaryStart: 'Home',
            boundaryEnd: 'End',
            sessionPause: 'Space',
            speedDown: '[',
            speedUp: ']',
            replay: 'R',
            loopToggle: 'L',
            autoScrollToggle: 'A'
        }
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

    window.__TTSProfile = {
        SETTINGS_STORAGE_KEY,
        PROFILE_CHATGPT,
        PROFILE_LOCAL,
        PROFILE_FILE,
        BASE_DEFAULT_SETTINGS,
        PROFILE_DEFAULT_SETTINGS,
        getProfileFromUrl,
        getCurrentProfile,
        getProfileDefaults,
        pickLegacySettings,
        persistProfileSetting
    };
})();
