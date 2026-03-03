// Background script for ChatGPT TTS Reader

// Default settings
const DEFAULT_SETTINGS = {
    speechRate: 5,
    wordHighlight: true,
    gapTrim: true,
    autoRead: false,
    loopOnEnd: true,
    showDiagnostics: true,
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

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    // Set default settings on install
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        chrome.storage.sync.set(items);
    });
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSettings') {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
            sendResponse(items);
        });
        return true; // Required for async response
    }
    return false;
});
