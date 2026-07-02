document.addEventListener('DOMContentLoaded', function() {
    const LOG_PREFIX = '[ChatGPT TTS Reader:popup]';

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

    log('info', 'Popup loaded');

    // UI Elements
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const rateSlider = document.getElementById('rateSlider');
    const rateValue = document.getElementById('rateValue');
    const statusDiv = document.getElementById('status');

    const missingElements = {
        startBtn: !startBtn,
        stopBtn: !stopBtn,
        pauseBtn: !pauseBtn,
        prevBtn: !prevBtn,
        nextBtn: !nextBtn,
        rateSlider: !rateSlider,
        rateValue: !rateValue,
        statusDiv: !statusDiv
    };

    if (Object.values(missingElements).some(Boolean)) {
        log('error', 'Popup DOM is missing expected elements', { missingElements });
        return;
    }

    // Load saved settings
    chrome.storage.sync.get(['speechRate'], function(result) {
        if (chrome.runtime.lastError) {
            log('error', 'Failed to load saved settings', {
                error: chrome.runtime.lastError.message
            });
            return;
        }

        log('info', 'Saved settings loaded', { result });

        if (result.speechRate) {
            rateSlider.value = result.speechRate;
            rateValue.textContent = `${result.speechRate}x`;
        }
    });

    // Send message to content script
    function sendMessage(action, data = {}, callback = null) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (chrome.runtime.lastError) {
                log('error', 'tabs.query failed', {
                    error: chrome.runtime.lastError.message,
                    action,
                    data
                });
                return;
            }

            const tab = tabs[0];
            if (!tab || !tab.id) {
                log('warn', 'No active tab available for message', { action, data });
                return;
            }

            log('info', 'Sending message to content script', {
                action,
                data,
                tabId: tab.id,
                tabUrl: tab.url
            });

            chrome.tabs.sendMessage(tab.id, { action, ...data }, function(response) {
                if (chrome.runtime.lastError) {
                    log('warn', 'Content script did not respond', {
                        action,
                        error: chrome.runtime.lastError.message,
                        tabUrl: tab.url
                    });
                    showStatus('Content script not ready. Reload ChatGPT, then reopen the extension.');
                    if (callback) callback(null);
                    return;
                }

                log('info', 'Content script response received', { action, response });
                if (callback) callback(response);
            });
        });
    }

    // Update UI based on state
    function updateUI(state) {
        log('debug', 'Updating popup UI', { state });

        switch(state) {
            case 'playing':
                startBtn.disabled = true;
                stopBtn.disabled = false;
                pauseBtn.disabled = false;
                pauseBtn.innerHTML = '<span class="material-icons">pause</span> Pause';
                showStatus('Reading...');
                break;
            case 'paused':
                pauseBtn.innerHTML = '<span class="material-icons">play_arrow</span> Resume';
                showStatus('Paused');
                break;
            case 'stopped':
            default:
                startBtn.disabled = false;
                stopBtn.disabled = true;
                pauseBtn.disabled = true;
                pauseBtn.innerHTML = '<span class="material-icons">pause</span> Pause';
                hideStatus();
                break;
        }
    }

    // Show status message
    function showStatus(message) {
        statusDiv.textContent = message;
        statusDiv.classList.add('active');
    }

    // Hide status message
    function hideStatus() {
        statusDiv.classList.remove('active');
    }

    // Event Listeners
    startBtn.addEventListener('click', () => {
        sendMessage('startReading', {}, response => {
            if (response?.state) updateUI(response.state);
            else updateUI('playing');
        });
    });

    stopBtn.addEventListener('click', () => {
        sendMessage('stopReading', {}, response => {
            if (response?.state) updateUI(response.state);
            else updateUI('stopped');
        });
    });

    pauseBtn.addEventListener('click', () => {
        sendMessage('pauseResume', {}, response => {
            if (response?.state) {
                updateUI(response.state);
                return;
            }

            if (pauseBtn.innerHTML.includes('Pause')) {
                updateUI('paused');
            } else {
                updateUI('playing');
            }
        });
    });

    prevBtn.addEventListener('click', () => {
        sendMessage('navigate', { direction: 'prev' });
    });

    nextBtn.addEventListener('click', () => {
        sendMessage('navigate', { direction: 'next' });
    });

    rateSlider.addEventListener('input', (e) => {
        const rate = parseFloat(e.target.value).toFixed(1);
        rateValue.textContent = `${rate}x`;

        chrome.storage.sync.set({ speechRate: rate }, () => {
            if (chrome.runtime.lastError) {
                log('error', 'Failed to save speech rate', {
                    error: chrome.runtime.lastError.message,
                    rate
                });
                return;
            }
            log('info', 'Speech rate saved', { rate });
        });

        sendMessage('setRate', { rate });
    });

    // Listen for state updates from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        log('info', 'Popup runtime message received', {
            type: message?.type,
            state: message?.state,
            senderId: sender?.id || ''
        });

        if (message.type === 'stateUpdate') {
            updateUI(message.state);
        }
        return false;
    });

    // Check current state when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (chrome.runtime.lastError) {
            log('error', 'Initial tabs.query failed', {
                error: chrome.runtime.lastError.message
            });
            return;
        }

        const tab = tabs[0];
        if (!tab || !tab.id) {
            log('warn', 'No active tab found when popup opened');
            return;
        }

        log('info', 'Checking current content-script state', {
            tabId: tab.id,
            tabUrl: tab.url
        });

        chrome.tabs.sendMessage(tab.id, { action: 'getState' }, function(response) {
            if (chrome.runtime.lastError) {
                log('warn', 'Initial getState failed', {
                    error: chrome.runtime.lastError.message,
                    tabUrl: tab.url
                });
                statusDiv.textContent = 'Navigate to a supported ChatGPT page, reload it, then reopen this extension.';
                statusDiv.classList.add('active');
                startBtn.disabled = true;
                return;
            }

            log('info', 'Initial state received', { response });

            if (response) {
                updateUI(response.state);
            }
        });
    });
});
