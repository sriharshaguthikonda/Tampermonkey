(function () {
    'use strict';

    const ns = window.__TTSNS;
    const LOG_PREFIX = '[ChatGPT TTS Reader]';
    const DEBUG_STORAGE_KEY = 'chatgptTtsDebug';

    function isDebugEnabled() {
        try {
            return localStorage.getItem(DEBUG_STORAGE_KEY) !== 'false';
        } catch (_error) {
            return true;
        }
    }

    function activeElementInfo() {
        const element = document.activeElement;
        if (!element) return null;
        return {
            tagName: element.tagName || '',
            id: element.id || '',
            role: element.getAttribute ? (element.getAttribute('role') || '') : '',
            isContentEditable: Boolean(element.isContentEditable),
            className: typeof element.className === 'string' ? element.className.slice(0, 160) : ''
        };
    }

    function pageSnapshot(extra = {}) {
        return {
            ts: new Date().toISOString(),
            href: window.location.href,
            readyState: document.readyState,
            visibilityState: document.visibilityState,
            hasBody: Boolean(document.body),
            hasHead: Boolean(document.head),
            bodyChildCount: document.body ? document.body.childElementCount : 0,
            appRootPresent: Boolean(document.querySelector('#__next, #root, main, [data-testid="conversation-turn"]')),
            activeElement: activeElementInfo(),
            ...extra
        };
    }

    function log(level, event, details = {}) {
        if (!isDebugEnabled() && level !== 'warn' && level !== 'error') return;
        const logger = console[level] || console.log;
        try {
            logger.call(console, LOG_PREFIX, event, pageSnapshot(details));
        } catch (_error) {
            console.log(LOG_PREFIX, event);
        }
    }

    if (!ns || !ns.TTSReader) {
        log('error', 'Diagnostics loaded before namespace was ready', {
            hasNamespace: Boolean(ns),
            hasTTSReader: Boolean(ns && ns.TTSReader)
        });
        return;
    }

    const TTSReader = ns.TTSReader;

    function getReaderSnapshot() {
        return {
            ttsActive: Boolean(TTSReader.ttsActive),
            isPaused: Boolean(TTSReader.isPaused),
            continuousReadingActive: Boolean(TTSReader.continuousReadingActive),
            pageFullyLoaded: Boolean(TTSReader.pageFullyLoaded),
            paragraphsDirty: Boolean(TTSReader.paragraphsDirty),
            paragraphCount: Array.isArray(TTSReader.paragraphsList) ? TTSReader.paragraphsList.length : null,
            currentParagraphIndex: TTSReader.currentParagraphIndex,
            pendingNavIndex: TTSReader.pendingNavIndex,
            settingsProfile: TTSReader.settingsProfile,
            isChatGPTPage: Boolean(TTSReader.isChatGPTPage),
            waitingForMoreContent: Boolean(TTSReader.waitingForMoreContent),
            hasSpeechSynthesis: Boolean(TTSReader.speechSynthesis),
            speechSynthesisState: TTSReader.speechSynthesis ? {
                speaking: Boolean(TTSReader.speechSynthesis.speaking),
                pending: Boolean(TTSReader.speechSynthesis.pending),
                paused: Boolean(TTSReader.speechSynthesis.paused)
            } : null,
            config: TTSReader.CONFIG ? {
                autoRead: Boolean(TTSReader.CONFIG.AUTO_READ_NEW_MESSAGES),
                showOverlay: Boolean(TTSReader.CONFIG.SHOW_PAGE_OVERLAY),
                serverBaseUrl: TTSReader.CONFIG.SERVER_BASE_URL,
                wordHighlight: Boolean(TTSReader.CONFIG.WORD_HIGHLIGHT_ENABLED),
                idleArrowNavigation: Boolean(TTSReader.CONFIG.IDLE_ARROW_NAVIGATION)
            } : null
        };
    }

    function getDiagnostics(extra = {}) {
        return pageSnapshot({
            reader: getReaderSnapshot(),
            diagnosticsDebugEnabled: isDebugEnabled(),
            ...extra
        });
    }

    ns.diagnostics = {
        LOG_PREFIX,
        DEBUG_STORAGE_KEY,
        log,
        pageSnapshot,
        getDiagnostics,
        enable() {
            try { localStorage.removeItem(DEBUG_STORAGE_KEY); } catch (_error) { /* ignore */ }
            log('info', 'Diagnostics enabled');
        },
        disable() {
            try { localStorage.setItem(DEBUG_STORAGE_KEY, 'false'); } catch (_error) { /* ignore */ }
            log('warn', 'Diagnostics disabled after this message');
        }
    };

    ns.helpers = ns.helpers || {};
    ns.helpers.logDiagnostic = log;
    ns.helpers.getDiagnostics = getDiagnostics;

    TTSReader.logDiagnostic = log;
    TTSReader.getDiagnosticsSnapshot = getDiagnostics;

    const originalInit = typeof TTSReader.init === 'function' ? TTSReader.init.bind(TTSReader) : null;
    if (originalInit && !TTSReader.__diagnosticInitWrapped) {
        TTSReader.init = function diagnosticInitWrapper(...args) {
            log('info', 'TTSReader.init starting', { argsLength: args.length });
            try {
                const result = originalInit(...args);
                if (result && typeof result.then === 'function') {
                    return result
                        .then((value) => {
                            log('info', 'TTSReader.init resolved', { reader: getReaderSnapshot() });
                            return value;
                        })
                        .catch((error) => {
                            log('error', 'TTSReader.init rejected', {
                                error: error && error.message ? error.message : String(error),
                                stack: error && error.stack ? error.stack : ''
                            });
                            throw error;
                        });
                }
                log('info', 'TTSReader.init returned', { reader: getReaderSnapshot() });
                return result;
            } catch (error) {
                log('error', 'TTSReader.init threw', {
                    error: error && error.message ? error.message : String(error),
                    stack: error && error.stack ? error.stack : ''
                });
                throw error;
            }
        };
        TTSReader.__diagnosticInitWrapped = true;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (!message || !message.action) return false;

            log('debug', 'Runtime message observed by diagnostics', {
                action: message.action,
                senderId: sender && sender.id ? sender.id : '',
                senderUrl: sender && sender.url ? sender.url : '',
                senderTabId: sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : null
            });

            if (message.action === 'getDiagnostics') {
                sendResponse(getDiagnostics({ source: 'diagnostics-listener' }));
                return true;
            }

            return false;
        });
    }

    window.__TTSDiag = ns.diagnostics;

    window.addEventListener('error', (event) => {
        log('error', 'Window error observed', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            errorStack: event.error && event.error.stack ? event.error.stack : ''
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        log('error', 'Unhandled promise rejection observed', {
            reason: event.reason && event.reason.message ? event.reason.message : String(event.reason || ''),
            stack: event.reason && event.reason.stack ? event.reason.stack : ''
        });
    });

    log('info', 'Diagnostics module loaded', {
        manifestModule: 'modules/05-diagnostics.js',
        hasChromeRuntime: Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)
    });

    setTimeout(() => log('info', '5-second page health check', { reader: getReaderSnapshot() }), 5000);
    setTimeout(() => log('info', '15-second page health check', { reader: getReaderSnapshot() }), 15000);
})();
