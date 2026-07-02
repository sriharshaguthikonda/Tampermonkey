// Background script for ChatGPT TTS Reader

const LOG_PREFIX = '[ChatGPT TTS Reader:background]';

function log(level, message, details = {}) {
    const logger = console[level] || console.log;
    try {
        logger.call(console, LOG_PREFIX, message, {
            ts: new Date().toISOString(),
            ...details
        });
    } catch (_) {
        console.log(LOG_PREFIX, message);
    }
}

// Default settings
const DEFAULT_SETTINGS = {
    speechRate: 1.3,
    voiceName: '',
    hotkeys: {
        // Content script now requires Ctrl+Shift for activate and pause/resume.
        activate: 'Ctrl+Shift+U',
        pauseResume: 'Ctrl+Shift+P',
        navNext: 'ArrowRight',
        navPrev: 'ArrowLeft',
        stop: 'Escape'
    }
};

log('info', 'Background service worker loaded', {
    hasRuntimeId: !!chrome?.runtime?.id
});

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
    log('info', 'Extension installed/updated', {
        reason: details.reason,
        previousVersion: details.previousVersion || null
    });

    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        if (chrome.runtime.lastError) {
            log('error', 'Failed to read settings during install/update', {
                error: chrome.runtime.lastError.message
            });
            return;
        }

        chrome.storage.sync.set(items, () => {
            if (chrome.runtime.lastError) {
                log('error', 'Failed to write default settings', {
                    error: chrome.runtime.lastError.message
                });
                return;
            }

            log('info', 'Default settings ensured', { settings: items });
        });
    });
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('info', 'Runtime message received', {
        action: request?.action,
        type: request?.type,
        senderTabId: sender?.tab?.id || null,
        senderUrl: sender?.url || sender?.tab?.url || null
    });

    if (request.action === 'getSettings') {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
            if (chrome.runtime.lastError) {
                log('error', 'Failed to get settings', {
                    error: chrome.runtime.lastError.message
                });
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
                return;
            }

            log('info', 'Settings returned', { settings: items });
            sendResponse({ ok: true, ...items });
        });
        return true;
    }

    if (request.type === 'stateUpdate') {
        log('debug', 'State update observed', request);
        return false;
    }

    log('debug', 'No background handler for message', { request });
    return false;
});
