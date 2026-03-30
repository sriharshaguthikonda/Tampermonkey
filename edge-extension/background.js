// Background script for ChatGPT TTS Reader

const SETTINGS_STORAGE_KEY = 'settingsByProfile';
const PROFILE_CHATGPT = 'chatgpt';
const PROFILE_LOCAL = 'local';
const PLAYBACK_LOCK_STALE_MS = 8000;

let playbackLockState = null;

const BASE_DEFAULT_SETTINGS = {
    speechRate: 1.5,
    wordHighlight: true,
    gapTrim: true,
    readUserMessages: false,
    readReferences: false,
    chatgptTextStyling: false,
    autoRead: false,
    loopOnEnd: true,
    autoScrollEnabled: true,
    showPageOverlay: true,
    overlayPosition: null,
    showDiagnostics: true,
    hiddenTabPolicy: 'delay',
    autoPauseHiddenDelayMs: 5000,
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

function getSenderTabId(sender) {
    return sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : null;
}

function getSenderWindowId(sender) {
    return sender && sender.tab && Number.isInteger(sender.tab.windowId) ? sender.tab.windowId : null;
}

function getNow() {
    return Date.now();
}

function isPlaybackLockStale(lock) {
    if (!lock || !Number.isFinite(lock.heartbeatAt)) return true;
    return (getNow() - lock.heartbeatAt) > PLAYBACK_LOCK_STALE_MS;
}

function resetPlaybackLockIfStale() {
    if (!playbackLockState) return;
    if (isPlaybackLockStale(playbackLockState)) {
        playbackLockState = null;
    }
}

function notifyRevokedOwner(previousLock, nextOwnerId) {
    if (!previousLock || !Number.isInteger(previousLock.tabId)) return;
    chrome.tabs.sendMessage(previousLock.tabId, {
        action: 'ttsLockRevoked',
        byOwnerId: nextOwnerId
    }, () => {
        // Ignore "receiving end does not exist" and similar errors (tab may already be gone).
        void chrome.runtime.lastError;
    });
}

function isLockOwnedBySender(sender, ownerId) {
    if (!playbackLockState) return false;
    if (playbackLockState.ownerId !== ownerId) return false;
    const senderTabId = getSenderTabId(sender);
    if (!Number.isInteger(senderTabId)) return false;
    return playbackLockState.tabId === senderTabId;
}

function getPlaybackLockSnapshot() {
    if (!playbackLockState) return null;
    return {
        ownerId: playbackLockState.ownerId,
        tabId: playbackLockState.tabId,
        windowId: playbackLockState.windowId,
        url: playbackLockState.url || '',
        reason: playbackLockState.reason || '',
        acquiredAt: playbackLockState.acquiredAt,
        heartbeatAt: playbackLockState.heartbeatAt,
        ageMs: Math.max(0, getNow() - playbackLockState.heartbeatAt),
        stale: isPlaybackLockStale(playbackLockState)
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
    if (!request || !request.action) return false;

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

    if (request.action === 'requestPlaybackLock') {
        resetPlaybackLockIfStale();

        const ownerId = typeof request.ownerId === 'string' ? request.ownerId : '';
        const tabId = getSenderTabId(sender);
        const windowId = getSenderWindowId(sender);
        const allowPreempt = request.allowPreempt === true;
        if (!ownerId) {
            sendResponse({ granted: false, reason: 'missing-owner-id' });
            return false;
        }

        if (!playbackLockState || playbackLockState.ownerId === ownerId) {
            playbackLockState = {
                ownerId,
                tabId,
                windowId,
                url: typeof request.url === 'string' ? request.url : '',
                reason: typeof request.reason === 'string' ? request.reason : '',
                acquiredAt: playbackLockState && playbackLockState.ownerId === ownerId
                    ? playbackLockState.acquiredAt
                    : getNow(),
                heartbeatAt: getNow()
            };
            sendResponse({ granted: true, ownerId: playbackLockState.ownerId });
            return false;
        }

        if (!allowPreempt) {
            sendResponse({
                granted: false,
                reason: 'already-locked',
                activeOwnerId: playbackLockState.ownerId,
                activeUrl: playbackLockState.url || '',
                activeTabId: playbackLockState.tabId,
                activeWindowId: playbackLockState.windowId
            });
            return false;
        }

        const previous = playbackLockState;
        playbackLockState = {
            ownerId,
            tabId,
            windowId,
            url: typeof request.url === 'string' ? request.url : '',
            reason: typeof request.reason === 'string' ? request.reason : '',
            acquiredAt: getNow(),
            heartbeatAt: getNow()
        };
        notifyRevokedOwner(previous, ownerId);
        sendResponse({ granted: true, ownerId: playbackLockState.ownerId, preempted: true });
        return false;
    }

    if (request.action === 'renewPlaybackLock') {
        resetPlaybackLockIfStale();
        const ownerId = typeof request.ownerId === 'string' ? request.ownerId : '';
        if (!ownerId || !isLockOwnedBySender(sender, ownerId)) {
            sendResponse({
                granted: false,
                activeOwnerId: playbackLockState ? playbackLockState.ownerId : null,
                activeUrl: playbackLockState ? playbackLockState.url : null,
                activeTabId: playbackLockState ? playbackLockState.tabId : null,
                activeWindowId: playbackLockState ? playbackLockState.windowId : null
            });
            return false;
        }
        playbackLockState.heartbeatAt = getNow();
        playbackLockState.url = typeof request.url === 'string' ? request.url : playbackLockState.url;
        sendResponse({ granted: true, ownerId: playbackLockState.ownerId });
        return false;
    }

    if (request.action === 'releasePlaybackLock') {
        const ownerId = typeof request.ownerId === 'string' ? request.ownerId : '';
        if (isLockOwnedBySender(sender, ownerId)) {
            playbackLockState = null;
        }
        sendResponse({ released: true });
        return false;
    }

    if (request.action === 'getPlaybackLockState') {
        resetPlaybackLockIfStale();
        sendResponse({
            lock: getPlaybackLockSnapshot()
        });
        return false;
    }

    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (!playbackLockState) return;
    if (playbackLockState.tabId !== tabId) return;
    playbackLockState = null;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!playbackLockState) return;
    if (playbackLockState.tabId !== tabId) return;
    if (changeInfo.discarded === true || changeInfo.status === 'unloaded') {
        playbackLockState = null;
    }
});
