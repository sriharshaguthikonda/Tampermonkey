// ==UserScript==
// @name         *** ChatGPT dev
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Volume boost + Enter-to-Send + Copy button functionality fix + Global Paste-to-Input (via paste event)
// @author       YourName
// @match        https://chatgpt.com/c/*
// @match        https://chatgpt.com/g/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ================= Settings Configuration =================
    let settings = {
        volumeBoostEnabled: true,
        volumeBoostLevel: 1.3,
        enterToSendEnabled: true,
        copyButtonEnabled: true,

        globalPasteEnabled: true,
        regularPasteEnabled: true,
        regularAutoSend: false,
        regularAutoSendInInput: false,
        doubleClickEditEnabled: true,
        autoCloseLimitWarning: true,
        limitWarningDelay: 1500,
        niceAutoPasteEnabled: true,
        niceAutoSend: false
    };

    // Load settings from localStorage
    function loadSettings() {
        const saved = localStorage.getItem('chatgpt-dev-settings');
        if (saved) {
            settings = { ...settings, ...JSON.parse(saved) };
        }
    }

    // Save settings to localStorage
    function saveSettings() {
        localStorage.setItem('chatgpt-dev-settings', JSON.stringify(settings));
    }

    loadSettings();


    // Replace the createSettingsUI function with this updated version:
// Replace the createSettingsUI function with this updated version:

function createSettingsUI() {
    const existingPanel = document.getElementById('chatgpt-dev-settings');
    if (existingPanel) {
        existingPanel.remove();
    }

    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'chatgpt-dev-settings';
    settingsPanel.innerHTML = `
        <div class="settings-header" id="settings-drag-handle">
            <h3>ChatGPT Dev Settings</h3>
            <button id="toggle-settings">⚙️</button>
        </div>
        <div class="settings-content" style="display: none;">
            <div class="setting-group">
                <h4>Volume Boost</h4>
                <label>
                    <input type="checkbox" id="volumeBoostEnabled" ${settings.volumeBoostEnabled ? 'checked' : ''}>
                    Enable Volume Boost
                </label>
                <label>
                    Volume Level: <input type="range" id="volumeBoostLevel" min="1.0" max="2.0" step="0.1" value="${settings.volumeBoostLevel}">
                    <span id="volumeValue">${settings.volumeBoostLevel}x</span>
                </label>
            </div>

            <div class="setting-group">
                <h4>Input Controls</h4>
                <label>
                    <input type="checkbox" id="enterToSendEnabled" ${settings.enterToSendEnabled ? 'checked' : ''}>
                    Enable Enter-to-Send (double press)
                </label>
                <label>
                    <input type="checkbox" id="globalPasteEnabled" ${settings.globalPasteEnabled ? 'checked' : ''}>
                    Enable Global Paste-to-Input
                </label>
                <label>
                    <input type="checkbox" id="regularPasteEnabled" ${settings.regularPasteEnabled ? 'checked' : ''}>
                    Enable Regular Paste
                </label>
                <label>
                    <input type="checkbox" id="regularAutoSend" ${settings.regularAutoSend ? 'checked' : ''}>
                    Auto-Send Regular Paste
                </label>
                <label>
                    <input type="checkbox" id="regularAutoSendInInput" ${settings.regularAutoSendInInput ? 'checked' : ''}>
                    Auto-Send if Pasting in Textbox
                </label>
                <label>
                    <input type="checkbox" id="doubleClickEditEnabled" ${settings.doubleClickEditEnabled ? 'checked' : ''}>
                    Enable Double-Click to Edit Messages
                </label>
            </div>

            <div class="setting-group">
                <h4>NICE Guidelines Auto-Paste</h4>
                <label>
                    <input type="checkbox" id="niceAutoPasteEnabled" ${settings.niceAutoPasteEnabled ? 'checked' : ''}>
                    Enable NICE Guidelines Auto-Paste
                </label>
                <label>
                    <input type="checkbox" id="niceAutoSend" ${settings.niceAutoSend ? 'checked' : ''}>
                    Auto-Send NICE Queries
                </label>
            </div>

            <div class="setting-group">
                <h4>UI Enhancements</h4>
                <label>
                    <input type="checkbox" id="copyButtonEnabled" ${settings.copyButtonEnabled ? 'checked' : ''}>
                    Enable Copy Buttons on Messages
                </label>
                <label>
                    <input type="checkbox" id="autoCloseLimitWarning" ${settings.autoCloseLimitWarning ? 'checked' : ''}>
                    Auto-close Limit Warnings
                </label>
                <label>
                    Warning Delay: <input type="range" id="limitWarningDelay" min="500" max="5000" step="100" value="${settings.limitWarningDelay}">
                    <span id="delayValue">${settings.limitWarningDelay}ms</span>
                </label>
            </div>

            <div class="setting-actions">
                <button id="resetSettings">Reset to Defaults</button>
                <button id="exportSettings">Export Settings</button>
                <input type="file" id="importSettings" accept=".json" style="display: none;">
                <button id="importSettingsBtn">Import Settings</button>
            </div>
        </div>
    `;

    const styles = `
        <style>
        #chatgpt-dev-settings {
            position: fixed !important;
            width: 320px !important;
            background: #1a1a1a !important;
            border: 1px solid #333 !important;
            border-radius: 8px !important;
            z-index: 999999 !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            color: #fff !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            user-select: none !important;
        }

        #chatgpt-dev-settings.dragging {
            transition: none !important;
            pointer-events: auto !important;
        }

        #chatgpt-dev-settings.dragging .settings-content {
            pointer-events: none !important;
        }

        .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #2a2a2a;
            border-radius: 8px 8px 0 0;
            border-bottom: 1px solid #333;
            cursor: move;
            position: relative;
        }

        .settings-header:hover {
            background: #333;
        }

        .settings-header::before {
            content: "⋮⋮";
            position: absolute;
            left: 8px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            color: #666;
            line-height: 1;
            letter-spacing: -2px;
        }

        .settings-header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            margin-left: 16px;
        }

        #toggle-settings {
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
            border-radius: 4px;
            transition: background 0.2s;
        }

        #toggle-settings:hover {
            background: #333;
        }

        .settings-content {
            padding: 16px;
            max-height: 400px;
            overflow-y: auto;
        }

        .setting-group {
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid #333;
        }

        .setting-group:last-of-type {
            border-bottom: none;
        }

        .setting-group h4 {
            margin: 0 0 8px 0;
            font-size: 12px;
            font-weight: 600;
            color: #aaa;
            text-transform: uppercase;
        }

        .setting-group label {
            display: block;
            margin-bottom: 6px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .setting-group input[type="checkbox"],
        .setting-group input[type="radio"] {
            margin: 0;
        }

        .setting-group input[type="range"] {
            flex: 1;
            margin: 0 8px;
        }

        .setting-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid #333;
        }

        .setting-actions button {
            padding: 6px 12px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        }

        .setting-actions button:hover {
            background: #0056b3;
        }

        #resetSettings {
            background: #dc3545 !important;
        }

        #resetSettings:hover {
            background: #c82333 !important;
        }

        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
    document.body.appendChild(settingsPanel);

    settingsPanel.style.cssText += `
        position: fixed !important;
        bottom: 140px !important;
        left: 20px !important;
        z-index: 999999 !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;

    // Add drag functionality
    makeDraggable(settingsPanel);

    setupSettingsEventListeners();

    setInterval(() => {
        const panel = document.getElementById('chatgpt-dev-settings');
        if (!panel || !document.body.contains(panel)) {
            createSettingsUI();
        } else {
            panel.style.cssText += `
                position: fixed !important;
                z-index: 999999 !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            `;
        }
    }, 2000);
}

// Add this new function for drag functionality:
function makeDraggable(element) {
    let isDragging = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    const dragThreshold = 5; // Minimum pixels to move before starting drag

    const dragHandle = element.querySelector('#settings-drag-handle');

    dragHandle.addEventListener('mousedown', (e) => {
        // Don't start dragging if clicking on the toggle button
        if (e.target.id === 'toggle-settings') {
            return;
        }

        isDragging = true;
        dragStarted = false;

        startX = e.clientX;
        startY = e.clientY;

        const rect = element.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        e.preventDefault();
        e.stopPropagation();
    });

    function handleMouseMove(e) {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Check if we've moved far enough to start dragging
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (!dragStarted && distance > dragThreshold) {
            dragStarted = true;
            element.classList.add('dragging');

            // Prevent the settings panel from toggling during drag
            const settingsContent = element.querySelector('.settings-content');
            if (settingsContent) {
                settingsContent.style.pointerEvents = 'none';
            }
        }

        if (!dragStarted) return;

        let newX = initialX + deltaX;
        let newY = initialY + deltaY;

        // Keep the element within viewport bounds
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const elementWidth = element.offsetWidth;
        const elementHeight = element.offsetHeight;

        newX = Math.max(0, Math.min(newX, viewportWidth - elementWidth));
        newY = Math.max(0, Math.min(newY, viewportHeight - elementHeight));

        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
        element.style.bottom = 'auto';
        element.style.right = 'auto';

        e.preventDefault();
        e.stopPropagation();
    }

    function handleMouseUp(e) {
        if (!isDragging) return;

        isDragging = false;

        if (dragStarted) {
            dragStarted = false;
            element.classList.remove('dragging');

            // Re-enable pointer events after drag
            const settingsContent = element.querySelector('.settings-content');
            if (settingsContent) {
                settingsContent.style.pointerEvents = 'auto';
            }
        }

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    // Touch events for mobile support
    dragHandle.addEventListener('touchstart', (e) => {
        if (e.target.id === 'toggle-settings') {
            return;
        }

        isDragging = true;
        dragStarted = false;

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;

        const rect = element.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);

        e.preventDefault();
        e.stopPropagation();
    });

    function handleTouchMove(e) {
        if (!isDragging) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        // Check if we've moved far enough to start dragging
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (!dragStarted && distance > dragThreshold) {
            dragStarted = true;
            element.classList.add('dragging');

            // Prevent the settings panel from toggling during drag
            const settingsContent = element.querySelector('.settings-content');
            if (settingsContent) {
                settingsContent.style.pointerEvents = 'none';
            }
        }

        if (!dragStarted) return;

        let newX = initialX + deltaX;
        let newY = initialY + deltaY;

        // Keep the element within viewport bounds
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const elementWidth = element.offsetWidth;
        const elementHeight = element.offsetHeight;

        newX = Math.max(0, Math.min(newX, viewportWidth - elementWidth));
        newY = Math.max(0, Math.min(newY, viewportHeight - elementHeight));

        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
        element.style.bottom = 'auto';
        element.style.right = 'auto';

        e.preventDefault();
        e.stopPropagation();
    }

    function handleTouchEnd() {
        if (!isDragging) return;

        isDragging = false;

        if (dragStarted) {
            dragStarted = false;
            element.classList.remove('dragging');

            // Re-enable pointer events after drag
            const settingsContent = element.querySelector('.settings-content');
            if (settingsContent) {
                settingsContent.style.pointerEvents = 'auto';
            }
        }

        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
    }
}

    function setupSettingsEventListeners() {
        const panel = document.getElementById('chatgpt-dev-settings');

        document.getElementById('toggle-settings').addEventListener('click', () => {
            const content = panel.querySelector('.settings-content');
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('volumeBoostEnabled').addEventListener('change', (e) => {
            settings.volumeBoostEnabled = e.target.checked;
            saveSettings();
        });

        document.getElementById('volumeBoostLevel').addEventListener('input', (e) => {
            settings.volumeBoostLevel = parseFloat(e.target.value);
            document.getElementById('volumeValue').textContent = `${settings.volumeBoostLevel}x`;
            saveSettings();
        });

        document.getElementById('enterToSendEnabled').addEventListener('change', (e) => {
            settings.enterToSendEnabled = e.target.checked;
            saveSettings();
        });

        document.getElementById('globalPasteEnabled').addEventListener('change', (e) => {
            settings.globalPasteEnabled = e.target.checked;
            saveSettings();
        });

        document.getElementById('regularPasteEnabled').addEventListener('change', (e) => {
            settings.regularPasteEnabled = e.target.checked;
            saveSettings();
        });

        document.getElementById('regularAutoSend').addEventListener('change', (e) => {
            settings.regularAutoSend = e.target.checked;
            saveSettings();
        });

        document.getElementById('regularAutoSendInInput').addEventListener('change', (e) => {
            settings.regularAutoSendInInput = e.target.checked;
            saveSettings();
        });

        document.getElementById('doubleClickEditEnabled').addEventListener('change', (e) => {
            settings.doubleClickEditEnabled = e.target.checked;
            saveSettings();
        });

        document.getElementById('niceAutoPasteEnabled').addEventListener('change', (e) => {
            settings.niceAutoPasteEnabled = e.target.checked;
            saveSettings();
        });

        document.getElementById('niceAutoSend').addEventListener('change', (e) => {
            settings.niceAutoSend = e.target.checked;
            saveSettings();
        });

        document.getElementById('copyButtonEnabled').addEventListener('change', (e) => {
            settings.copyButtonEnabled = e.target.checked;
            saveSettings();
        });

        document.getElementById('autoCloseLimitWarning').addEventListener('change', (e) => {
            settings.autoCloseLimitWarning = e.target.checked;
            saveSettings();
        });

        document.getElementById('limitWarningDelay').addEventListener('input', (e) => {
            settings.limitWarningDelay = parseInt(e.target.value);
            document.getElementById('delayValue').textContent = `${settings.limitWarningDelay}ms`;
            saveSettings();
        });

        document.getElementById('resetSettings').addEventListener('click', () => {
            if (confirm('Reset all settings to defaults?')) {
                localStorage.removeItem('chatgpt-dev-settings');
                location.reload();
            }
        });

        document.getElementById('exportSettings').addEventListener('click', () => {
            const dataStr = JSON.stringify(settings, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            const exportFileDefaultName = 'chatgpt-dev-settings.json';

            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        });

        document.getElementById('importSettingsBtn').addEventListener('click', () => {
            document.getElementById('importSettings').click();
        });

        document.getElementById('importSettings').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importedSettings = JSON.parse(e.target.result);
                        settings = { ...settings, ...importedSettings };
                        saveSettings();
                        location.reload();
                    } catch (error) {
                        alert('Invalid settings file!');
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    // ================= NICE Auto-Paste Functionality =================
    const SEND_BUTTON_SELECTOR = 'button[aria-label="Send prompt"], button.btn.relative.btn-primary';

    const findPromptArea = () => {
        return document.querySelector('div[contenteditable="true"][id="prompt-textarea"]') ||
               document.querySelector('div[contenteditable][data-message-author-role="user"]');
    };

    function applyTextToPromptArea(promptArea, text) {
        if (!promptArea) return false;

        const normalizedText = String(text || '').replace(/\r\n/g, '\n');
        promptArea.focus();

        if (promptArea.tagName === 'TEXTAREA' || promptArea.tagName === 'INPUT') {
            promptArea.value = normalizedText;
            promptArea.dispatchEvent(new Event('input', { bubbles: true }));
            promptArea.selectionStart = promptArea.value.length;
            promptArea.selectionEnd = promptArea.value.length;
            return true;
        }

        const selection = window.getSelection();
        let insertedWithCommand = false;
        if (selection) {
            const selectAllRange = document.createRange();
            selectAllRange.selectNodeContents(promptArea);
            selection.removeAllRanges();
            selection.addRange(selectAllRange);
        }

        try {
            if (typeof document.execCommand === 'function') {
                insertedWithCommand = document.execCommand('insertText', false, normalizedText);
            }
        } catch (_error) {
            insertedWithCommand = false;
        }

        if (!insertedWithCommand) {
            promptArea.textContent = normalizedText;
        }

        promptArea.dispatchEvent(new Event('input', { bubbles: true }));
        if (selection) {
            const endRange = document.createRange();
            endRange.selectNodeContents(promptArea);
            endRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(endRange);
        }
        return true;
    }

    const setQueryAndSend = (query, autoSend = false) => {
        const promptArea = findPromptArea();
        if (promptArea) {
            applyTextToPromptArea(promptArea, query);

            if (autoSend) {
                const observer = new MutationObserver((mutations, obs) => {
                    const sendButton = document.querySelector(SEND_BUTTON_SELECTOR);
                    if (sendButton && !sendButton.disabled) {
                        sendButton.click();
                        obs.disconnect();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['disabled']
                });

                setTimeout(() => observer.disconnect(), 5000);
            }

            return true;
        }
        return false;
    };

    function showConfirmation(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10a37f;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2000);
    }

    // ================= Regular Paste Functionality =================
function pasteIntoInputArea(text) {
    if (!settings.globalPasteEnabled || !settings.regularPasteEnabled) return;

    const promptArea = findPromptArea();
    if (promptArea) {
        applyTextToPromptArea(promptArea, text);

        if (settings.regularAutoSend) {
            const observer = new MutationObserver((mutations, obs) => {
                const sendButton = document.querySelector(SEND_BUTTON_SELECTOR);
                if (sendButton && !sendButton.disabled) {
                    sendButton.click();
                    obs.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['disabled']
            });

            setTimeout(() => observer.disconnect(), 5000);
        }

        console.log('Regular paste successful:', text.substring(0, 50) + '...');
        showConfirmation(settings.regularAutoSend ? 'Text pasted and sent!' : 'Text pasted to input area!');
    }
}

function sendAfterTextboxPasteIfEnabled() {
    if (!settings.regularPasteEnabled || !settings.regularAutoSendInInput) return;

    const clickSend = () => {
        const sendButton = document.querySelector(SEND_BUTTON_SELECTOR);
        if (sendButton && !sendButton.disabled) {
            sendButton.click();
            return true;
        }
        return false;
    };

    setTimeout(() => {
        if (clickSend()) return;
        const observer = new MutationObserver((mutations, obs) => {
            if (clickSend()) {
                obs.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled']
        });
        setTimeout(() => observer.disconnect(), 5000);
    }, 40);
}

    // ================= Helper Function to Check for Open Elements =================
    function checkForOpenElements() {
        // Check for edit mode - look for the specific edit container with Cancel/Send buttons
        const editContainers = document.querySelectorAll('.bg-token-main-surface-tertiary');
        const activeEditContainers = Array.from(editContainers).filter(container => {
            const hasTextarea = container.querySelector('textarea');
            const buttonContainer = container.querySelector('.flex.justify-end.gap-2');
            const hasCancelButton = buttonContainer && buttonContainer.textContent.includes('Cancel');
            const hasSendButton = buttonContainer && buttonContainer.textContent.includes('Send');
            return hasTextarea && hasCancelButton && hasSendButton;
        });

        // Alternative check: look for any textarea that's not the main prompt area
        const textareas = document.querySelectorAll('textarea');
        const editTextareas = Array.from(textareas).filter(textarea => {
            const promptArea = findPromptArea();
            if (textarea === promptArea) return false;

            // Check if this textarea is in an edit container
            const editContainer = textarea.closest('.bg-token-main-surface-tertiary');
            return editContainer && textarea.offsetParent !== null;
        });

        // Check for modal dialogs
        const modals = document.querySelectorAll('[role="dialog"]');
        const openModals = Array.from(modals).filter(modal => {
            const style = window.getComputedStyle(modal);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });

        // Check for popover elements
        const popovers = document.querySelectorAll('.popover, [data-state="open"]');
        const openPopovers = Array.from(popovers).filter(popover => {
            const style = window.getComputedStyle(popover);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });

        // Check for dropdown menus
        const dropdowns = document.querySelectorAll('[role="menu"], [role="listbox"], .dropdown-menu');
        const openDropdowns = Array.from(dropdowns).filter(dropdown => {
            const style = window.getComputedStyle(dropdown);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });

        // Check for any element with common modal/overlay classes
        const overlays = document.querySelectorAll(
            '.overlay, .modal, .popup, .dialog, .tooltip, .context-menu, ' +
            '[data-modal="true"], [data-popup="true"], [aria-hidden="false"][role="dialog"]'
        );
        const openOverlays = Array.from(overlays).filter(overlay => {
            const style = window.getComputedStyle(overlay);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });

        // Check for focused elements that should prevent auto-paste
        const focusedElements = document.querySelectorAll('textarea:focus, [contenteditable="true"]:focus, input:focus');
        const activeFocusedElements = Array.from(focusedElements).filter(element => {
            const promptArea = findPromptArea();
            return element !== promptArea;
        });

        const hasOpenElements = activeEditContainers.length > 0 ||
              editTextareas.length > 0 ||
              openModals.length > 0 ||
              openPopovers.length > 0 ||
              openDropdowns.length > 0 ||
              openOverlays.length > 0 ||
              activeFocusedElements.length > 0;

        if (hasOpenElements) {
            console.log('Open elements detected:', {
                editContainers: activeEditContainers.length,
                editTextareas: editTextareas.length,
                modals: openModals.length,
                popovers: openPopovers.length,
                dropdowns: openDropdowns.length,
                overlays: openOverlays.length,
                focusedElements: activeFocusedElements.length
            });
        }

        return hasOpenElements;
    }


    // Find this section in your UserScript (around line 340-380):


// ================= Updated Paste Event Handler =================
document.addEventListener('paste', function(event) {
    if (!settings.globalPasteEnabled) return;

    // Check if any modal, popup, or other UI elements are open
    if (checkForOpenElements()) {
        console.log('Auto-paste blocked: UI elements are open');
        return; // Don't prevent default, let normal paste behavior work
    }

    const activeElement = document.activeElement;
    const promptArea = findPromptArea();

    // If we're already in the prompt area, let normal paste work
    if (promptArea && (activeElement === promptArea || promptArea.contains(activeElement))) {
        sendAfterTextboxPasteIfEnabled();
        return;
    }

    // Additional check: if focus is in any input/textarea/contenteditable, skip auto-paste
    if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
    )) {
        console.log('Auto-paste blocked: Focus is in an input field');
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pastedText = (event.clipboardData || window.clipboardData).getData('text');

    if (pastedText.trim()) {
        if (settings.niceAutoPasteEnabled) {
            const formattedQuery = `According to NICE guidelines, what is the answer for the following:\n\n${pastedText}`;

            console.log('Auto-pasting to ChatGPT with NICE formatting:', pastedText.substring(0, 50) + '...');

            const success = setQueryAndSend(formattedQuery, settings.niceAutoSend);

            if (success) {
                showConfirmation('NICE query pasted to ChatGPT!');
            }
        } else if (settings.regularPasteEnabled) {
            pasteIntoInputArea(pastedText);
        }
    }
}, true);

    // ================= 120% Volume Boost =================
    const audioContexts = new WeakMap();

    function boostVolume(element) {
        if (!settings.volumeBoostEnabled) return;

        if (!audioContexts.has(element)) {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const source = ctx.createMediaElementSource(element);
                const gainNode = ctx.createGain();

                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                gainNode.gain.value = settings.volumeBoostLevel;

                audioContexts.set(element, { ctx, gainNode });
                element.volume = 1.0;
            } catch (e) {
                console.error('AudioContext error:', e);
            }
        }
    }

    function handleMediaElements() {
        if (!settings.volumeBoostEnabled) return;

        document.querySelectorAll('video, audio').forEach(media => {
            if (!media.dataset.volumeBoosted) {
                media.dataset.volumeBoosted = 'true';
                media.addEventListener('play', () => boostVolume(media));
            }
        });
    }

    handleMediaElements();
    const mediaObserver = new MutationObserver(handleMediaElements);
    mediaObserver.observe(document.body, { childList: true, subtree: true });

    // ================= Enter-to-Send =================
    const sendButtonSelector = 'button[aria-label="Send prompt"], button.btn.relative.btn-primary:not([aria-label="Dictate button"])';
    let lastEnterPressTime = 0;
    const doublePressThreshold = 300;

    function clickSendButton() {
        if (!settings.enterToSendEnabled) return;

        const sendButton = document.querySelector(sendButtonSelector);
        if (sendButton) sendButton.click();
    }

    // ================= Copy Button Functionality =================
    function addCopyButton(target) {
        if (!settings.copyButtonEnabled) return;

        const existingSecondButton = target.querySelector('.second-button');
        if (existingSecondButton) {
            existingSecondButton.remove();
        }

        if (target.querySelector('.copy-button-row')) return;
        target.querySelectorAll('.copy-button').forEach(btn => btn.remove());

        const copyButtonRow = document.createElement('div');
        copyButtonRow.classList.add('copy-button-row');
        copyButtonRow.style.display = 'flex';
        copyButtonRow.style.justifyContent = 'flex-end';
        copyButtonRow.style.marginTop = '8px';

        const copyButton = document.createElement('button');
        copyButton.innerText = 'Copy';
        copyButton.classList.add('copy-button');

        copyButton.style.padding = '5px 10px';
        copyButton.style.fontSize = '0.9rem';
        copyButton.style.cursor = 'pointer';
        copyButton.style.border = 'none';
        copyButton.style.borderRadius = '4px';
        copyButton.style.backgroundColor = '#007bff';
        copyButton.style.color = '#fff';

        copyButton.addEventListener('click', function() {
            const clone = target.cloneNode(true);
            clone.querySelectorAll('.copy-button, .copy-button-row').forEach(btn => btn.remove());
            const text = clone.innerText;

            navigator.clipboard.writeText(text)
                .then(() => {
                    console.log('Message text copied to clipboard.');
                })
                .catch(err => {
                    console.error('Error copying text: ', err);
                });
        });

        copyButtonRow.appendChild(copyButton);
        target.appendChild(copyButtonRow);
    }

    function processExistingMessages() {
        if (!settings.copyButtonEnabled) return;

        const targets = document.querySelectorAll('.whitespace-pre-wrap');
        targets.forEach(addCopyButton);
    }

    processExistingMessages();

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.matches('.whitespace-pre-wrap')) {
                        addCopyButton(node);
                    }
                    node.querySelectorAll('.whitespace-pre-wrap').forEach(addCopyButton);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // ================= Double-Click Edit Handler =================
    function handleDoubleClickEdit(event) {
        if (!settings.doubleClickEditEnabled) return;

        const messageContainer = event.target.closest('.group\\/conversation-turn');
        if (!messageContainer) return;

        const editButton = messageContainer.querySelector('button[aria-label="Edit message"]');
        if (editButton) {
            editButton.click();
            setTimeout(() => {
                const editor = document.querySelector('[contenteditable="true"]');
                if (editor) editor.focus();
            }, 50);
        }
    }

    function addEditListeners() {
        if (!settings.doubleClickEditEnabled) return;

        const containers = document.querySelectorAll(`
            .group\\/conversation-turn,
            .group\\/turn-messages,
            [data-message-author-role]
        `);

        containers.forEach(container => {
            if (!container.dataset.editListenerAdded) {
                container.addEventListener('dblclick', handleDoubleClickEdit);
                container.dataset.editListenerAdded = 'true';
                container.style.cursor = 'pointer';
                container.style.transition = 'background-color 0.2s';
                container.addEventListener('mouseover', () => {
                    container.style.backgroundColor = 'rgba(0, 53, 115, 0.1)';
                });
                container.addEventListener('mouseout', () => {
                    container.style.backgroundColor = '';
                });
            }
        });
    }

    const editObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                addEditListeners();
            }
        });
    });

    editObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    addEditListeners();

    document.addEventListener('click', (event) => {
        if (event.target.closest('button[aria-label="Edit message"]')) {
            const messageContent = event.target.closest('.group\\/conversation-turn')
                .querySelector('.whitespace-pre-wrap');

            if (messageContent) {
                setTimeout(() => {
                    const editor = document.querySelector('[contenteditable="true"]');
                    if (editor) {
                        editor.style.minHeight = '100px';
                        editor.style.padding = '10px';
                        editor.style.border = '2px solid #007bff';
                        editor.style.borderRadius = '8px';
                    }
                }, 100);
            }
        }
    });

    // ================= Auto-Close Limit Warning =================
    function setupLimitWarningCloser() {
        if (!settings.autoCloseLimitWarning) return;

        const notificationSelector = 'div.flex.w-full.items-start.gap-4.rounded-3xl.border.py-4.pl-5.pr-3.text-sm [text-wrap\\:pretty]';
        const closeButtonSelector = 'button[data-testid="close-button"]';

        function closeNotificationIfFound() {
            const notification = document.querySelector(notificationSelector);
            if (notification) {
                const closeButton = notification.querySelector(closeButtonSelector);
                if (closeButton) {
                    setTimeout(() => {
                        closeButton.click();
                        console.log('Closed plan limit notification');
                    }, settings.limitWarningDelay);
                }
            }
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    closeNotificationIfFound();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        closeNotificationIfFound();
    }

    setupLimitWarningCloser();

    // ================= Key Event Handlers =================
    document.addEventListener('keydown', function(event) {
        if (settings.enterToSendEnabled && event.key === 'Enter' && !event.shiftKey &&
            !event.ctrlKey && !event.altKey && !event.metaKey) {
            const currentTime = Date.now();
            event.preventDefault();
            if (currentTime - lastEnterPressTime <= doublePressThreshold) {
                clickSendButton();
            }
            lastEnterPressTime = currentTime;
        }

    });

    // ================= Initialize Settings UI =================
    function initializeUI() {
        createSettingsUI();

        const uiObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (!document.getElementById('chatgpt-dev-settings')) {
                    console.log('Settings UI was removed, recreating...');
                    createSettingsUI();
                }
            });
        });

        uiObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeUI);
    } else {
        initializeUI();
    }

    setTimeout(initializeUI, 1000);

    console.log('ChatGPT Dev with NICE Auto-Paste loaded successfully!');
    console.log('- Paste anywhere to auto-format with NICE guidelines or regular paste (if enabled)');
    console.log('- All features configurable in settings panel');
})();



