// Background script for ChatGPT TTS Reader

const SETTINGS_STORAGE_KEY = 'settingsByProfile';
const PROFILE_CHATGPT = 'chatgpt';
const PROFILE_LOCAL = 'local';

const BASE_DEFAULT_SETTINGS = {
    speechRate: 5,
    wordHighlight: true,
    gapTrim: true,
    readUserMessages: false,
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
    autoReadMinParagraphs: 3,
    hotkeys: {
        activate: 'U',
        pauseResume: 'P',
        navNext: 'ArrowRight',
        navPrev: 'ArrowLeft',
        stop: 'Escape'
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

function buildMergedProfiles(items) {
    const storedProfiles = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
        ? items[SETTINGS_STORAGE_KEY]
        : {};
    const legacy = pickLegacySettings(items);
    const hasLegacy = Object.keys(legacy).length > 0;

    const nextProfiles = {
        [PROFILE_CHATGPT]: {
            ...getProfileDefaults(PROFILE_CHATGPT),
            ...(hasLegacy ? legacy : {}),
            ...(storedProfiles[PROFILE_CHATGPT] || {})
        },
        [PROFILE_LOCAL]: {
            ...getProfileDefaults(PROFILE_LOCAL),
            ...(storedProfiles[PROFILE_LOCAL] || {})
        }
    };

    return nextProfiles;
}

function getSettingsForProfile(items, profile) {
    const storedProfiles = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
        ? items[SETTINGS_STORAGE_KEY]
        : {};
    const legacy = pickLegacySettings(items);
    return {
        ...getProfileDefaults(profile),
        ...(profile === PROFILE_CHATGPT ? legacy : {}),
        ...(storedProfiles[profile] || {})
    };
}

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(null, (items) => {
        const settingsByProfile = buildMergedProfiles(items || {});
        chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settingsByProfile });
    });
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSettings') {
        const profile = getProfileFromUrl(request.url || sender?.tab?.url || '');
        chrome.storage.sync.get(null, (items) => {
            sendResponse({
                profile,
                settings: getSettingsForProfile(items || {}, profile)
            });
        });
        return true;
    }
    return false;
});
