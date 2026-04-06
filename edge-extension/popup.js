document.addEventListener('DOMContentLoaded', () => {
    const SETTINGS_STORAGE_KEY = 'settingsByProfile';
    const OPTIONS_PROFILE_HINT_KEY = 'optionsPreferredProfile';
    const PROFILE_CHATGPT = 'chatgpt';
    const PROFILE_LOCAL = 'local';
    const PROFILE_FILE = 'file';

    const BASE_DEFAULT_SETTINGS = {
        speechRate: 5,
        voiceUri: '',
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
        idleArrowNavigation: true,
        promptHistoryNavEnabled: true,
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
        navCtrlJumpSegments: 5,
        speedStep: 0.2
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

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const readSelectionBtn = document.getElementById('readSelectionBtn');
    const readTopBtn = document.getElementById('readTopBtn');
    const rateSlider = document.getElementById('rateSlider');
    const rateValue = document.getElementById('rateValue');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const voiceSelect = document.getElementById('voiceSelect');
    const statusDiv = document.getElementById('status');
    const progressDiv = document.getElementById('progress');
    const lockInfoDiv = document.getElementById('lockInfo');
    const optionsBtn = document.getElementById('optionsBtn');
    const resetOverlayBtn = document.getElementById('resetOverlayBtn');

    const highlightToggle = document.getElementById('highlightToggle');
    const gapTrimToggle = document.getElementById('gapTrimToggle');
    const readUserMessagesToggle = document.getElementById('readUserMessagesToggle');
    const readReferencesToggle = document.getElementById('readReferencesToggle');
    const chatStyleToggle = document.getElementById('chatStyleToggle');
    const lowGapToggle = document.getElementById('lowGapToggle');
    const serverPrecacheToggle = document.getElementById('serverPrecacheToggle');
    const serverTextNormalizationToggle = document.getElementById('serverTextNormalizationToggle');
    const serverQuotePolicySelect = document.getElementById('serverQuotePolicySelect');
    const autoReadToggle = document.getElementById('autoReadToggle');
    const loopToggle = document.getElementById('loopToggle');
    const autoScrollToggle = document.getElementById('autoScrollToggle');
    const idleArrowNavigationToggle = document.getElementById('idleArrowNavigationToggle');
    const promptHistoryNavToggle = document.getElementById('promptHistoryNavToggle');
    const pageOverlayToggle = document.getElementById('pageOverlayToggle');
    const diagnosticsToggle = document.getElementById('diagnosticsToggle');
    const hiddenTabPolicySelect = document.getElementById('hiddenTabPolicySelect');
    const autoPauseHiddenDelayInput = document.getElementById('autoPauseHiddenDelayInput');
    const volumeBoostToggle = document.getElementById('volumeBoostToggle');
    const enterToSendToggle = document.getElementById('enterToSendToggle');
    const globalPasteToggle = document.getElementById('globalPasteToggle');
    const regularPasteToggle = document.getElementById('regularPasteToggle');
    const regularAutoSendToggle = document.getElementById('regularAutoSendToggle');
    const regularAutoSendInInputToggle = document.getElementById('regularAutoSendInInputToggle');
    const nicePasteToggle = document.getElementById('nicePasteToggle');
    const niceSendToggle = document.getElementById('niceSendToggle');
    const copyButtonsToggle = document.getElementById('copyButtonsToggle');
    const doubleClickEditToggle = document.getElementById('doubleClickEditToggle');
    const autoCloseWarningsToggle = document.getElementById('autoCloseWarningsToggle');

    let activeTabId = null;
    let activeProfile = PROFILE_CHATGPT;
    let availableVoices = [];

    function getProfileFromUrl(urlLike) {
        try {
            const url = new URL(urlLike || '');
            if (url.protocol === 'file:') return PROFILE_FILE;
            const host = (url.hostname || '').toLowerCase();
            if (host === 'chatgpt.com' || host === 'chat.openai.com') return PROFILE_CHATGPT;
            if (host === 'localhost' || host === '127.0.0.1') return PROFILE_LOCAL;
        } catch (_error) {
            // fall through
        }
        return PROFILE_CHATGPT;
    }

    function getProfileDefaults(profile) {
        return PROFILE_DEFAULT_SETTINGS[profile] || PROFILE_DEFAULT_SETTINGS[PROFILE_CHATGPT];
    }

    function normalizeQuotePolicy(policy) {
        const next = typeof policy === 'string' ? policy.trim().toLowerCase() : '';
        if (next === 'keep' || next === 'normalize' || next === 'strip') return next;
        return 'strip';
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

    function getStoredProfileSettings(callback) {
        chrome.storage.sync.get(null, (items) => {
            const settingsByProfile = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
                ? items[SETTINGS_STORAGE_KEY]
                : {};
            const legacy = pickLegacySettings(items || {});
            const merged = {
                ...getProfileDefaults(activeProfile),
                ...(activeProfile === PROFILE_CHATGPT ? legacy : {}),
                ...(settingsByProfile[activeProfile] || {})
            };
            callback(merged);
        });
    }

    function sendMessage(action, data = {}) {
        if (activeTabId) {
            chrome.tabs.sendMessage(activeTabId, { action, ...data });
            return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action, ...data });
            }
        });
    }

    function showStatus(message) {
        statusDiv.textContent = message;
        statusDiv.classList.add('active');
    }

    function hideStatus() {
        statusDiv.classList.remove('active');
    }

    function updateUI(state) {
        switch (state) {
            case 'playing':
                startBtn.disabled = true;
                stopBtn.disabled = false;
                pauseBtn.disabled = false;
                pauseBtn.innerHTML = '<span class="material-icons">pause</span> Pause';
                showStatus('Reading...');
                break;
            case 'paused':
                startBtn.disabled = true;
                stopBtn.disabled = false;
                pauseBtn.disabled = false;
                pauseBtn.innerHTML = '<span class="material-icons">play_arrow</span> Resume';
                showStatus('Paused');
                break;
            default:
                startBtn.disabled = false;
                stopBtn.disabled = true;
                pauseBtn.disabled = true;
                pauseBtn.innerHTML = '<span class="material-icons">pause</span> Pause';
                hideStatus();
        }
    }

    function updateProgress(progress) {
        if (!progress || !progressDiv) return;
        if (!progress.total || !progress.current) {
            progressDiv.textContent = '';
            return;
        }
        progressDiv.textContent = `Progress: ${progress.current}/${progress.total}`;
    }

    function updateLockInfo(lock) {
        if (!lockInfoDiv) return;
        if (!lock) {
            lockInfoDiv.textContent = 'Lock: free';
            return;
        }
        if (activeTabId && Number.isInteger(lock.tabId) && lock.tabId === activeTabId) {
            lockInfoDiv.textContent = 'Lock: this tab';
            return;
        }
        const age = Number.isFinite(lock.ageMs) ? `${Math.round(lock.ageMs)}ms` : '--';
        lockInfoDiv.textContent = `Lock: another tab (tab ${lock.tabId ?? '?'}, ${age})`;
    }

    function requestLockState() {
        chrome.runtime.sendMessage({ action: 'getPlaybackLockState' }, (response) => {
            if (chrome.runtime.lastError || !response) return;
            updateLockInfo(response.lock || null);
        });
    }

    function formatVoiceLabel(voice) {
        const suffix = voice.default ? ' (Default)' : '';
        const sourceSuffix = voice && voice.source === 'server' ? ' [Server]' : '';
        return `${voice.name} - ${voice.lang}${suffix}${sourceSuffix}`;
    }

    function updateVoiceSelect(voices, selectedVoiceUri = '') {
        if (!voiceSelect) return;

        const normalizedVoices = Array.isArray(voices) ? voices : [];
        const nextSignature = JSON.stringify(normalizedVoices.map(v => [v.voiceURI, v.name, v.lang, v.default]));
        const currentSignature = JSON.stringify(availableVoices.map(v => [v.voiceURI, v.name, v.lang, v.default]));
        const shouldRebuild = nextSignature !== currentSignature || voiceSelect.options.length <= 1;

        if (shouldRebuild) {
            availableVoices = normalizedVoices;
            voiceSelect.innerHTML = '';
            const autoOption = document.createElement('option');
            autoOption.value = '';
            autoOption.textContent = 'Auto voice';
            voiceSelect.appendChild(autoOption);

            normalizedVoices.forEach((voice) => {
                const option = document.createElement('option');
                option.value = voice.voiceURI;
                option.textContent = formatVoiceLabel(voice);
                voiceSelect.appendChild(option);
            });
        }

        const desired = typeof selectedVoiceUri === 'string' ? selectedVoiceUri : '';
        if (voiceSelect.value !== desired) {
            voiceSelect.value = desired;
        }
        if (voiceSelect.value !== desired) {
            voiceSelect.value = '';
        }
    }

    function mergeVoiceLists(primary, secondary) {
        const seen = new Set(primary.map(v => v.voiceURI));
        return [...primary, ...secondary.filter(v => !seen.has(v.voiceURI))];
    }

    function fetchServerVoicesDirectly(onComplete) {
        chrome.runtime.sendMessage({ action: 'getServerVoices' }, (response) => {
            if (chrome.runtime.lastError || !response || !Array.isArray(response.voices)) {
                if (onComplete) onComplete([]);
                return;
            }
            if (onComplete) onComplete(response.voices);
        });
    }

    function requestVoiceList() {
        // Fetch server voices directly from background so the dropdown populates
        // regardless of whether the content script has already fetched them.
        fetchServerVoicesDirectly((serverVoices) => {
            const selectedUri = typeof availableVoices.find(v => v.voiceURI === voiceSelect.value) !== 'undefined'
                ? voiceSelect.value
                : '';
            const currentBrowserVoices = availableVoices.filter(v => v.source !== 'server');
            const merged = mergeVoiceLists(currentBrowserVoices, serverVoices);
            if (merged.length > 0) {
                getStoredProfileSettings((settings) => {
                    updateVoiceSelect(merged, settings.voiceUri || selectedUri);
                });
            }
        });

        if (!activeTabId) return;
        chrome.tabs.sendMessage(activeTabId, { action: 'getVoices' }, (response) => {
            if (chrome.runtime.lastError || !response) return;
            const contentVoices = response.voices || [];
            const serverDirect = availableVoices.filter(v => v.source === 'server');
            const merged = mergeVoiceLists(contentVoices, serverDirect);
            updateVoiceSelect(merged, response.selectedVoiceUri || '');
        });
    }

    function applySettingsToUI(settings) {
        const defaults = getProfileDefaults(activeProfile);
        const rate = Number(settings.speechRate ?? defaults.speechRate);
        rateSlider.value = rate;
        rateValue.textContent = `${rate.toFixed(1)}x`;
        const selectedVoiceUri = typeof settings.voiceUri === 'string' ? settings.voiceUri : '';
        updateVoiceSelect(availableVoices, selectedVoiceUri);
        const volume = Number(settings.volumeBoostLevel ?? defaults.volumeBoostLevel);
        volumeSlider.value = volume;
        volumeValue.textContent = `${volume.toFixed(1)}x`;
        highlightToggle.checked = Boolean(settings.wordHighlight);
        gapTrimToggle.checked = Boolean(settings.gapTrim);
        readUserMessagesToggle.checked = Boolean(settings.readUserMessages);
        readReferencesToggle.checked = Boolean(settings.readReferences);
        chatStyleToggle.checked = Boolean(settings.chatgptTextStyling);
        lowGapToggle.checked = Boolean(settings.lowGapMode);
        serverPrecacheToggle.checked = Boolean(settings.serverPrecacheMode);
        serverTextNormalizationToggle.checked = Boolean(settings.serverTextNormalizationEnabled);
        serverQuotePolicySelect.value = normalizeQuotePolicy(settings.serverQuotePolicy);
        autoReadToggle.checked = Boolean(settings.autoRead);
        loopToggle.checked = Boolean(settings.loopOnEnd);
        autoScrollToggle.checked = Boolean(settings.autoScrollEnabled);
        idleArrowNavigationToggle.checked = Boolean(settings.idleArrowNavigation);
        promptHistoryNavToggle.checked = Boolean(settings.promptHistoryNavEnabled);
        pageOverlayToggle.checked = Boolean(settings.showPageOverlay);
        diagnosticsToggle.checked = Boolean(settings.showDiagnostics);
        hiddenTabPolicySelect.value = String(settings.hiddenTabPolicy || defaults.hiddenTabPolicy);
        autoPauseHiddenDelayInput.value = Number.isFinite(Number(settings.autoPauseHiddenDelayMs))
            ? String(Math.max(0, Math.round(Number(settings.autoPauseHiddenDelayMs))))
            : String(defaults.autoPauseHiddenDelayMs);
        autoPauseHiddenDelayInput.disabled = hiddenTabPolicySelect.value !== 'delay';
        volumeBoostToggle.checked = Boolean(settings.volumeBoostEnabled);
        enterToSendToggle.checked = Boolean(settings.enterToSendEnabled);
        globalPasteToggle.checked = Boolean(settings.globalPasteEnabled);
        regularPasteToggle.checked = Boolean(settings.regularPasteEnabled);
        regularAutoSendToggle.checked = Boolean(settings.regularAutoSend);
        regularAutoSendInInputToggle.checked = Boolean(settings.regularAutoSendInInput);
        nicePasteToggle.checked = Boolean(settings.niceAutoPasteEnabled);
        niceSendToggle.checked = Boolean(settings.niceAutoSend);
        copyButtonsToggle.checked = Boolean(settings.copyButtonEnabled);
        doubleClickEditToggle.checked = Boolean(settings.doubleClickEditEnabled);
        autoCloseWarningsToggle.checked = Boolean(settings.autoCloseLimitWarning);
    }

    function persistSetting(key, value) {
        chrome.storage.sync.get({ [SETTINGS_STORAGE_KEY]: {} }, (items) => {
            const settingsByProfile = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
                ? { ...items[SETTINGS_STORAGE_KEY] }
                : {};

            const profileSettings = {
                ...getProfileDefaults(activeProfile),
                ...(settingsByProfile[activeProfile] || {})
            };
            profileSettings[key] = value;
            settingsByProfile[activeProfile] = profileSettings;
            chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settingsByProfile });
        });

        sendMessage('applySettings', { settings: { [key]: value }, silent: true });
    }

    startBtn.addEventListener('click', () => {
        sendMessage('startReading');
        updateUI('playing');
    });

    readSelectionBtn.addEventListener('click', () => {
        sendMessage('readSelection');
        updateUI('playing');
    });

    readTopBtn.addEventListener('click', () => {
        sendMessage('readFromTop');
        updateUI('playing');
    });

    stopBtn.addEventListener('click', () => {
        sendMessage('stopReading');
        updateUI('stopped');
    });

    pauseBtn.addEventListener('click', () => {
        sendMessage('pauseResume');
        if (pauseBtn.innerHTML.includes('Pause')) {
            updateUI('paused');
        } else {
            updateUI('playing');
        }
    });

    prevBtn.addEventListener('click', () => {
        sendMessage('navigate', { direction: 'prev' });
    });

    nextBtn.addEventListener('click', () => {
        sendMessage('navigate', { direction: 'next' });
    });

    rateSlider.addEventListener('input', (e) => {
        const rate = Number(e.target.value);
        rateValue.textContent = `${rate.toFixed(1)}x`;
        persistSetting('speechRate', rate);
        sendMessage('setRate', { rate });
    });

    volumeSlider.addEventListener('input', (e) => {
        const level = Number(e.target.value);
        volumeValue.textContent = `${level.toFixed(1)}x`;
        persistSetting('volumeBoostLevel', level);
    });
    voiceSelect.addEventListener('change', (e) => {
        persistSetting('voiceUri', e.target.value || '');
    });

    highlightToggle.addEventListener('change', (e) => {
        persistSetting('wordHighlight', e.target.checked);
    });
    gapTrimToggle.addEventListener('change', (e) => {
        persistSetting('gapTrim', e.target.checked);
    });
    readUserMessagesToggle.addEventListener('change', (e) => {
        persistSetting('readUserMessages', e.target.checked);
    });
    readReferencesToggle.addEventListener('change', (e) => {
        persistSetting('readReferences', e.target.checked);
    });
    chatStyleToggle.addEventListener('change', (e) => {
        persistSetting('chatgptTextStyling', e.target.checked);
    });
    lowGapToggle.addEventListener('change', (e) => {
        persistSetting('lowGapMode', e.target.checked);
    });
    serverPrecacheToggle.addEventListener('change', (e) => {
        persistSetting('serverPrecacheMode', e.target.checked);
    });
    serverTextNormalizationToggle.addEventListener('change', (e) => {
        persistSetting('serverTextNormalizationEnabled', e.target.checked);
    });
    serverQuotePolicySelect.addEventListener('change', (e) => {
        persistSetting('serverQuotePolicy', normalizeQuotePolicy(e.target.value));
    });
    autoReadToggle.addEventListener('change', (e) => {
        persistSetting('autoRead', e.target.checked);
    });
    loopToggle.addEventListener('change', (e) => {
        persistSetting('loopOnEnd', e.target.checked);
    });
    autoScrollToggle.addEventListener('change', (e) => {
        persistSetting('autoScrollEnabled', e.target.checked);
    });
    idleArrowNavigationToggle.addEventListener('change', (e) => {
        persistSetting('idleArrowNavigation', e.target.checked);
    });
    promptHistoryNavToggle.addEventListener('change', (e) => {
        persistSetting('promptHistoryNavEnabled', e.target.checked);
    });
    pageOverlayToggle.addEventListener('change', (e) => {
        persistSetting('showPageOverlay', e.target.checked);
    });
    diagnosticsToggle.addEventListener('change', (e) => {
        persistSetting('showDiagnostics', e.target.checked);
    });
    hiddenTabPolicySelect.addEventListener('change', (e) => {
        autoPauseHiddenDelayInput.disabled = e.target.value !== 'delay';
        persistSetting('hiddenTabPolicy', e.target.value || 'delay');
    });
    autoPauseHiddenDelayInput.addEventListener('change', (e) => {
        const nextValue = Number(e.target.value);
        const clamped = Number.isFinite(nextValue) ? Math.max(0, Math.round(nextValue)) : 5000;
        e.target.value = String(clamped);
        persistSetting('autoPauseHiddenDelayMs', clamped);
    });
    volumeBoostToggle.addEventListener('change', (e) => {
        persistSetting('volumeBoostEnabled', e.target.checked);
    });
    enterToSendToggle.addEventListener('change', (e) => {
        persistSetting('enterToSendEnabled', e.target.checked);
    });
    globalPasteToggle.addEventListener('change', (e) => {
        persistSetting('globalPasteEnabled', e.target.checked);
    });
    regularPasteToggle.addEventListener('change', (e) => {
        persistSetting('regularPasteEnabled', e.target.checked);
    });
    regularAutoSendToggle.addEventListener('change', (e) => {
        persistSetting('regularAutoSend', e.target.checked);
    });
    regularAutoSendInInputToggle.addEventListener('change', (e) => {
        persistSetting('regularAutoSendInInput', e.target.checked);
    });
    nicePasteToggle.addEventListener('change', (e) => {
        persistSetting('niceAutoPasteEnabled', e.target.checked);
    });
    niceSendToggle.addEventListener('change', (e) => {
        persistSetting('niceAutoSend', e.target.checked);
    });
    copyButtonsToggle.addEventListener('change', (e) => {
        persistSetting('copyButtonEnabled', e.target.checked);
    });
    doubleClickEditToggle.addEventListener('change', (e) => {
        persistSetting('doubleClickEditEnabled', e.target.checked);
    });
    autoCloseWarningsToggle.addEventListener('change', (e) => {
        persistSetting('autoCloseLimitWarning', e.target.checked);
    });
    resetOverlayBtn.addEventListener('click', () => {
        persistSetting('overlayPosition', null);
        showStatus('Overlay position reset.');
        setTimeout(() => hideStatus(), 1200);
    });

    optionsBtn.addEventListener('click', () => {
        chrome.storage.local.set({ [OPTIONS_PROFILE_HINT_KEY]: activeProfile }, () => {
            chrome.runtime.openOptionsPage();
        });
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
            showStatus('Open a supported page to use this extension.');
            startBtn.disabled = true;
            return;
        }

        activeTabId = activeTab.id;
        activeProfile = getProfileFromUrl(activeTab.url || '');
        getStoredProfileSettings((settings) => {
            applySettingsToUI(settings);
        });
        requestVoiceList();
        requestLockState();

        const requestState = () => {
            chrome.tabs.sendMessage(activeTabId, { action: 'getState' }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('Open ChatGPT/local page to use this extension.');
                    startBtn.disabled = true;
                    requestLockState();
                    return;
                }
                if (response && response.state) {
                    updateUI(response.state);
                    updateProgress(response.progress);
                    if (response.profile) {
                        activeProfile = response.profile;
                    }
                    if (response.settings) {
                        applySettingsToUI(response.settings);
                    }
                    if (availableVoices.length === 0 || !voiceSelect.value) {
                        requestVoiceList();
                    }
                }
                requestLockState();
            });
        };

        requestState();
        setInterval(requestState, 1000);
    });
});
