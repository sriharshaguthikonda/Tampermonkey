(function () {
    'use strict';

    const ns = window.__TTSNS;
    const LOG_PREFIX = '[ChatGPT TTS Reader]';
    const DEBUG_STORAGE_KEY = 'chatgptTtsDebug';
    const DIAGNOSTICS_BUFFER_KEY = 'ttsDiagnosticsBuffer';
    const BUFFER_LIMIT = 500;
    const EXPORT_LIMIT = 100;
    const STORAGE_FLUSH_INTERVAL_MS = 5000;
    const diagnosticsBuffer = [];
    let lastStorageFlushAt = 0;
    let storageFlushTimer = null;
    let lastEnvHeader = null;
    let longTaskObserver = null;
    let verboseCaptureActive = false;

    function isDebugEnabled() {
        try {
            const override = localStorage.getItem(DEBUG_STORAGE_KEY);
            if (override === 'true') return true;
            if (override === 'false') return false;
        } catch (_error) {
            // Fall through to configured defaults.
        }
        if (ns && ns.TTSReader && ns.TTSReader.CONFIG && typeof ns.TTSReader.CONFIG.DEBUG_LOGGING === 'boolean') {
            return ns.TTSReader.CONFIG.DEBUG_LOGGING;
        }
        if (ns && ns.BUILD && ns.BUILD.channel === 'dev') return true;
        return false;
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

    function getEnvHeader() {
        let extensionVersion = '';
        try {
            extensionVersion = chrome.runtime.getManifest().version || '';
        } catch (_error) {
            extensionVersion = '';
        }
        return {
            extensionVersion,
            channel: (ns && ns.BUILD && ns.BUILD.channel) || 'source',
            url: location.href,
            ua: navigator.userAgent,
            savedAt: new Date().toISOString()
        };
    }

    function truncateString(value) {
        const text = String(value);
        return text.length > 500 ? `${text.slice(0, 500)}...` : text;
    }

    function stringifyDetailValue(value) {
        try {
            return truncateString(JSON.stringify(value));
        } catch (_error) {
            return truncateString(String(value));
        }
    }

    function sanitizeDetailValue(value) {
        if (value == null) return value;
        const type = typeof value;
        if (type === 'string') return truncateString(value);
        if (type === 'number' || type === 'boolean') return value;
        if (type === 'bigint') return String(value);
        if (value instanceof Error) {
            return {
                name: truncateString(value.name || 'Error'),
                message: truncateString(value.message || ''),
                stack: truncateString(value.stack || '')
            };
        }
        if (typeof Node !== 'undefined' && value instanceof Node) {
            return `[Node ${value.nodeName || 'unknown'}]`;
        }
        if (Array.isArray(value) || type === 'object') return stringifyDetailValue(value);
        return truncateString(value);
    }

    function sanitizeDetails(details) {
        const source = details && typeof details === 'object' ? details : {};
        const copy = {};
        for (const key of Object.keys(source).slice(0, 40)) {
            copy[key] = sanitizeDetailValue(source[key]);
        }
        return copy;
    }

    function getDiagnosticsStorageArea(preferSession = true) {
        if (typeof chrome === 'undefined' || !chrome.storage) return null;
        if (preferSession && chrome.storage.session) return chrome.storage.session;
        return chrome.storage.local || null;
    }

    function flushDiagnosticsBuffer(force = false) {
        const area = getDiagnosticsStorageArea(true);
        if (!area || typeof area.set !== 'function') return;
        const now = Date.now();
        const elapsed = now - lastStorageFlushAt;
        if (!force && elapsed < STORAGE_FLUSH_INTERVAL_MS) {
            if (!storageFlushTimer) {
                storageFlushTimer = setTimeout(() => {
                    storageFlushTimer = null;
                    flushDiagnosticsBuffer(true);
                }, STORAGE_FLUSH_INTERVAL_MS - elapsed);
            }
            return;
        }
        lastStorageFlushAt = now;
        lastEnvHeader = getEnvHeader();
        const payload = {
            env: lastEnvHeader,
            entries: diagnosticsBuffer.slice()
        };
        try {
            area.set({ [DIAGNOSTICS_BUFFER_KEY]: payload });
        } catch (_error) {
            const fallback = getDiagnosticsStorageArea(false);
            if (fallback && fallback !== area && typeof fallback.set === 'function') {
                try { fallback.set({ [DIAGNOSTICS_BUFFER_KEY]: payload }); } catch (__error) { /* ignore */ }
            }
        }
    }

    function appendBufferEntry(level, event, details) {
        diagnosticsBuffer.push({
            ts: new Date().toISOString(),
            level,
            event,
            details: sanitizeDetails(details)
        });
        while (diagnosticsBuffer.length > BUFFER_LIMIT) {
            diagnosticsBuffer.shift();
        }
        flushDiagnosticsBuffer(false);
    }

    function getLongTaskAttribution(entry) {
        const attribution = entry && entry.attribution && entry.attribution[0];
        return attribution && attribution.name ? String(attribution.name) : '';
    }

    function startVerboseCapture() {
        if (verboseCaptureActive) return;
        verboseCaptureActive = true;
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            longTaskObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    log('debug', 'Long task observed', {
                        duration: Math.round(entry.duration || 0),
                        startTime: Math.round(entry.startTime || 0),
                        attributionName: getLongTaskAttribution(entry)
                    });
                }
            });
            longTaskObserver.observe({ entryTypes: ['longtask'] });
        } catch (error) {
            longTaskObserver = null;
            log('warn', 'Long task observer unavailable', {
                error: error && error.message ? error.message : String(error || '')
            });
        }
    }

    function stopVerboseCapture() {
        verboseCaptureActive = false;
        if (!longTaskObserver) return;
        try { longTaskObserver.disconnect(); } catch (_error) { /* ignore */ }
        longTaskObserver = null;
    }

    function syncVerboseCapture() {
        if (isDebugEnabled()) {
            startVerboseCapture();
        } else {
            stopVerboseCapture();
        }
    }

    function log(level, event, details = {}) {
        if (!isDebugEnabled() && level !== 'warn' && level !== 'error') return;
        appendBufferEntry(level, event, details);
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
        const env = getEnvHeader();
        lastEnvHeader = env;
        return pageSnapshot({
            env,
            buffer: diagnosticsBuffer.slice(-EXPORT_LIMIT),
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
        flush: () => flushDiagnosticsBuffer(true),
        enable() {
            try { localStorage.setItem(DEBUG_STORAGE_KEY, 'true'); } catch (_error) { /* ignore */ }
            syncVerboseCapture();
            log('info', 'Diagnostics enabled');
        },
        disable() {
            try { localStorage.setItem(DEBUG_STORAGE_KEY, 'false'); } catch (_error) { /* ignore */ }
            syncVerboseCapture();
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

    window.addEventListener('securitypolicyviolation', (event) => {
        log('warn', 'Security policy violation observed', {
            violatedDirective: event.violatedDirective || '',
            blockedURI: event.blockedURI || '',
            sourceFile: event.sourceFile || '',
            line: event.lineNumber || 0
        });
    });

    window.addEventListener('pagehide', () => {
        flushDiagnosticsBuffer(true);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushDiagnosticsBuffer(true);
        }
    });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync' || !changes) return;
            setTimeout(syncVerboseCapture, 0);
        });
    }

    log('info', 'Diagnostics module loaded', {
        manifestModule: 'modules/05-diagnostics.js',
        hasChromeRuntime: Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)
    });

    syncVerboseCapture();

    setTimeout(() => log('info', '5-second page health check', { reader: getReaderSnapshot() }), 5000);
    setTimeout(() => log('info', '15-second page health check', { reader: getReaderSnapshot() }), 15000);
})();
