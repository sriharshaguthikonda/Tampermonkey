document.addEventListener('DOMContentLoaded', () => {
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
        limitWarningDelay: 1500
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
    const statusDiv = document.getElementById('status');
    const progressDiv = document.getElementById('progress');
    const optionsBtn = document.getElementById('optionsBtn');
    const resetOverlayBtn = document.getElementById('resetOverlayBtn');

    const highlightToggle = document.getElementById('highlightToggle');
    const gapTrimToggle = document.getElementById('gapTrimToggle');
    const readUserMessagesToggle = document.getElementById('readUserMessagesToggle');
    const autoReadToggle = document.getElementById('autoReadToggle');
    const loopToggle = document.getElementById('loopToggle');
    const autoScrollToggle = document.getElementById('autoScrollToggle');
    const pageOverlayToggle = document.getElementById('pageOverlayToggle');
    const diagnosticsToggle = document.getElementById('diagnosticsToggle');
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

    function getProfileFromUrl(urlLike) {
        try {
            const url = new URL(urlLike || '');
            if (url.protocol === 'file:') return PROFILE_LOCAL;
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

    function applySettingsToUI(settings) {
        const defaults = getProfileDefaults(activeProfile);
        const rate = Number(settings.speechRate ?? defaults.speechRate);
        rateSlider.value = rate;
        rateValue.textContent = `${rate.toFixed(1)}x`;
        const volume = Number(settings.volumeBoostLevel ?? defaults.volumeBoostLevel);
        volumeSlider.value = volume;
        volumeValue.textContent = `${volume.toFixed(1)}x`;
        highlightToggle.checked = Boolean(settings.wordHighlight);
        gapTrimToggle.checked = Boolean(settings.gapTrim);
        readUserMessagesToggle.checked = Boolean(settings.readUserMessages);
        autoReadToggle.checked = Boolean(settings.autoRead);
        loopToggle.checked = Boolean(settings.loopOnEnd);
        autoScrollToggle.checked = Boolean(settings.autoScrollEnabled);
        pageOverlayToggle.checked = Boolean(settings.showPageOverlay);
        diagnosticsToggle.checked = Boolean(settings.showDiagnostics);
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

    highlightToggle.addEventListener('change', (e) => {
        persistSetting('wordHighlight', e.target.checked);
    });
    gapTrimToggle.addEventListener('change', (e) => {
        persistSetting('gapTrim', e.target.checked);
    });
    readUserMessagesToggle.addEventListener('change', (e) => {
        persistSetting('readUserMessages', e.target.checked);
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
    pageOverlayToggle.addEventListener('change', (e) => {
        persistSetting('showPageOverlay', e.target.checked);
    });
    diagnosticsToggle.addEventListener('change', (e) => {
        persistSetting('showDiagnostics', e.target.checked);
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
        chrome.runtime.openOptionsPage();
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

        const requestState = () => {
            chrome.tabs.sendMessage(activeTabId, { action: 'getState' }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('Open ChatGPT/local page to use this extension.');
                    startBtn.disabled = true;
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
                }
            });
        };

        requestState();
        setInterval(requestState, 1000);
    });
});
