document.addEventListener('DOMContentLoaded', () => {
    const DEFAULT_SETTINGS = {
        speechRate: 3.5,
        wordHighlight: true,
        gapTrim: true,
        autoRead: false,
        loopOnEnd: true,
        showDiagnostics: true
    };

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const rateSlider = document.getElementById('rateSlider');
    const rateValue = document.getElementById('rateValue');
    const statusDiv = document.getElementById('status');
    const optionsBtn = document.getElementById('optionsBtn');

    const highlightToggle = document.getElementById('highlightToggle');
    const gapTrimToggle = document.getElementById('gapTrimToggle');
    const autoReadToggle = document.getElementById('autoReadToggle');
    const loopToggle = document.getElementById('loopToggle');
    const diagnosticsToggle = document.getElementById('diagnosticsToggle');

    function sendMessage(action, data = {}) {
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

    function applySettingsToUI(settings) {
        const rate = Number(settings.speechRate ?? DEFAULT_SETTINGS.speechRate);
        rateSlider.value = rate;
        rateValue.textContent = `${rate.toFixed(1)}x`;
        highlightToggle.checked = Boolean(settings.wordHighlight);
        gapTrimToggle.checked = Boolean(settings.gapTrim);
        autoReadToggle.checked = Boolean(settings.autoRead);
        loopToggle.checked = Boolean(settings.loopOnEnd);
        diagnosticsToggle.checked = Boolean(settings.showDiagnostics);
    }

    function persistSetting(key, value) {
        chrome.storage.sync.set({ [key]: value });
        sendMessage('applySettings', { settings: { [key]: value }, silent: true });
    }

    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        applySettingsToUI(settings);
    });

    startBtn.addEventListener('click', () => {
        sendMessage('startReading');
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
        chrome.storage.sync.set({ speechRate: rate });
        sendMessage('setRate', { rate });
    });

    highlightToggle.addEventListener('change', (e) => {
        persistSetting('wordHighlight', e.target.checked);
    });
    gapTrimToggle.addEventListener('change', (e) => {
        persistSetting('gapTrim', e.target.checked);
    });
    autoReadToggle.addEventListener('change', (e) => {
        persistSetting('autoRead', e.target.checked);
    });
    loopToggle.addEventListener('change', (e) => {
        persistSetting('loopOnEnd', e.target.checked);
    });
    diagnosticsToggle.addEventListener('change', (e) => {
        persistSetting('showDiagnostics', e.target.checked);
    });

    optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getState' }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('Open ChatGPT to use this extension.');
                    startBtn.disabled = true;
                    return;
                }
                if (response && response.state) {
                    updateUI(response.state);
                    if (response.settings) {
                        applySettingsToUI({ ...DEFAULT_SETTINGS, ...response.settings });
                    }
                }
            });
        }
    });
});
