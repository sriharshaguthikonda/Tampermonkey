document.addEventListener('DOMContentLoaded', () => {
    const SETTINGS_STORAGE_KEY = 'settingsByProfile';
    const PROFILE_CHATGPT = 'chatgpt';
    const PROFILE_LOCAL = 'local';

    const BASE_DEFAULT_SETTINGS = {
        speechRate: 5,
        wordHighlight: true,
        gapTrim: true,
        readUserMessages: false,
        readReferences: false,
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
        limitWarningDelay: 1500,
        queueLookahead: 3,
        navFocusHoldMs: 800,
        navKeyupReadDelayMs: 150,
        navThrottleMs: 20,
        navCtrlJumpSegments: 5,
        speedStep: 0.2,
        scrollThrottleMs: 250,
        scrollEdgePadding: 80,
        loopWaitMs: 1200,
        waitForMoreMs: 8000,
        autoReadCooldownMs: 1500,
        autoReadStableMs: 800,
        autoReadMinParagraphs: 3
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

    const elements = {
        settingsProfile: document.getElementById('settingsProfile'),
        speechRate: document.getElementById('speechRate'),
        speechRateValue: document.getElementById('speechRateValue'),
        wordHighlight: document.getElementById('wordHighlight'),
        gapTrim: document.getElementById('gapTrim'),
        volumeBoostEnabled: document.getElementById('volumeBoostEnabled'),
        volumeBoostLevel: document.getElementById('volumeBoostLevel'),
        volumeBoostLevelValue: document.getElementById('volumeBoostLevelValue'),
        readUserMessages: document.getElementById('readUserMessages'),
        readReferences: document.getElementById('readReferences'),
        autoRead: document.getElementById('autoRead'),
        loopOnEnd: document.getElementById('loopOnEnd'),
        autoScrollEnabled: document.getElementById('autoScrollEnabled'),
        showPageOverlay: document.getElementById('showPageOverlay'),
        showDiagnostics: document.getElementById('showDiagnostics'),
        enterToSendEnabled: document.getElementById('enterToSendEnabled'),
        globalPasteEnabled: document.getElementById('globalPasteEnabled'),
        regularPasteEnabled: document.getElementById('regularPasteEnabled'),
        regularAutoSend: document.getElementById('regularAutoSend'),
        regularAutoSendInInput: document.getElementById('regularAutoSendInInput'),
        niceAutoPasteEnabled: document.getElementById('niceAutoPasteEnabled'),
        niceAutoSend: document.getElementById('niceAutoSend'),
        copyButtonEnabled: document.getElementById('copyButtonEnabled'),
        doubleClickEditEnabled: document.getElementById('doubleClickEditEnabled'),
        autoCloseLimitWarning: document.getElementById('autoCloseLimitWarning'),
        limitWarningDelay: document.getElementById('limitWarningDelay'),
        queueLookahead: document.getElementById('queueLookahead'),
        navFocusHoldMs: document.getElementById('navFocusHoldMs'),
        navKeyupReadDelayMs: document.getElementById('navKeyupReadDelayMs'),
        navThrottleMs: document.getElementById('navThrottleMs'),
        navCtrlJumpSegments: document.getElementById('navCtrlJumpSegments'),
        speedStep: document.getElementById('speedStep'),
        scrollThrottleMs: document.getElementById('scrollThrottleMs'),
        scrollEdgePadding: document.getElementById('scrollEdgePadding'),
        waitForMoreMs: document.getElementById('waitForMoreMs'),
        loopWaitMs: document.getElementById('loopWaitMs'),
        autoReadCooldownMs: document.getElementById('autoReadCooldownMs'),
        autoReadStableMs: document.getElementById('autoReadStableMs'),
        autoReadMinParagraphs: document.getElementById('autoReadMinParagraphs'),
        saveBtn: document.getElementById('saveBtn'),
        resetBtn: document.getElementById('resetBtn'),
        resetOverlayPositionBtn: document.getElementById('resetOverlayPositionBtn')
    };

    const numberFields = [
        'speechRate',
        'volumeBoostLevel',
        'limitWarningDelay',
        'queueLookahead',
        'navFocusHoldMs',
        'navKeyupReadDelayMs',
        'navThrottleMs',
        'navCtrlJumpSegments',
        'speedStep',
        'scrollThrottleMs',
        'scrollEdgePadding',
        'waitForMoreMs',
        'loopWaitMs',
        'autoReadCooldownMs',
        'autoReadStableMs',
        'autoReadMinParagraphs'
    ];

    const toggleFields = [
        'wordHighlight',
        'gapTrim',
        'volumeBoostEnabled',
        'readUserMessages',
        'readReferences',
        'autoRead',
        'loopOnEnd',
        'autoScrollEnabled',
        'showPageOverlay',
        'showDiagnostics',
        'enterToSendEnabled',
        'globalPasteEnabled',
        'regularPasteEnabled',
        'regularAutoSend',
        'regularAutoSendInInput',
        'niceAutoPasteEnabled',
        'niceAutoSend',
        'copyButtonEnabled',
        'doubleClickEditEnabled',
        'autoCloseLimitWarning'
    ];

    let saveTimer = null;
    let saveFeedbackTimer = null;
    let currentProfile = PROFILE_CHATGPT;
    let currentOverlayPosition = null;

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

    function updateSpeechRateValue(rate) {
        const display = Number.isFinite(rate) ? rate.toFixed(1) : getProfileDefaults(currentProfile).speechRate.toFixed(1);
        elements.speechRateValue.textContent = `${display}x`;
    }

    function updateVolumeBoostValue(level) {
        const display = Number.isFinite(level) ? level.toFixed(1) : getProfileDefaults(currentProfile).volumeBoostLevel.toFixed(1);
        elements.volumeBoostLevelValue.textContent = `${display}x`;
    }

    function coerceNumber(el, fallback) {
        const raw = Number(el.value);
        if (!Number.isFinite(raw)) return fallback;
        const min = el.min !== '' ? Number(el.min) : null;
        const max = el.max !== '' ? Number(el.max) : null;
        let value = raw;
        if (Number.isFinite(min)) value = Math.max(value, min);
        if (Number.isFinite(max)) value = Math.min(value, max);
        return value;
    }

    function applySettingsToUI(settings) {
        const merged = { ...getProfileDefaults(currentProfile), ...settings };
        currentOverlayPosition = merged.overlayPosition ?? null;

        elements.speechRate.value = merged.speechRate;
        updateSpeechRateValue(Number(merged.speechRate));
        elements.volumeBoostLevel.value = merged.volumeBoostLevel;
        updateVolumeBoostValue(Number(merged.volumeBoostLevel));

        toggleFields.forEach((key) => {
            if (elements[key]) elements[key].checked = Boolean(merged[key]);
        });

        numberFields.forEach((key) => {
            if (key === 'speechRate' || key === 'volumeBoostLevel') return;
            if (elements[key]) elements[key].value = merged[key];
        });
    }

    function collectSettings() {
        const defaults = getProfileDefaults(currentProfile);
        const settings = {};

        settings.speechRate = coerceNumber(elements.speechRate, defaults.speechRate);

        toggleFields.forEach((key) => {
            settings[key] = Boolean(elements[key].checked);
        });

        numberFields.forEach((key) => {
            if (key === 'speechRate') return;
            settings[key] = coerceNumber(elements[key], defaults[key]);
        });
        settings.overlayPosition = currentOverlayPosition;

        return settings;
    }

    function flashSaved() {
        elements.saveBtn.textContent = 'Saved';
        if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
        saveFeedbackTimer = setTimeout(() => {
            elements.saveBtn.textContent = 'Save changes';
        }, 1200);
    }

    function loadProfile(profile) {
        chrome.storage.sync.get(null, (items) => {
            const settingsByProfile = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
                ? items[SETTINGS_STORAGE_KEY]
                : {};
            const legacy = pickLegacySettings(items || {});
            const profileSettings = {
                ...getProfileDefaults(profile),
                ...(profile === PROFILE_CHATGPT ? legacy : {}),
                ...(settingsByProfile[profile] || {})
            };
            applySettingsToUI(profileSettings);
        });
    }

    function saveSettings() {
        const nextSettings = collectSettings();
        chrome.storage.sync.get({ [SETTINGS_STORAGE_KEY]: {} }, (items) => {
            const settingsByProfile = (items[SETTINGS_STORAGE_KEY] && typeof items[SETTINGS_STORAGE_KEY] === 'object')
                ? { ...items[SETTINGS_STORAGE_KEY] }
                : {};
            settingsByProfile[currentProfile] = nextSettings;
            chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settingsByProfile }, () => {
                flashSaved();
            });
        });
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            saveSettings();
        }, 250);
    }

    elements.settingsProfile.addEventListener('change', () => {
        currentProfile = elements.settingsProfile.value === PROFILE_LOCAL ? PROFILE_LOCAL : PROFILE_CHATGPT;
        loadProfile(currentProfile);
    });

    elements.speechRate.addEventListener('input', () => {
        const rate = coerceNumber(elements.speechRate, getProfileDefaults(currentProfile).speechRate);
        updateSpeechRateValue(rate);
        scheduleSave();
    });

    elements.volumeBoostLevel.addEventListener('input', () => {
        const level = coerceNumber(elements.volumeBoostLevel, getProfileDefaults(currentProfile).volumeBoostLevel);
        updateVolumeBoostValue(level);
        scheduleSave();
    });

    toggleFields.forEach((key) => {
        elements[key].addEventListener('change', () => {
            scheduleSave();
        });
    });

    numberFields.forEach((key) => {
        if (key === 'speechRate' || key === 'volumeBoostLevel') return;
        elements[key].addEventListener('input', () => {
            scheduleSave();
        });
    });

    elements.saveBtn.addEventListener('click', () => {
        saveSettings();
    });

    elements.resetBtn.addEventListener('click', () => {
        applySettingsToUI(getProfileDefaults(currentProfile));
        saveSettings();
    });
    elements.resetOverlayPositionBtn.addEventListener('click', () => {
        currentOverlayPosition = null;
        saveSettings();
    });

    currentProfile = PROFILE_CHATGPT;
    elements.settingsProfile.value = currentProfile;
    loadProfile(currentProfile);
});
