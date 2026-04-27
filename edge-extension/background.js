// Background script for ChatGPT TTS Reader

const SETTINGS_STORAGE_KEY = 'settingsByProfile';
const PROFILE_CHATGPT = 'chatgpt';
const PROFILE_LOCAL = 'local';
const PROFILE_FILE = 'file';
const PLAYBACK_LOCK_STALE_MS = 8000;
const SERVER_TTS_DEFAULT_BASE_URL = 'http://127.0.0.1:7860';
const SERVER_TTS_MIN_SPEED = 0.5;
const SERVER_TTS_MAX_SPEED = 2.0;
const SERVER_TTS_TIMEOUT_MS = 12000;

let playbackLockState = null;
const activeServerSynthesisRequests = new Map();
const serverTtsPrefetchCache = new Map();

// Concurrency limiter for synthesis requests
const MAX_CONCURRENT_SYNTHESIS = 2;
let activeSynthesisCount = 0;
const synthesisWaitQueue = [];

function acquireSynthesisSlot() {
    return new Promise((resolve) => {
        if (activeSynthesisCount < MAX_CONCURRENT_SYNTHESIS) {
            activeSynthesisCount++;
            resolve();
        } else {
            synthesisWaitQueue.push(resolve);
        }
    });
}

function releaseSynthesisSlot() {
    if (synthesisWaitQueue.length > 0) {
        const next = synthesisWaitQueue.shift();
        next(); // activeSynthesisCount stays the same — slot transfers
    } else {
        activeSynthesisCount--;
    }
}

function logServerDebug(enabled, event, details = {}) {
    if (!enabled) return;
    console.debug('[TTS][Server]', {
        event,
        ...details
    });
}

function normalizeServerBaseUrl(rawUrl) {
    const input = typeof rawUrl === 'string' && rawUrl.trim()
        ? rawUrl.trim()
        : SERVER_TTS_DEFAULT_BASE_URL;
    try {
        const parsed = new URL(input);
        const host = (parsed.hostname || '').toLowerCase();
        const isLocal = host === '127.0.0.1' || host === 'localhost';
        if (!isLocal) return SERVER_TTS_DEFAULT_BASE_URL;
        const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
        const port = parsed.port ? `:${parsed.port}` : '';
        return `${protocol}//${host}${port}`;
    } catch (_error) {
        return SERVER_TTS_DEFAULT_BASE_URL;
    }
}

function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function clampServerSpeed(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1.0;
    return Math.max(SERVER_TTS_MIN_SPEED, Math.min(SERVER_TTS_MAX_SPEED, parsed));
}

function joinUint8Chunks(chunks, totalLength) {
    const safeLength = Number.isFinite(Number(totalLength))
        ? Math.max(0, Math.round(Number(totalLength)))
        : 0;
    const merged = new Uint8Array(safeLength);
    let offset = 0;
    for (const chunk of chunks) {
        if (!chunk || chunk.length === 0) continue;
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    return merged;
}

function registerServerRequest(requestId, ownerTabId, abortController) {
    if (!requestId) return;
    activeServerSynthesisRequests.set(requestId, {
        ownerTabId,
        abortController,
        startedAt: Date.now()
    });
}

function clearServerRequest(requestId) {
    if (!requestId) return;
    activeServerSynthesisRequests.delete(requestId);
}

function cancelServerRequest(requestId) {
    if (!requestId) return false;
    const entry = activeServerSynthesisRequests.get(requestId);
    if (!entry || !entry.abortController) return false;
    try {
        entry.abortController.abort();
    } catch (_error) {
        // Ignore abort races.
    }
    activeServerSynthesisRequests.delete(requestId);
    return true;
}

function cancelRequestsForTab(tabId) {
    if (!Number.isInteger(tabId)) return;
    for (const [requestId, entry] of activeServerSynthesisRequests.entries()) {
        if (!entry || entry.ownerTabId !== tabId) continue;
        try {
            if (entry.abortController) {
                entry.abortController.abort();
            }
        } catch (_error) {
            // Ignore abort races.
        }
        activeServerSynthesisRequests.delete(requestId);
    }
}

function getPrefetchCacheKey(text, voiceId, speed) {
    const normalizedText = (text || '').trim().toLowerCase();
    const normalizedVoice = (voiceId || '').trim();
    const normalizedSpeed = String(Number(speed) || 1.0);
    return `${normalizedText}|${normalizedVoice}|${normalizedSpeed}`;
}

function setPrefetchCache(key, data) {
    if (!key || !data) return;
    serverTtsPrefetchCache.set(key, {
        ...data,
        cachedAt: Date.now()
    });
    
    // Limit cache size to prevent memory bloat
    const maxCacheSize = 50;
    if (serverTtsPrefetchCache.size > maxCacheSize) {
        const oldestKey = serverTtsPrefetchCache.keys().next().value;
        serverTtsPrefetchCache.delete(oldestKey);
    }
}

function getPrefetchCache(key) {
    if (!key) return null;
    const entry = serverTtsPrefetchCache.get(key);
    if (!entry) return null;
    
    // Cache entries expire after 5 minutes
    const maxAgeMs = 5 * 60 * 1000;
    if (Date.now() - entry.cachedAt > maxAgeMs) {
        serverTtsPrefetchCache.delete(key);
        return null;
    }
    
    return entry;
}

async function fetchServerVoices(baseUrl) {
    const endpoint = `${normalizeServerBaseUrl(baseUrl)}/v1/voices`;
    const response = await fetch(endpoint, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`Server voices request failed (${response.status})`);
    }
    const voices = await response.json();
    if (!Array.isArray(voices)) return [];
    return voices.map((voice) => {
        const id = typeof voice.id === 'string' ? voice.id : '';
        const name = typeof voice.name === 'string' && voice.name.trim()
            ? voice.name.trim()
            : id || 'Server Voice';
        return {
            id,
            name,
            lang: typeof voice.language === 'string' ? voice.language : 'en',
            default: false,
            source: 'server',
            voiceURI: `server:${id}`
        };
    }).filter((voice) => Boolean(voice.id));
}

async function synthesizeServerTts(request) {
    const baseUrl = normalizeServerBaseUrl(request && request.baseUrl);
    const text = typeof request?.text === 'string' ? request.text : '';
    const voiceId = typeof request?.voiceId === 'string' ? request.voiceId : null;
    const requestId = typeof request?.requestId === 'string' ? request.requestId.trim() : '';
    const ownerTabIdRaw = Number(request?.ownerTabId);
    const ownerTabId = Number.isInteger(ownerTabIdRaw) ? ownerTabIdRaw : null;
    const debugEnabled = request?.debug === true;
    const speed = clampServerSpeed(request?.speed);
    const format = 'pcm_24k_16bit';
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), SERVER_TTS_TIMEOUT_MS);
    const startedAt = performance.now();
    registerServerRequest(requestId, ownerTabId, abortController);
    
    await acquireSynthesisSlot();  // <--- NEW LINE ADDED HERE

    // Check prefetch cache first (outside try-finally to avoid slot issues)
    const cacheKey = getPrefetchCacheKey(text, voiceId, speed);
    const cachedData = getPrefetchCache(cacheKey);
    if (cachedData) {
        releaseSynthesisSlot();  // Release slot for cache hit
        clearTimeout(timeoutId);
        clearServerRequest(requestId);
        logServerDebug(debugEnabled, 'synthesis-cache-hit', {
            requestId,
            textChars: text.length,
            cachedAt: cachedData.cachedAt
        });
        return {
            pcmBase64: cachedData.pcmBase64,
            sampleRate: cachedData.sampleRate,
            audioLength: cachedData.audioLength,
            timing: {
                ...cachedData.timing,
                cacheHit: true,
                totalMs: 0 // Instant from cache
            }
        };
    }
    
    logServerDebug(debugEnabled, 'synthesis-start', {
        requestId,
        ownerTabId,
        baseUrl,
        speed,
        textChars: text.length,
        activeRequests: activeServerSynthesisRequests.size
    });

    try {
        const synthesisResult = await fetch(`${baseUrl}/v1/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice: voiceId || null,
                speed,
                format
            }),
            signal: abortController.signal
        });

        if (!synthesisResult.ok) {
            throw new Error(`Server synthesis failed (${synthesisResult.status})`);
        }

        const headersAt = performance.now();
        logServerDebug(debugEnabled, 'synthesis-headers', {
            requestId,
            status: synthesisResult.status,
            headersMs: Math.max(0, Math.round(headersAt - startedAt))
        });
        const sampleRateHeader = synthesisResult.headers.get('X-Audio-Sample-Rate');
        const sampleRate = Number.isFinite(Number(sampleRateHeader))
            ? Math.max(8000, Math.round(Number(sampleRateHeader)))
            : 24000;
        const audioLengthHeader = synthesisResult.headers.get('X-Audio-Length');
        let audioLength = Number.isFinite(Number(audioLengthHeader))
            ? Math.max(0, Math.round(Number(audioLengthHeader)))
            : 0;

        let pcmBytes;
        let firstChunkAt = 0;
        if (synthesisResult.body && typeof synthesisResult.body.getReader === 'function') {
            const reader = synthesisResult.body.getReader();
            const chunks = [];
            let totalLength = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value || value.length === 0) continue;
                if (!firstChunkAt) {
                    firstChunkAt = performance.now();
                    logServerDebug(debugEnabled, 'synthesis-first-chunk', {
                        requestId,
                        firstChunkMs: Math.max(0, Math.round(firstChunkAt - startedAt))
                    });
                }
                const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
                chunks.push(chunk);
                totalLength += chunk.length;
            }
            pcmBytes = joinUint8Chunks(chunks, totalLength);
        } else {
            const pcmBuffer = await synthesisResult.arrayBuffer();
            pcmBytes = new Uint8Array(pcmBuffer);
            firstChunkAt = performance.now();
        }

        if (!audioLength) {
            audioLength = pcmBytes.length;
        }

        const synthesisData = { pcmBytes, sampleRate, audioLength, headersAt, firstChunkAt };
        const completedAt = performance.now();
        const totalMs = Math.max(0, Math.round(completedAt - startedAt));
        const isSlowDueToContention = totalMs > 800 && activeServerSynthesisRequests.size > 1;

        logServerDebug(debugEnabled, 'synthesis-complete', {
            requestId,
            totalMs,
            bytes: synthesisData.pcmBytes.length,
            sampleRate: synthesisData.sampleRate,
            activeRequests: activeServerSynthesisRequests.size,
            // NEW: flags contention clearly in logs
            likelyConcurrentContention: isSlowDueToContention,
            warning: isSlowDueToContention
                ? `Slow due to ${activeServerSynthesisRequests.size} concurrent requests on GPU` 
                : null
        });

        const result = {
            pcmBase64: bytesToBase64(synthesisData.pcmBytes),
            sampleRate: synthesisData.sampleRate,
            audioLength: synthesisData.audioLength,
            timing: {
                headersMs: Math.max(0, Math.round(synthesisData.headersAt - startedAt)),
                firstChunkMs: synthesisData.firstChunkAt
                    ? Math.max(0, Math.round(synthesisData.firstChunkAt - startedAt))
                    : null,
                totalMs: Math.max(0, Math.round(completedAt - startedAt))
            }
        };
        
        // Cache the result for future prefetch hits
        setPrefetchCache(cacheKey, result);
        
        return result;
    } catch (error) {
        logServerDebug(debugEnabled, 'synthesis-error', {
            requestId,
            totalMs: Math.max(0, Math.round(performance.now() - startedAt)),
            error: error instanceof Error ? error.message : String(error || 'Unknown error'),
            activeRequests: activeServerSynthesisRequests.size
        });
        throw error;
    } finally {
        releaseSynthesisSlot();    // <-- ADD THIS
        clearTimeout(timeoutId);
        clearServerRequest(requestId);
        logServerDebug(debugEnabled, 'synthesis-clear', {
            requestId,
            activeRequests: activeServerSynthesisRequests.size
        });
    }
}

const BASE_DEFAULT_SETTINGS = {
    speechRate: 1.5,
    wordHighlight: true,
    gapTrim: true,
    readUserMessages: false,
    readReferences: false,
    chatgptTextStyling: false,
    lowGapMode: false,
    serverPrecacheMode: false,
    serverTextNormalizationEnabled: true,
    serverQuotePolicy: 'strip',
    serverNormalizePunctuation: true,
    serverNormalizeWhitespace: true,
    serverRemoveCitationMarkers: true,
    serverRemoveMarkdownMarkers: true,
    serverCustomRemovalMode: 'exact',
    serverCustomExactRemovals: '',
    serverCustomRegexRemovals: '',
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
    },
    [PROFILE_FILE]: {
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
        if (url.protocol === 'file:') return PROFILE_FILE;

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
        },
        [PROFILE_FILE]: {
            ...getProfileDefaults(PROFILE_FILE),
            ...(storedProfiles[PROFILE_FILE] || {})
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
        // return true keeps the message port open; timer ensures sendResponse always fires
        const profile = getProfileFromUrl(request.url || sender?.tab?.url || '');
        const timer = setTimeout(() => sendResponse({ error: 'timeout' }), 10000);
        chrome.storage.sync.get(null).then(items => {
            clearTimeout(timer);
            sendResponse({ profile, settings: getSettingsForProfile(items || {}, profile) });
        }).catch(err => {
            clearTimeout(timer);
            sendResponse({ error: err.message });
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

    if (request.action === 'getServerVoices') {
        fetchServerVoices(request.baseUrl)
            .then((voices) => {
                sendResponse({ ok: true, voices });
            })
            .catch((error) => {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : String(error || 'Unknown server error'),
                    voices: []
                });
            });
        return true;
    }

    if (request.action === 'synthesizeServerTts') {
        synthesizeServerTts({
            ...request,
            ownerTabId: getSenderTabId(sender)
        })
            .then((payload) => {
                sendResponse({ ok: true, ...payload });
            })
            .catch((error) => {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : String(error || 'Unknown server error')
                });
            });
        return true;
    }

    if (request.action === 'cancelServerTtsRequest') {
        const requestId = typeof request.requestId === 'string' ? request.requestId.trim() : '';
        sendResponse({
            ok: true,
            cancelled: cancelServerRequest(requestId)
        });
        return false;
    }

    if (request.action === 'prefetchServerTts') {
        // Fire-and-forget prefetch - don't wait for response
        synthesizeServerTts({
            ...request,
            ownerTabId: getSenderTabId(sender)
        }).catch((_error) => {
            // Silently ignore prefetch errors - they're best-effort
        });
        sendResponse({ ok: true, prefetched: true });
        return false;
    }

    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
    cancelRequestsForTab(tabId);
    if (!playbackLockState) return;
    if (playbackLockState.tabId !== tabId) return;
    playbackLockState = null;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.discarded === true || changeInfo.status === 'unloaded') {
        cancelRequestsForTab(tabId);
    }
    if (!playbackLockState) return;
    if (playbackLockState.tabId !== tabId) return;
    if (changeInfo.discarded === true || changeInfo.status === 'unloaded') {
        playbackLockState = null;
    }
});
