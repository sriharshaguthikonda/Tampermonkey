(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }
    const TTSReader = ns.TTSReader;

    const { SETTINGS_STORAGE_KEY, PROFILE_CHATGPT, BASE_DEFAULT_SETTINGS } = ns.constants;

    const { getCurrentProfile, getProfileDefaults, pickLegacySettings } = ns.helpers;

    // SECTION 22: Bottom-Level Bootstrap
    // -----------------------------------------------------------------------------
    // (See refactor_plan.md section B.1 for the canonical section list.)
    // =============================================================================

    function safeInit(label, fn) {
        try {
            fn();
        } catch (error) {
            const details = {
                module: label,
                error: String(error && error.message || error),
                stack: error && error.stack || ''
            };
            if (ns.diagnostics && typeof ns.diagnostics.log === 'function') {
                ns.diagnostics.log('error', 'Module init failed', details);
            } else {
                console.error('[TTSReader] Module init failed', details);
            }
        }
    }

    function getPlaybackState() {
        const synth = TTSReader.speechSynthesis;
        const hasSpeechActivity = Boolean(
            TTSReader.ttsActive ||
            (synth && (synth.speaking || synth.pending))
        );
        const hasQueuedSpeech = TTSReader.queuedParagraphs.size > 0;
        const hasActiveSession = Boolean(
            TTSReader.continuousReadingActive ||
            TTSReader.waitingForMoreContent ||
            hasSpeechActivity ||
            hasQueuedSpeech
        );
        if (!hasActiveSession) return 'stopped';
        return TTSReader.isPaused ? 'paused' : 'playing';
    }

    function applySettings(settings, options = {}) {
        if (!settings) return;
        const silent = options.silent === true;

        if (typeof settings.speechRate !== 'undefined') {
            const rate = Number(settings.speechRate);
            if (Number.isFinite(rate)) TTSReader.setSpeechRate(rate, silent);
        }
        if (typeof settings.voiceUri === 'string') {
            TTSReader.setVoiceUri(settings.voiceUri, silent);
        }
        if (typeof settings.emojiVoiceMappings !== 'undefined') {
            TTSReader.setEmojiVoiceMappings(settings.emojiVoiceMappings, true);
        }
        if (typeof settings.wordHighlight === 'boolean') {
            TTSReader.setWordHighlightEnabled(settings.wordHighlight, silent);
        }
        if (typeof settings.gapTrim === 'boolean') {
            TTSReader.setGapTrimEnabled(settings.gapTrim, silent);
        }
        if (typeof settings.autoRead === 'boolean') {
            TTSReader.setAutoReadEnabled(settings.autoRead, silent);
        }
        if (typeof settings.readUserMessages === 'boolean') {
            TTSReader.setReadUserMessagesEnabled(settings.readUserMessages, silent);
        }
        if (typeof settings.readReferences === 'boolean') {
            TTSReader.setReadReferencesEnabled(settings.readReferences, silent);
        }
        if (typeof settings.chatgptTextStyling === 'boolean') {
            TTSReader.setChatGPTTextStylingEnabled(settings.chatgptTextStyling, silent);
        }
        if (typeof settings.lowGapMode === 'boolean') {
            TTSReader.setLowGapMode(settings.lowGapMode, silent);
        }
        if (typeof settings.serverPrecacheMode === 'boolean') {
            TTSReader.setServerPrecacheMode(settings.serverPrecacheMode, silent);
        }
        if (typeof settings.serverTextNormalizationEnabled === 'boolean') {
            TTSReader.setServerTextNormalizationEnabled(settings.serverTextNormalizationEnabled, silent);
        }
        if (typeof settings.serverQuotePolicy === 'string') {
            TTSReader.setServerQuotePolicy(settings.serverQuotePolicy, silent);
        }
        if (typeof settings.serverNormalizePunctuation === 'boolean') {
            TTSReader.CONFIG.SERVER_NORMALIZE_PUNCTUATION = settings.serverNormalizePunctuation;
        }
        if (typeof settings.serverNormalizeWhitespace === 'boolean') {
            TTSReader.CONFIG.SERVER_NORMALIZE_WHITESPACE = settings.serverNormalizeWhitespace;
        }
        if (typeof settings.serverRemoveCitationMarkers === 'boolean') {
            TTSReader.CONFIG.SERVER_REMOVE_CITATION_MARKERS = settings.serverRemoveCitationMarkers;
        }
        if (typeof settings.serverRemoveMarkdownMarkers === 'boolean') {
            TTSReader.CONFIG.SERVER_REMOVE_MARKDOWN_MARKERS = settings.serverRemoveMarkdownMarkers;
        }
        if (typeof settings.serverCustomRemovalMode === 'string') {
            TTSReader.setServerCustomRemovalMode(settings.serverCustomRemovalMode, silent);
        }
        if (typeof settings.serverCustomExactRemovals === 'string') {
            TTSReader.CONFIG.SERVER_CUSTOM_EXACT_REMOVALS = settings.serverCustomExactRemovals;
        }
        if (typeof settings.serverCustomRegexRemovals === 'string') {
            TTSReader.CONFIG.SERVER_CUSTOM_REGEX_REMOVALS = settings.serverCustomRegexRemovals;
        }
        if (typeof settings.serverBaseUrl === 'string') {
            TTSReader.CONFIG.SERVER_BASE_URL = TTSReader.normalizeServerBaseUrl(settings.serverBaseUrl);
        }
        if (typeof settings.loopOnEnd === 'boolean') {
            TTSReader.setLoopEnabled(settings.loopOnEnd, silent);
        }
        if (typeof settings.autoScrollEnabled === 'boolean') {
            TTSReader.setAutoScrollEnabled(settings.autoScrollEnabled, silent);
        }
        if (typeof settings.idleArrowNavigation === 'boolean') {
            TTSReader.setIdleArrowNavigationEnabled(settings.idleArrowNavigation, silent);
        }
        if (typeof settings.promptHistoryNavEnabled === 'boolean') {
            TTSReader.setPromptHistoryNavigationEnabled(settings.promptHistoryNavEnabled, silent);
        }
        if (typeof settings.showPageOverlay === 'boolean') {
            TTSReader.setPageOverlayEnabled(settings.showPageOverlay, silent);
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'overlayPosition')) {
            TTSReader.setOverlayPosition(settings.overlayPosition, { silent: true });
        }
        if (typeof settings.volumeBoostEnabled === 'boolean') {
            TTSReader.setVolumeBoostEnabled(settings.volumeBoostEnabled, silent);
        }
        if (typeof settings.volumeBoostLevel !== 'undefined') {
            const level = Number(settings.volumeBoostLevel);
            if (Number.isFinite(level)) TTSReader.setVolumeBoostLevel(level, silent);
        }
        if (typeof settings.enterToSendEnabled === 'boolean') {
            TTSReader.setEnterToSendEnabled(settings.enterToSendEnabled, silent);
        }
        if (typeof settings.globalPasteEnabled === 'boolean') {
            TTSReader.setGlobalPasteEnabled(settings.globalPasteEnabled, silent);
        }
        if (typeof settings.regularPasteEnabled === 'boolean') {
            TTSReader.setRegularPasteEnabled(settings.regularPasteEnabled, silent);
        }
        if (typeof settings.regularAutoSend === 'boolean') {
            TTSReader.setRegularAutoSendEnabled(settings.regularAutoSend, silent);
        }
        if (typeof settings.regularAutoSendInInput === 'boolean') {
            TTSReader.setRegularAutoSendInInputEnabled(settings.regularAutoSendInInput, silent);
        }
        if (typeof settings.niceAutoPasteEnabled === 'boolean') {
            TTSReader.setNiceAutoPasteEnabled(settings.niceAutoPasteEnabled, silent);
        }
        if (typeof settings.niceAutoSend === 'boolean') {
            TTSReader.setNiceAutoSendEnabled(settings.niceAutoSend, silent);
        }
        if (typeof settings.copyButtonEnabled === 'boolean') {
            TTSReader.setCopyButtonEnabled(settings.copyButtonEnabled, silent);
        }
        if (typeof settings.smartCopyEnabled === 'boolean') {
            TTSReader.setSmartCopyEnabled(settings.smartCopyEnabled, silent);
        }
        if (typeof settings.smartCopyMode === 'string') {
            TTSReader.setSmartCopyMode(settings.smartCopyMode, silent);
        }
        if (typeof settings.copyFormat === 'string') {
            TTSReader.setCopyFormat(settings.copyFormat, silent);
        }
        if (typeof settings.clickStartSkipWords !== 'undefined') {
            TTSReader.setClickStartSkipWords(settings.clickStartSkipWords, true);
        }
        if (typeof settings.doubleClickEditEnabled === 'boolean') {
            TTSReader.setDoubleClickEditEnabled(settings.doubleClickEditEnabled, silent);
        }
        if (typeof settings.autoCloseLimitWarning === 'boolean') {
            TTSReader.setAutoCloseLimitWarningEnabled(settings.autoCloseLimitWarning, silent);
        }
        if (typeof settings.limitWarningDelay !== 'undefined') {
            const delay = Number(settings.limitWarningDelay);
            if (Number.isFinite(delay)) TTSReader.setLimitWarningDelay(delay, silent);
        }

        if (typeof settings.showDiagnostics === 'boolean') {
            TTSReader.CONFIG.SHOW_DIAGNOSTICS_PANEL = settings.showDiagnostics;
            if (!settings.showDiagnostics && TTSReader.diagnosticsPanel) {
                TTSReader.diagnosticsPanel.remove();
                TTSReader.diagnosticsPanel = null;
            }
        }
        if (typeof settings.debugLogging === 'boolean') {
            TTSReader.CONFIG.DEBUG_LOGGING = settings.debugLogging;
        }
        if (typeof settings.hiddenTabPolicy === 'string') {
            TTSReader.setHiddenTabPolicy(settings.hiddenTabPolicy, silent);
        }
        if (typeof settings.autoPauseHiddenDelayMs !== 'undefined') {
            const next = Number(settings.autoPauseHiddenDelayMs);
            if (Number.isFinite(next)) TTSReader.setAutoPauseHiddenDelayMs(next, silent);
        }

        if (typeof settings.queueLookahead !== 'undefined') {
            const next = Number(settings.queueLookahead);
            if (Number.isFinite(next)) TTSReader.CONFIG.QUEUE_LOOKAHEAD = next;
        }
        if (typeof settings.navFocusHoldMs !== 'undefined') {
            const next = Number(settings.navFocusHoldMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_FOCUS_HOLD_MS = next;
        }
        if (typeof settings.navKeyupReadDelayMs !== 'undefined') {
            const next = Number(settings.navKeyupReadDelayMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_KEYUP_READ_DELAY_MS = next;
        }
        if (typeof settings.navThrottleMs !== 'undefined') {
            const next = Number(settings.navThrottleMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_THROTTLE_MS = next;
        }
        if (typeof settings.navArrowJumpSegments !== 'undefined') {
            const next = Number(settings.navArrowJumpSegments);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_ARROW_JUMP_SEGMENTS = Math.max(1, Math.round(next));
        }
        if (typeof settings.navCtrlJumpSegments !== 'undefined') {
            const next = Number(settings.navCtrlJumpSegments);
            if (Number.isFinite(next)) TTSReader.CONFIG.NAV_CTRL_JUMP_SEGMENTS = Math.max(1, Math.round(next));
        }
        if (typeof settings.speedStep !== 'undefined') {
            const next = Number(settings.speedStep);
            if (Number.isFinite(next)) TTSReader.CONFIG.SPEED_STEP = Math.max(0.1, next);
        }
        if (typeof settings.scrollThrottleMs !== 'undefined') {
            const next = Number(settings.scrollThrottleMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.SCROLL_THROTTLE_MS = next;
        }
        if (typeof settings.scrollEdgePadding !== 'undefined') {
            const next = Number(settings.scrollEdgePadding);
            if (Number.isFinite(next)) TTSReader.CONFIG.SCROLL_EDGE_PADDING = next;
        }
        if (typeof settings.loopWaitMs !== 'undefined') {
            const next = Number(settings.loopWaitMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.LOOP_WAIT_MS = next;
        }
        if (typeof settings.waitForMoreMs !== 'undefined') {
            const next = Number(settings.waitForMoreMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.WAIT_FOR_MORE_MS = next;
        }
        if (typeof settings.autoReadCooldownMs !== 'undefined') {
            const next = Number(settings.autoReadCooldownMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.AUTO_READ_COOLDOWN_MS = next;
        }
        if (typeof settings.autoReadStableMs !== 'undefined') {
            const next = Number(settings.autoReadStableMs);
            if (Number.isFinite(next)) TTSReader.CONFIG.AUTO_READ_STABLE_MS = next;
        }
        if (typeof settings.autoReadMinParagraphs !== 'undefined') {
            const next = Number(settings.autoReadMinParagraphs);
            if (Number.isFinite(next)) TTSReader.CONFIG.AUTO_READ_MIN_PARAGRAPHS = next;
        }
        if (typeof settings.autoReadStartSkipChars !== 'undefined') {
            TTSReader.setAutoReadStartSkipChars(settings.autoReadStartSkipChars, true);
        }
        if (typeof settings.autoReadStartSkipAmount !== 'undefined') {
            TTSReader.setAutoReadStartSkipAmount(settings.autoReadStartSkipAmount, true);
        }
        if (typeof settings.autoReadStartSkipUnit !== 'undefined') {
            TTSReader.setAutoReadStartSkipUnit(settings.autoReadStartSkipUnit, true);
        }
        if (typeof settings.autoReadLoopCurrentMessage === 'boolean') {
            TTSReader.setAutoReadLoopCurrentMessage(settings.autoReadLoopCurrentMessage, silent);
        }
        if (typeof settings.applyStartSkipToNavigationStarts === 'boolean') {
            TTSReader.setApplyStartSkipToNavigationStarts(settings.applyStartSkipToNavigationStarts, silent);
        }
        if (settings.hotkeys && typeof settings.hotkeys === 'object') {
            TTSReader.setHotkeys(settings.hotkeys, true);
        }
    }

    function getStoredProfileSettings(items, profile) {
        const settingsByProfile = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
            ? items[SETTINGS_STORAGE_KEY]
            : {};
        const legacy = pickLegacySettings(items);
        return {
            ...getProfileDefaults(profile),
            ...(profile === PROFILE_CHATGPT ? legacy : {}),
            ...(settingsByProfile[profile] || {})
        };
    }

    function initWithStoredSettings() {
        chrome.storage.sync.get(null, (items) => {
            const profile = getCurrentProfile();
            TTSReader.settingsProfile = profile;
            const settings = getStoredProfileSettings(items || {}, profile);
            applySettings(settings, { silent: true });
            safeInit('TTSReader.init', () => TTSReader.init());
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync') return;

            if (Object.prototype.hasOwnProperty.call(changes, SETTINGS_STORAGE_KEY)) {
                const profile = TTSReader.settingsProfile || getCurrentProfile();
                const nextProfiles = changes[SETTINGS_STORAGE_KEY].newValue || {};
                const profileSettings = {
                    ...getProfileDefaults(profile),
                    ...(nextProfiles[profile] || {})
                };
                applySettings(profileSettings, { silent: true });
                return;
            }

            const legacyUpdated = {};
            for (const key of Object.keys(BASE_DEFAULT_SETTINGS)) {
                if (Object.prototype.hasOwnProperty.call(changes, key)) {
                    legacyUpdated[key] = changes[key].newValue;
                }
            }
            if (Object.keys(legacyUpdated).length > 0) {
                applySettings(legacyUpdated, { silent: true });
            }
        });
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
        safeInit('initWithStoredSettings', () => initWithStoredSettings());
    } else {
        safeInit('TTSReader.init', () => TTSReader.init());
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (!message || !message.action) return false;

            switch (message.action) {
                case 'startReading':
                    TTSReader.startReadingFromViewport();
                    break;
                case 'readFromTop':
                    TTSReader.startReadingFromTop();
                    break;
                case 'readSelection':
                    TTSReader.startReadingFromSelection();
                    break;
                case 'pauseResume':
                    TTSReader.pauseResumeTTS();
                    break;
                case 'stopReading':
                    TTSReader.stopTTS();
                    break;
                case 'navigate':
                    if (message.direction === 'prev') {
                        TTSReader.navigateImmediate(-1);
                    } else if (message.direction === 'next') {
                        TTSReader.navigateImmediate(1);
                    }
                    break;
                case 'setRate':
                    TTSReader.setSpeechRate(message.rate, true);
                    break;
                case 'getVoices':
                    TTSReader.fetchServerVoices(false).finally(() => {
                        sendResponse({
                            voices: TTSReader.getAvailableVoices(),
                            selectedVoiceUri: TTSReader.CONFIG.VOICE_URI
                        });
                    });
                    return true;
                case 'ttsLockRevoked':
                    TTSReader.handlePlaybackLockRevoked(message || {});
                    break;
                case 'applySettings':
                    applySettings(message.settings || {}, { silent: message.silent === true });
                    break;
                case 'setTextPreprocess':
                    if (typeof message.chars === 'string') {
                        const normalizedChars = message.chars;
                        TTSReader.CONFIG.TEXT_PREPROCESS_CHARS = normalizedChars;
                        TTSReader.CONFIG.SERVER_TEXT_NORMALIZATION_ENABLED = true;
                        TTSReader.CONFIG.SERVER_CUSTOM_REMOVAL_MODE = 'exact';
                        TTSReader.CONFIG.SERVER_CUSTOM_EXACT_REMOVALS = normalizedChars
                            .split(/\r?\n/g)
                            .map(line => line.trim())
                            .filter(Boolean)
                            .join('\n');
                        TTSReader.logPlaybackGuardEvent('text-preprocess-updated', {
                            chars: normalizedChars
                        });
                    }
                    break;
                case 'getState':
                    TTSReader.refreshParagraphsIfNeeded(false);
                    sendResponse({
                        state: getPlaybackState(),
                        profile: TTSReader.settingsProfile || getCurrentProfile(),
                        progress: {
                            current: TTSReader.currentParagraphIndex >= 0 ? TTSReader.currentParagraphIndex + 1 : 0,
                            total: TTSReader.paragraphsList.length
                        },
                        settings: {
                            speechRate: TTSReader.CONFIG.SPEECH_RATE,
                            voiceUri: TTSReader.CONFIG.VOICE_URI,
                            emojiVoiceMappings: TTSReader.CONFIG.EMOJI_VOICE_MAPPINGS,
                            wordHighlight: TTSReader.CONFIG.WORD_HIGHLIGHT_ENABLED,
                            gapTrim: TTSReader.CONFIG.GAP_TRIM_ENABLED,
                            readUserMessages: TTSReader.CONFIG.READ_USER_MESSAGES,
                            readReferences: TTSReader.CONFIG.READ_REFERENCES,
                            chatgptTextStyling: TTSReader.CONFIG.CHATGPT_TEXT_STYLING,
                            lowGapMode: TTSReader.CONFIG.LOW_GAP_MODE,
                            serverPrecacheMode: TTSReader.CONFIG.SERVER_PRECACHE_MODE,
                            serverTextNormalizationEnabled: TTSReader.CONFIG.SERVER_TEXT_NORMALIZATION_ENABLED,
                            serverQuotePolicy: TTSReader.CONFIG.SERVER_QUOTE_POLICY,
                            serverNormalizePunctuation: TTSReader.CONFIG.SERVER_NORMALIZE_PUNCTUATION,
                            serverNormalizeWhitespace: TTSReader.CONFIG.SERVER_NORMALIZE_WHITESPACE,
                            serverRemoveCitationMarkers: TTSReader.CONFIG.SERVER_REMOVE_CITATION_MARKERS,
                            serverRemoveMarkdownMarkers: TTSReader.CONFIG.SERVER_REMOVE_MARKDOWN_MARKERS,
                            serverCustomRemovalMode: TTSReader.CONFIG.SERVER_CUSTOM_REMOVAL_MODE,
                            autoRead: TTSReader.CONFIG.AUTO_READ_NEW_MESSAGES,
                            autoReadStartSkipChars: TTSReader.CONFIG.AUTO_READ_START_SKIP_CHARS,
                            autoReadStartSkipAmount: TTSReader.CONFIG.AUTO_READ_START_SKIP_AMOUNT,
                            autoReadStartSkipUnit: TTSReader.CONFIG.AUTO_READ_START_SKIP_UNIT,
                            autoReadLoopCurrentMessage: TTSReader.CONFIG.AUTO_READ_LOOP_CURRENT_MESSAGE,
                            applyStartSkipToNavigationStarts: TTSReader.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS,
                            loopOnEnd: TTSReader.CONFIG.LOOP_ON_END,
                            autoScrollEnabled: TTSReader.CONFIG.AUTO_SCROLL_ENABLED,
                            idleArrowNavigation: TTSReader.CONFIG.IDLE_ARROW_NAVIGATION,
                            promptHistoryNavEnabled: TTSReader.CONFIG.PROMPT_HISTORY_NAV_ENABLED,
                            showPageOverlay: TTSReader.CONFIG.SHOW_PAGE_OVERLAY,
                            overlayPosition: TTSReader.CONFIG.OVERLAY_POSITION,
                            showDiagnostics: TTSReader.CONFIG.SHOW_DIAGNOSTICS_PANEL,
                            debugLogging: TTSReader.CONFIG.DEBUG_LOGGING,
                            hiddenTabPolicy: TTSReader.CONFIG.HIDDEN_TAB_POLICY,
                            autoPauseHiddenDelayMs: TTSReader.CONFIG.AUTO_PAUSE_HIDDEN_DELAY_MS,
                            volumeBoostEnabled: TTSReader.CONFIG.VOLUME_BOOST_ENABLED,
                            volumeBoostLevel: TTSReader.CONFIG.VOLUME_BOOST_LEVEL,
                            enterToSendEnabled: TTSReader.CONFIG.ENTER_TO_SEND_ENABLED,
                            globalPasteEnabled: TTSReader.CONFIG.GLOBAL_PASTE_ENABLED,
                            regularPasteEnabled: TTSReader.CONFIG.REGULAR_PASTE_ENABLED,
                            regularAutoSend: TTSReader.CONFIG.REGULAR_AUTO_SEND,
                            regularAutoSendInInput: TTSReader.CONFIG.REGULAR_AUTO_SEND_IN_INPUT,
                            niceAutoPasteEnabled: TTSReader.CONFIG.NICE_AUTO_PASTE_ENABLED,
                            niceAutoSend: TTSReader.CONFIG.NICE_AUTO_SEND,
                            copyButtonEnabled: TTSReader.CONFIG.COPY_BUTTON_ENABLED,
                            smartCopyEnabled: TTSReader.CONFIG.SMART_COPY_ENABLED,
                            smartCopyMode: TTSReader.CONFIG.SMART_COPY_MODE,
                            copyFormat: TTSReader.CONFIG.COPY_FORMAT,
                            clickStartSkipWords: TTSReader.CONFIG.CLICK_START_SKIP_WORDS,
                            doubleClickEditEnabled: TTSReader.CONFIG.DOUBLE_CLICK_EDIT_ENABLED,
                            autoCloseLimitWarning: TTSReader.CONFIG.AUTO_CLOSE_LIMIT_WARNING,
                            limitWarningDelay: TTSReader.CONFIG.LIMIT_WARNING_DELAY_MS,
                            navArrowJumpSegments: TTSReader.CONFIG.NAV_ARROW_JUMP_SEGMENTS,
                            navCtrlJumpSegments: TTSReader.CONFIG.NAV_CTRL_JUMP_SEGMENTS,
                            speedStep: TTSReader.CONFIG.SPEED_STEP,
                            hotkeys: {
                                activate: TTSReader.CONFIG.HOTKEYS.ACTIVATE,
                                pauseResume: TTSReader.CONFIG.HOTKEYS.PAUSE_RESUME,
                                navNext: TTSReader.CONFIG.HOTKEYS.NAV_NEXT,
                                navPrev: TTSReader.CONFIG.HOTKEYS.NAV_PREV,
                                stop: TTSReader.CONFIG.HOTKEYS.STOP,
                                boundaryStart: TTSReader.CONFIG.HOTKEYS.BOUNDARY_START,
                                boundaryEnd: TTSReader.CONFIG.HOTKEYS.BOUNDARY_END,
                                sessionPause: TTSReader.CONFIG.HOTKEYS.SESSION_PAUSE,
                                speedDown: TTSReader.CONFIG.HOTKEYS.SPEED_DOWN,
                                speedUp: TTSReader.CONFIG.HOTKEYS.SPEED_UP,
                                replay: TTSReader.CONFIG.HOTKEYS.REPLAY,
                                loopToggle: TTSReader.CONFIG.HOTKEYS.LOOP_TOGGLE,
                                autoScrollToggle: TTSReader.CONFIG.HOTKEYS.AUTOSCROLL_TOGGLE
                            }
                        }
                    });
                    return true;
            }

            return false;
        });
    }
})();
