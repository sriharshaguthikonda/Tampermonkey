document.addEventListener('DOMContentLoaded', () => {
    const DEFAULT_SETTINGS = {
        speechRate: 3.5,
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
        autoReadMinParagraphs: 3
    };

    const elements = {
        speechRate: document.getElementById('speechRate'),
        speechRateValue: document.getElementById('speechRateValue'),
        wordHighlight: document.getElementById('wordHighlight'),
        gapTrim: document.getElementById('gapTrim'),
        autoRead: document.getElementById('autoRead'),
        loopOnEnd: document.getElementById('loopOnEnd'),
        showDiagnostics: document.getElementById('showDiagnostics'),
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
        'autoRead',
        'loopOnEnd',
        'showDiagnostics'
    ];

    let saveTimer = null;
    let saveFeedbackTimer = null;

    function updateSpeechRateValue(rate) {
        const display = Number.isFinite(rate) ? rate.toFixed(1) : DEFAULT_SETTINGS.speechRate.toFixed(1);
        elements.speechRateValue.textContent = `${display}x`;
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

    toggleFields.forEach((key) => {
        elements[key].addEventListener('change', () => {
            scheduleSave();
        });
    });

    numberFields.forEach((key) => {
        if (key === 'speechRate') return;
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
