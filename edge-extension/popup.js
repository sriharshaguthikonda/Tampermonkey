document.addEventListener('DOMContentLoaded', function() {
    // UI Elements
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const rateSlider = document.getElementById('rateSlider');
    const rateValue = document.getElementById('rateValue');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.sync.get(['speechRate'], function(result) {
        if (result.speechRate) {
            rateSlider.value = result.speechRate;
            rateValue.textContent = `${result.speechRate}x`;
        }
    });

    // Send message to content script
    function sendMessage(action, data = {}) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {action, ...data});
            }
        });
    }

    // Update UI based on state
    function updateUI(state) {
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
        const rate = parseFloat(e.target.value).toFixed(1);
        rateValue.textContent = `${rate}x`;
        chrome.storage.sync.set({ speechRate: rate });
        sendMessage('setRate', { rate });
    });

    // Listen for state updates from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'stateUpdate') {
            updateUI(message.state);
        }
        return true;
    });

    // Check current state when popup opens
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'getState'}, function(response) {
                if (chrome.runtime.lastError) {
                    // Content script not ready or not on a supported page
                    statusDiv.textContent = 'Navigate to a supported page to use this extension';
                    statusDiv.classList.add('active');
                    startBtn.disabled = true;
                    return;
                }
                if (response) {
                    updateUI(response.state);
                }
            });
        }
    });
});
