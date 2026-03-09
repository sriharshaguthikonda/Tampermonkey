document.addEventListener('DOMContentLoaded', () => {
    const DEFAULT_SETTINGS = {
        speechRate: 5,
        wordHighlight: true,
        gapTrim: true,
        readUserMessages: false,
        autoRead: false,
        loopOnEnd: true,
        showDiagnostics: true,
        volumeBoostEnabled: true,
        volumeBoostLevel: 1.3,
        enterToSendEnabled: true,
        globalPasteEnabled: true,
        regularPasteEnabled: true,
        regularAutoSend: false,
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
        autoReadMinParagraphs: 3
    };

    const elements = {
        speechRate: document.getElementById('speechRate'),
        speechRateValue: document.getElementById('speechRateValue'),
        wordHighlight: document.getElementById('wordHighlight'),
        gapTrim: document.getElementById('gapTrim'),
        volumeBoostEnabled: document.getElementById('volumeBoostEnabled'),
        volumeBoostLevel: document.getElementById('volumeBoostLevel'),
        volumeBoostLevelValue: document.getElementById('volumeBoostLevelValue'),
        readUserMessages: document.getElementById('readUserMessages'),
        autoRead: document.getElementById('autoRead'),
        loopOnEnd: document.getElementById('loopOnEnd'),
        showDiagnostics: document.getElementById('showDiagnostics'),
        enterToSendEnabled: document.getElementById('enterToSendEnabled'),
        globalPasteEnabled: document.getElementById('globalPasteEnabled'),
        regularPasteEnabled: document.getElementById('regularPasteEnabled'),
        regularAutoSend: document.getElementById('regularAutoSend'),
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
        scrollThrottleMs: document.getElementById('scrollThrottleMs'),
        scrollEdgePadding: document.getElementById('scrollEdgePadding'),
        waitForMoreMs: document.getElementById('waitForMoreMs'),
        loopWaitMs: document.getElementById('loopWaitMs'),
        autoReadCooldownMs: document.getElementById('autoReadCooldownMs'),
        autoReadStableMs: document.getElementById('autoReadStableMs'),
        autoReadMinParagraphs: document.getElementById('autoReadMinParagraphs'),
        saveBtn: document.getElementById('saveBtn'),
        resetBtn: document.getElementById('resetBtn')
    };

    const numberFields = [
        'speechRate',
        'volumeBoostLevel',
        'limitWarningDelay',
        'queueLookahead',
        'navFocusHoldMs',
        'navKeyupReadDelayMs',
        'navThrottleMs',
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
        'autoRead',
        'loopOnEnd',
        'showDiagnostics',
        'enterToSendEnabled',
        'globalPasteEnabled',
        'regularPasteEnabled',
        'regularAutoSend',
        'niceAutoPasteEnabled',
        'niceAutoSend',
        'copyButtonEnabled',
        'doubleClickEditEnabled',
        'autoCloseLimitWarning'
    ];

    let saveTimer = null;
    let saveFeedbackTimer = null;

    function updateSpeechRateValue(rate) {
        const display = Number.isFinite(rate) ? rate.toFixed(1) : DEFAULT_SETTINGS.speechRate.toFixed(1);
        elements.speechRateValue.textContent = `${display}x`;
    }

    function updateVolumeBoostValue(level) {
        const display = Number.isFinite(level) ? level.toFixed(1) : DEFAULT_SETTINGS.volumeBoostLevel.toFixed(1);
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
        const merged = { ...DEFAULT_SETTINGS, ...settings };

        elements.speechRate.value = merged.speechRate;
        updateSpeechRateValue(Number(merged.speechRate));
        elements.volumeBoostLevel.value = merged.volumeBoostLevel;
        updateVolumeBoostValue(Number(merged.volumeBoostLevel));

        toggleFields.forEach((key) => {
            if (elements[key]) elements[key].checked = Boolean(merged[key]);
        });

        numberFields.forEach((key) => {
            if (key === 'speechRate') return;
            if (elements[key]) elements[key].value = merged[key];
        });
    }

    function collectSettings() {
        const settings = {};

        settings.speechRate = coerceNumber(elements.speechRate, DEFAULT_SETTINGS.speechRate);

        toggleFields.forEach((key) => {
            settings[key] = Boolean(elements[key].checked);
        });

        numberFields.forEach((key) => {
            if (key === 'speechRate') return;
            settings[key] = coerceNumber(elements[key], DEFAULT_SETTINGS[key]);
        });

        return settings;
    }

    function flashSaved() {
        elements.saveBtn.textContent = 'Saved';
        if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
        saveFeedbackTimer = setTimeout(() => {
            elements.saveBtn.textContent = 'Save changes';
        }, 1200);
    }

    function saveSettings() {
        const settings = collectSettings();
        chrome.storage.sync.set(settings, () => {
            flashSaved();
        });
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            saveSettings();
        }, 250);
    }

    elements.speechRate.addEventListener('input', () => {
        const rate = coerceNumber(elements.speechRate, DEFAULT_SETTINGS.speechRate);
        updateSpeechRateValue(rate);
        scheduleSave();
    });

    elements.volumeBoostLevel.addEventListener('input', () => {
        const level = coerceNumber(elements.volumeBoostLevel, DEFAULT_SETTINGS.volumeBoostLevel);
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
        applySettingsToUI(DEFAULT_SETTINGS);
        saveSettings();
    });

    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        applySettingsToUI(settings);
    });
});
