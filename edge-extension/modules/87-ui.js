(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    const { persistProfileSetting } = ns.helpers;

    Object.assign(ns.TTSReader, {
        // SECTION 19: UI Build (overlay etc.)
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        createUI() {
            document.documentElement.style.setProperty('--tts-focus-fade-ms', `${this.CONFIG.NAV_FOCUS_FADE_MS}ms`);
            const style = document.createElement('style');
            style.textContent = `
                :root {
                    --tts-ui-panel-bg: rgba(255, 255, 255, 0.9);
                    --tts-ui-panel-text: #111827;
                    --tts-ui-panel-border: rgba(31, 41, 55, 0.18);
                    --tts-ui-overlay-bg: rgba(255, 255, 255, 0.92);
                    --tts-ui-overlay-text: #111827;
                    --tts-ui-overlay-border: rgba(31, 41, 55, 0.22);
                }
                @media (prefers-color-scheme: dark) {
                    :root {
                        --tts-ui-panel-bg: rgba(0, 0, 0, 0.72);
                        --tts-ui-panel-text: #ffffff;
                        --tts-ui-panel-border: rgba(255, 255, 255, 0.18);
                        --tts-ui-overlay-bg: rgba(0, 0, 0, 0.75);
                        --tts-ui-overlay-text: #ffffff;
                        --tts-ui-overlay-border: rgba(255, 255, 255, 0.2);
                    }
                }
                /* ... (highlighting styles are the same) ... */
                .tts-current-sentence { background-color: rgba(46, 204, 113, 0.08) !important; box-shadow: inset 4px 0 0 #2ecc71 !important; transition: background-color 0.3s, box-shadow 0.3s; }
                .tts-current-word { background-color: rgba(250, 210, 50, 0.9) !important; font-weight: bold !important; color: black !important; border-radius: 3px; transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: background-color 0.1s, transform 0.1s; }
                ::highlight(tts-current-word) { background-color: rgba(250, 210, 50, 0.9); color: black; }
                .tts-navigation-focus { background-color: rgba(52, 152, 219, 0.3) !important; box-shadow: inset 4px 0 0 #3498db !important; transition: background-color 0.3s, box-shadow 0.3s; }
                .tts-focus-fade-out { box-shadow: none !important; background-color: transparent !important; transition: background-color var(--tts-focus-fade-ms, 500ms) ease, box-shadow var(--tts-focus-fade-ms, 500ms) ease; }
                .tts-overlay-hidden [data-tts-ui] { display: none !important; }
                [data-message-author-role],
                [data-message-author-role] *,
                section[data-turn],
                section[data-turn] *,
                [data-message-author-role] .markdown,
                [data-message-author-role] .whitespace-pre-wrap,
                section[data-turn] .markdown,
                section[data-turn] .whitespace-pre-wrap {
                    user-select: text !important;
                    -webkit-user-select: text !important;
                }

                /* NEW: In-game waypoint style pointer */
                #tts-pointer {
                    position: fixed;
                    width: 36px;
                    height: 44px;
                    background-color: #e74c3c;
                    opacity: 0;
                    visibility: hidden;
                    cursor: pointer;
                    z-index: 2147483646;
                    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                    filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));
                    transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.1s linear;
                    pointer-events: none; /* Hide from mouse until visible */
                }
                #tts-pointer.visible {
                    opacity: 0.9;
                    visibility: visible;
                    pointer-events: auto; /* Allow clicks when visible */
                }
                #tts-pointer:hover {
                    opacity: 1;
                    transform: scale(1.15);
                }
            `;
            document.head.appendChild(style);

            // Create the single waypoint pointer
            const pointer = document.createElement('div');
            pointer.id = 'tts-pointer';
            pointer.setAttribute('data-tts-ui', 'true');
            pointer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(pointer);

            pointer.addEventListener('click', () => {
                const currentSentence = document.querySelector('.tts-current-sentence');
                if (currentSentence) {
                    currentSentence.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            // ... (rest of the UI panel code remains the same) ...
            const uiPanel = document.createElement('div');
            uiPanel.id = 'tts-control-panel';
            uiPanel.setAttribute('data-tts-ui', 'true');
            uiPanel.setAttribute('aria-hidden', 'true');
            uiPanel.style.cssText = `position: fixed; top: 80px; left: 10%; width: 180px; padding: 8px; background: var(--tts-ui-panel-bg); color: var(--tts-ui-panel-text); border: 1px solid var(--tts-ui-panel-border); font-family: Arial, sans-serif; font-size: 13px; border-radius: 6px; cursor: move; z-index: 2147483647; user-select: none; -webkit-user-select: none;`;
            uiPanel.innerHTML = `
                <div style="font-weight:bold; text-align:center; margin-bottom: 5px;">TTS Reader</div>
                <label for="tts-speed" style="display:block; margin-bottom:4px;">Speed: <span id="speed-value">${this.CONFIG.SPEECH_RATE.toFixed(1)}</span>x</label>
                <input type="range" id="tts-speed" min="0.5" max="5" step="0.1" value="${this.CONFIG.SPEECH_RATE}" style="width:100%;">
                <label for="tts-highlight-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-highlight-toggle" ${this.CONFIG.WORD_HIGHLIGHT_ENABLED ? 'checked' : ''} style="margin:0;">🖍️ Word highlight</label>
                <label for="tts-gap-trim-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-gap-trim-toggle" ${this.CONFIG.GAP_TRIM_ENABLED ? 'checked' : ''} style="margin:0;">✂️ Gap trim</label>
                <label for="tts-read-user-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-read-user-toggle" ${this.CONFIG.READ_USER_MESSAGES ? 'checked' : ''} style="margin:0;">👤 Read user msgs</label>
                <label for="tts-read-refs-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-read-refs-toggle" ${this.CONFIG.READ_REFERENCES ? 'checked' : ''} style="margin:0;">🔗 Read refs</label>
                <label for="tts-chat-style-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-chat-style-toggle" ${this.CONFIG.CHATGPT_TEXT_STYLING ? 'checked' : ''} style="margin:0;">🎨 Chat style</label>
                <label for="tts-low-gap-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-low-gap-toggle" ${this.CONFIG.LOW_GAP_MODE ? 'checked' : ''} style="margin:0;">⚡ Low-gap mode</label>
                <label for="tts-server-precache-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-server-precache-toggle" ${this.CONFIG.SERVER_PRECACHE_MODE ? 'checked' : ''} style="margin:0;">🛰️ Server precache</label>
                <label for="tts-auto-read-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-auto-read-toggle" ${this.CONFIG.AUTO_READ_NEW_MESSAGES ? 'checked' : ''} style="margin:0;">🤖 Auto-read new</label>
                <label for="tts-loop-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-loop-toggle" ${this.CONFIG.LOOP_ON_END ? 'checked' : ''} style="margin:0;">🔁 Loop to top</label>
                <label for="tts-autoscroll-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-autoscroll-toggle" ${this.CONFIG.AUTO_SCROLL_ENABLED ? 'checked' : ''} style="margin:0;">📜 Auto-scroll</label>
                <label for="tts-smart-copy-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-smart-copy-toggle" ${this.CONFIG.SMART_COPY_ENABLED ? 'checked' : ''} style="margin:0;">Smart copy</label>
                <label for="tts-nav-start-skip-toggle" style="display:flex; align-items:center; gap:6px; margin-top:6px; cursor:pointer;"><input type="checkbox" id="tts-nav-start-skip-toggle" ${this.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS ? 'checked' : ''} style="margin:0;">Apply skip on nav</label>
                <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
                    <label for="tts-click-skip-words" style="flex:1; min-width:0;">Start +X words</label>
                    <input type="number" id="tts-click-skip-words" min="0" step="1" value="${this.CONFIG.CLICK_START_SKIP_WORDS}" style="width:72px; padding:2px; background: rgba(0,0,0,0.8); color:#fff; border:1px solid rgba(255,255,255,0.25); border-radius:3px;">
                </div>
                <div style="display:flex; gap:6px; margin-top:6px;">
                    <button id="tts-copy-transcript-btn" type="button" style="flex:1; padding:4px 8px; background: rgba(255,255,255,0.2); border: none; color: #fff; cursor: pointer; border-radius: 3px;">Copy transcript</button>
                    <button id="tts-copy-selection-btn" type="button" style="flex:1; padding:4px 8px; background: rgba(255,255,255,0.2); border: none; color: #fff; cursor: pointer; border-radius: 3px;">Copy selection</button>
                </div>
            `;
            document.body.appendChild(uiPanel);
            this.overlayPanel = uiPanel;
            this.applyOverlayPanelPosition(this.CONFIG.OVERLAY_POSITION);

            const speedInput = document.getElementById('tts-speed');
            speedInput.addEventListener('input', e => {
                this.CONFIG.SPEECH_RATE = parseFloat(e.target.value);
                document.getElementById('speed-value').textContent = this.CONFIG.SPEECH_RATE.toFixed(1);
            });
            speedInput.addEventListener('mousedown', e => e.stopPropagation());
            const highlightToggle = document.getElementById('tts-highlight-toggle');
            highlightToggle.addEventListener('change', e => {
                this.setWordHighlightEnabled(e.target.checked);
            });
            highlightToggle.addEventListener('mousedown', e => e.stopPropagation());
            const gapTrimToggle = document.getElementById('tts-gap-trim-toggle');
            gapTrimToggle.addEventListener('change', e => {
                this.setGapTrimEnabled(e.target.checked);
            });
            gapTrimToggle.addEventListener('mousedown', e => e.stopPropagation());
            const readUserToggle = document.getElementById('tts-read-user-toggle');
            readUserToggle.addEventListener('change', e => {
                this.setReadUserMessagesEnabled(e.target.checked);
            });
            readUserToggle.addEventListener('mousedown', e => e.stopPropagation());
            const readRefsToggle = document.getElementById('tts-read-refs-toggle');
            readRefsToggle.addEventListener('change', e => {
                this.setReadReferencesEnabled(e.target.checked);
            });
            readRefsToggle.addEventListener('mousedown', e => e.stopPropagation());
            const chatStyleToggle = document.getElementById('tts-chat-style-toggle');
            chatStyleToggle.addEventListener('change', e => {
                this.setChatGPTTextStylingEnabled(e.target.checked);
            });
            chatStyleToggle.addEventListener('mousedown', e => e.stopPropagation());
            const lowGapToggle = document.getElementById('tts-low-gap-toggle');
            lowGapToggle.addEventListener('change', e => {
                this.setLowGapMode(e.target.checked);
                persistProfileSetting(this.settingsProfile, 'lowGapMode', this.CONFIG.LOW_GAP_MODE);
            });
            lowGapToggle.addEventListener('mousedown', e => e.stopPropagation());
            const serverPrecacheToggle = document.getElementById('tts-server-precache-toggle');
            serverPrecacheToggle.addEventListener('change', e => {
                this.setServerPrecacheMode(e.target.checked);
                persistProfileSetting(this.settingsProfile, 'serverPrecacheMode', this.CONFIG.SERVER_PRECACHE_MODE);
            });
            serverPrecacheToggle.addEventListener('mousedown', e => e.stopPropagation());
            const autoReadToggle = document.getElementById('tts-auto-read-toggle');
            autoReadToggle.addEventListener('change', e => {
                this.setAutoReadEnabled(e.target.checked);
            });
            autoReadToggle.addEventListener('mousedown', e => e.stopPropagation());
            const loopToggle = document.getElementById('tts-loop-toggle');
            loopToggle.addEventListener('change', e => {
                this.setLoopEnabled(e.target.checked);
            });
            loopToggle.addEventListener('mousedown', e => e.stopPropagation());
            const autoScrollToggle = document.getElementById('tts-autoscroll-toggle');
            autoScrollToggle.addEventListener('change', e => {
                this.setAutoScrollEnabled(e.target.checked);
            });
            autoScrollToggle.addEventListener('mousedown', e => e.stopPropagation());
            const smartCopyToggle = document.getElementById('tts-smart-copy-toggle');
            smartCopyToggle.addEventListener('change', (e) => {
                this.setSmartCopyEnabled(e.target.checked);
                persistProfileSetting(this.settingsProfile, 'smartCopyEnabled', this.CONFIG.SMART_COPY_ENABLED);
            });
            smartCopyToggle.addEventListener('mousedown', (e) => e.stopPropagation());
            const navStartSkipToggle = document.getElementById('tts-nav-start-skip-toggle');
            navStartSkipToggle.addEventListener('change', (e) => {
                this.setApplyStartSkipToNavigationStarts(e.target.checked, true);
                persistProfileSetting(this.settingsProfile, 'applyStartSkipToNavigationStarts', this.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS);
            });
            navStartSkipToggle.addEventListener('mousedown', (e) => e.stopPropagation());
            const clickSkipWordsInput = document.getElementById('tts-click-skip-words');
            clickSkipWordsInput.addEventListener('input', (e) => {
                this.setClickStartSkipWords(e.target.value, true);
                persistProfileSetting(this.settingsProfile, 'clickStartSkipWords', this.CONFIG.CLICK_START_SKIP_WORDS);
                e.target.value = String(this.CONFIG.CLICK_START_SKIP_WORDS);
            });
            clickSkipWordsInput.addEventListener('change', (e) => {
                this.setClickStartSkipWords(e.target.value, true);
                persistProfileSetting(this.settingsProfile, 'clickStartSkipWords', this.CONFIG.CLICK_START_SKIP_WORDS);
                e.target.value = String(this.CONFIG.CLICK_START_SKIP_WORDS);
            });
            clickSkipWordsInput.addEventListener('mousedown', (e) => e.stopPropagation());
            const copyTranscriptButton = document.getElementById('tts-copy-transcript-btn');
            copyTranscriptButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.copyTranscriptFromOverlay();
            });
            copyTranscriptButton.addEventListener('mousedown', (e) => e.stopPropagation());
            const copySelectionButton = document.getElementById('tts-copy-selection-btn');
            copySelectionButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.copySelectionFromOverlay();
            });
            copySelectionButton.addEventListener('mousedown', (e) => e.stopPropagation());
            this.makeDraggable(uiPanel, (position) => {
                this.setOverlayPosition(position, { persist: true, silent: true });
            });

            if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                const diagnostics = document.createElement('div');
                diagnostics.id = 'tts-diagnostics-panel';
                diagnostics.setAttribute('data-tts-ui', 'true');
                diagnostics.setAttribute('aria-hidden', 'true');
                diagnostics.style.cssText = 'position: fixed; right: 12px; bottom: 12px; background: var(--tts-ui-overlay-bg); color: var(--tts-ui-overlay-text); border: 1px solid var(--tts-ui-overlay-border); padding: 6px 8px; border-radius: 6px; font-family: Arial, sans-serif; font-size: 11px; z-index: 2147483647; pointer-events: none; user-select: none; -webkit-user-select: none;';
                diagnostics.textContent = 'gap: -- ms | wrap: -- ms';
                document.body.appendChild(diagnostics);
                this.diagnosticsPanel = diagnostics;
            }

            const progress = document.createElement('div');
            progress.id = 'tts-progress-panel';
            progress.setAttribute('data-tts-ui', 'true');
            progress.setAttribute('aria-hidden', 'true');
            progress.style.cssText = 'position: fixed; right: 12px; bottom: 44px; background: var(--tts-ui-overlay-bg); color: var(--tts-ui-overlay-text); border: 1px solid var(--tts-ui-overlay-border); padding: 6px 8px; border-radius: 6px; font-family: Arial, sans-serif; font-size: 11px; z-index: 2147483647; pointer-events: none; user-select: none; -webkit-user-select: none; opacity: 0; transition: opacity 0.2s ease;';
            progress.textContent = 'Reading 0/0';
            document.body.appendChild(progress);
            this.progressPanel = progress;
            this.ensureNavigationTrailLayer();
            this.applyOverlayVisibility();
        },

        // MODIFIED: This function is now mostly disabled for TTS reading.
        // =============================================================================
    });
})();
