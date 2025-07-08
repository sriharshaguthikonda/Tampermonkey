// Background script for ChatGPT TTS Reader

// Default settings
const DEFAULT_SETTINGS = {
    speechRate: 1.3,
    voiceName: '',
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
