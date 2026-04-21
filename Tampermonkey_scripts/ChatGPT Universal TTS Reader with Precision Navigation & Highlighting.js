// ==UserScript==
// @name         *** ChatGPT Universal TTS Reader with Precision Navigation & Highlighting (Ignore Content Root)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  TTS reader skips designated UI elements under #content-root
// @author       Your Name (updated by AI)
// @match        https://chat.openai.com/c/*
// @match        https://chat.openai.com/g/*
// @match        https://chat.openai.com/?*
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chatgpt.com/g/*
// @match        https://chatgpt.com/?*
// @match        https://chatgpt.com/* 
// @match        file:///*
// @updateURL    https://raw.githubusercontent.com/sriharshaguthikonda/Tampermonkey/codex/auto-read-streaming/ChatGPT%20Universal%20TTS%20Reader%20with%20Precision%20Navigation%20%26%20Highlighting.js
// @downloadURL  https://raw.githubusercontent.com/sriharshaguthikonda/Tampermonkey/codex/auto-read-streaming/ChatGPT%20Universal%20TTS%20Reader%20with%20Precision%20Navigation%20%26%20Highlighting.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const TTSReader = {
        speechSynthesis: window.speechSynthesis,
        ttsActive: false,
        isPaused: false,
        isNavigating: false,
        continuousReadingActive: false,
        pageFullyLoaded: false,
        lastSpokenElement: null,
        currentWordSpan: null,
        lastScrollTime: 0,
        autoScrollIntervalId: null,
        autoScrollInProgress: false,
        autoScrollInProgressId: null,
        userInteractingUntil: 0,
        autoScrollResumeId: null,
        navigationTimeoutId: null,
        pointerLoopId: null,
        paragraphsList: [],
        queuedParagraphs: new Set(),
        paragraphObserver: null,
        paragraphsDirty: true,
        currentParagraphIndex: -1,
        pendingNavIndex: -1,
        navKeyHeld: false,
        prewrappedParagraphs: new Map(),
        wordHighlightActiveForCurrent: false,
        pendingReverts: [],
        pendingRevertId: null,
        pendingRevertUsesIdle: false,
        diagnosticsPanel: null,
        progressPanel: null,
        lastUtteranceEndTime: 0,
        lastGapMs: null,
        lastWrapMs: null,
        autoReadObserver: null,
        autoReadDebounceId: null,
        lastAutoReadMessageElement: null,
        lastAutoReadTriggeredAt: 0,
        autoReadMessageActivity: new WeakMap(),
        waitingForMoreContent: false,
        waitForMoreTimeoutId: null,
        waitForMoreSince: 0,
        waitForMoreNextIndex: -1,
        isChatGPTPage: false,
        processedParagraph: { element: null, originalHTML: '', wordSpans: [], wordOffsets: [] },
        serverVoiceEnabled: false,
        serverBaseUrl: null,
        currentServerAudio: null,
        serverSentenceCache: new Map(),
        serverFetchQueue: [],
        serverFetchInProgress: false,
        voices: [],
        currentVoice: null,
        voicePreferencesLoaded: false,
        hasStoredEmojiVoiceMappings: false,

        CONFIG: {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, .markdown, div[class*="content"], article',
            // Add #content-root and all its descendants to ignore list
            IGNORE_SELECTORS: '.settings-header, nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-tts-ui], pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token, #thread-bottom-container, #content-root, #content-root *',
            SPEECH_RATE: 5,
            QUEUE_LOOKAHEAD: 5,
            NAV_READ_DELAY_MS: 0,
            LOW_GAP_MODE: true,
            SERVER_PRECACHE_ENABLED: true,
            SERVER_VOICE_URL: 'https://api.example.com/tts',
            SERVER_VOICE_MAX_CACHE_SIZE: 100,
            SERVER_VOICE_PREFETCH_SENTENCES: 3,
            NAV_THROTTLE_MS: 20,
            NAV_FOCUS_HOLD_MS: 800,
            NAV_KEYUP_READ_DELAY_MS: 150,
            NAV_FOCUS_FADE_MS: 800,
            SCROLL_THROTTLE_MS: 250,
            SCROLL_EDGE_PADDING: 80,
            AUTO_SCROLL_ENABLED: true,
            AUTO_SCROLL_MODE: 'paragraph',
            AUTO_SCROLL_INTERVAL_MS: 2000,
            AUTO_SCROLL_USER_PAUSE_MS: 2000,
            AUTO_SCROLL_SUPPRESS_SCROLL_MS: 400,
            WORD_HIGHLIGHT_ENABLED: true,
            GAP_TRIM_ENABLED: true,
            READ_USER_MESSAGES: false,
            SAVED_HTML_USER_DETECTION: true,
            PREWRAP_IDLE_TIMEOUT_MS: 250,
            DEFERRED_REVERT_IDLE_MS: 250,
            SHOW_DIAGNOSTICS_PANEL: true,
            AUTO_READ_NEW_MESSAGES: false,
            AUTO_READ_COOLDOWN_MS: 1500,
            AUTO_READ_STABLE_MS: 800,
            AUTO_READ_MIN_PARAGRAPHS: 3,
            WAIT_FOR_MORE_MS: 8000,
            WAIT_RETRY_MS: 250,
            LOOP_WAIT_MS: 1200,
            LOOP_ON_END: true,
            HOTKEYS: { ACTIVATE: 'U', PAUSE_RESUME: 'P', NAV_NEXT: 'ArrowRight', NAV_PREV: 'ArrowLeft', STOP: 'Escape' },
            EMOJI_REGEX: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/ug,
            SPEAKER_EMOJI_REGEX: /^\s*((?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*))/u,
            VOICE_PREFERENCES: {
                preferredVoice: null,
                pitch: 1.0,
                rate: 1.0,
                volume: 0.9,
                emojiVoiceMappings: [],
                presets: {
                    casual: { rate: 1.2, pitch: 0.9 },
                    learning: { rate: 0.8, pitch: 1.0 },
                    news: { rate: 1.0, pitch: 1.1 }
                }
            },
            READING_MODES: {
                SENTENCE: 'sentence',
                PARAGRAPH: 'paragraph',
                CONTINUOUS: 'continuous'
            },
            READING_STATS: {
                wordsPerMinute: 0,
                totalTimeMs: 0,
                startTime: null
            },
            READING_MODE: 'sentence',
        },

        init() {
            this.detectContext();
            this.waitForPageLoad();
            this.createUI();
            this.setupEventListeners();
            this.loadVoices();
            this.initParagraphObserver();
            if (this.isChatGPTPage) {
                this.initAutoReadObserver();
            }
        },

        detectContext() {
            const host = (window.location && window.location.hostname) ? window.location.hostname : '';
            const isChatGPTHost = host === 'chat.openai.com' || host === 'chatgpt.com';
            this.isChatGPTPage = isChatGPTHost;
            if (!this.isChatGPTPage) {
                this.CONFIG.CANDIDATE_SELECTORS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, code, article, section, main, div';
                this.CONFIG.IGNORE_SELECTORS = 'script, style, noscript, [aria-hidden="true"], [data-tts-ui]';
                this.CONFIG.AUTO_READ_NEW_MESSAGES = false;
                this.CONFIG.AUTO_READ_MIN_PARAGRAPHS = 0;
                this.CONFIG.AUTO_READ_STABLE_MS = 0;
                this.CONFIG.SHOW_DIAGNOSTICS_PANEL = false;
                this.CONFIG.WAIT_FOR_MORE_MS = 0;
                this.CONFIG.LOOP_WAIT_MS = 0;
            }
        },

        // ... (All functions from waitForPageLoad to triggerTTS are unchanged) ...
        waitForPageLoad() {
            if (document.readyState === 'complete') {
                setTimeout(() => { this.pageFullyLoaded = true; }, 1000);
            } else {
                window.addEventListener('load', () => setTimeout(() => { this.pageFullyLoaded = true; }, 2000));
            }
        },

        loadVoices() {
            this.loadVoicePreferences();
            return new Promise((resolve) => {
                const voices = this.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    this.voices = voices;
                    this.restoreVoicePreferences();
                    resolve(voices);
                }
                else this.speechSynthesis.onvoiceschanged = () => {
                    this.voices = this.speechSynthesis.getVoices();
                    this.restoreVoicePreferences();
                    resolve(this.voices);
                };
            });
        },

        loadVoicePreferences() {
            if (this.voicePreferencesLoaded) return;
            this.voicePreferencesLoaded = true;

            try {
                const storedPreferences = localStorage.getItem('tts-voice-prefs');
                if (!storedPreferences) return;

                const parsedPreferences = JSON.parse(storedPreferences);
                this.hasStoredEmojiVoiceMappings = Array.isArray(parsedPreferences?.emojiVoiceMappings);
                this.CONFIG.VOICE_PREFERENCES = {
                    ...this.CONFIG.VOICE_PREFERENCES,
                    preferredVoice: typeof parsedPreferences?.preferredVoice === 'string' && parsedPreferences.preferredVoice.trim()
                        ? parsedPreferences.preferredVoice.trim()
                        : null,
                    pitch: Number.isFinite(parsedPreferences?.pitch)
                        ? parsedPreferences.pitch
                        : this.CONFIG.VOICE_PREFERENCES.pitch,
                    rate: Number.isFinite(parsedPreferences?.rate)
                        ? parsedPreferences.rate
                        : this.CONFIG.VOICE_PREFERENCES.rate,
                    volume: Number.isFinite(parsedPreferences?.volume)
                        ? parsedPreferences.volume
                        : this.CONFIG.VOICE_PREFERENCES.volume,
                    emojiVoiceMappings: Array.isArray(parsedPreferences?.emojiVoiceMappings)
                        ? parsedPreferences.emojiVoiceMappings.map(mapping => ({
                            emoji: typeof mapping?.emoji === 'string' ? mapping.emoji : '',
                            voiceName: typeof mapping?.voiceName === 'string' ? mapping.voiceName : ''
                        }))
                        : [],
                    presets: this.CONFIG.VOICE_PREFERENCES.presets
                };

                if (Number.isFinite(this.CONFIG.VOICE_PREFERENCES.rate) && this.CONFIG.VOICE_PREFERENCES.rate > 0) {
                    this.CONFIG.SPEECH_RATE = this.CONFIG.VOICE_PREFERENCES.rate;
                }
            } catch (error) {
                console.warn('Unable to restore TTS voice preferences.', error);
            }
        },

        restoreVoicePreferences() {
            if (this.voices && this.voices.length > 0 && this.CONFIG.VOICE_PREFERENCES.preferredVoice) {
                this.currentVoice = this.findVoiceByName(this.CONFIG.VOICE_PREFERENCES.preferredVoice);
            } else if (!this.CONFIG.VOICE_PREFERENCES.preferredVoice) {
                this.currentVoice = null;
            }

            if (Number.isFinite(this.CONFIG.VOICE_PREFERENCES.rate) && this.CONFIG.VOICE_PREFERENCES.rate > 0) {
                this.CONFIG.SPEECH_RATE = this.CONFIG.VOICE_PREFERENCES.rate;
            }

            this.seedDefaultEmojiVoiceMappings();
            this.syncVoiceSettingsUI();
        },

        applyVoicePreset(preset) {
            if (!preset) return;
            this.CONFIG.VOICE_PREFERENCES.pitch = preset.pitch;
            this.CONFIG.VOICE_PREFERENCES.rate = preset.rate;
            this.CONFIG.SPEECH_RATE = preset.rate;
            this.saveVoicePreferences();
            this.syncVoiceSettingsUI();
        },

        saveVoicePreferences() {
            this.CONFIG.VOICE_PREFERENCES.preferredVoice = this.currentVoice ? this.currentVoice.name : null;
            this.CONFIG.VOICE_PREFERENCES.rate = this.CONFIG.SPEECH_RATE;

            const payload = {
                ...this.CONFIG.VOICE_PREFERENCES,
                emojiVoiceMappings: this.normalizeEmojiVoiceMappings(this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings)
            };
            localStorage.setItem('tts-voice-prefs', JSON.stringify(payload));
        },

        setVoice(voiceName) {
            if (!voiceName) {
                this.currentVoice = null;
                this.saveVoicePreferences();
                this.syncVoiceSettingsUI();
                return;
            }

            const voice = this.findVoiceByName(voiceName);
            if (voice) {
                this.currentVoice = voice;
                this.saveVoicePreferences();
                this.syncVoiceSettingsUI();
            }
        },

        getAvailableVoices() {
            if (this.voices && this.voices.length > 0) return this.voices;
            return this.speechSynthesis.getVoices();
        },

        findVoiceByName(voiceName) {
            if (!voiceName) return null;
            return this.getAvailableVoices().find(voice => voice.name === voiceName) || null;
        },

        findVoiceByKeywordCandidates(candidates, { excludeMultilingual = false } = {}) {
            const voices = this.getAvailableVoices();
            if (!voices || voices.length === 0) return null;

            for (const candidate of candidates) {
                const loweredCandidate = candidate.toLowerCase();
                const match = voices.find(voice => {
                    const loweredName = (voice.name || '').toLowerCase();
                    if (excludeMultilingual && loweredName.includes('multilingual')) return false;
                    return loweredName.includes(loweredCandidate);
                });
                if (match) return match;
            }

            return null;
        },

        findEnglishVoice() {
            const voices = this.getAvailableVoices();
            if (!voices || voices.length === 0) return null;

            return voices.find(voice => (voice.lang || '').toLowerCase().startsWith('en-us')) ||
                voices.find(voice => (voice.lang || '').toLowerCase().startsWith('en')) ||
                voices[0] ||
                null;
        },

        findAvaVoice() {
            return this.findVoiceByKeywordCandidates(['ava'], { excludeMultilingual: true }) ||
                this.findVoiceByKeywordCandidates(['ava']);
        },

        findFemaleVoice() {
            return this.findAvaVoice() ||
                this.findVoiceByKeywordCandidates(
                    ['aria', 'jenny', 'emma', 'jane', 'sara', 'samantha', 'michelle', 'zira', 'female'],
                    { excludeMultilingual: true }
                ) ||
                this.findVoiceByKeywordCandidates(
                    ['aria', 'jenny', 'emma', 'jane', 'sara', 'samantha', 'michelle', 'zira', 'female']
                ) ||
                this.findEnglishVoice();
        },

        findMaleVoice() {
            return this.findVoiceByKeywordCandidates(
                ['andrew', 'brian', 'christopher', 'davis', 'guy', 'roger', 'ryan', 'steffan', 'adam', 'daniel', 'james', 'male'],
                { excludeMultilingual: true }
            ) ||
                this.findVoiceByKeywordCandidates(
                    ['andrew', 'brian', 'christopher', 'davis', 'guy', 'roger', 'ryan', 'steffan', 'adam', 'daniel', 'james', 'male']
                ) ||
                this.findEnglishVoice();
        },

        findDefaultVoice() {
            return this.currentVoice || this.findFemaleVoice() || this.findEnglishVoice();
        },

        extractSpeakerEmojiFromLeadingLabel(text) {
            const source = String(text || '').trim();
            if (!source) return '';

            const normalized = source
                .toLowerCase()
                .replace(/[\u200b-\u200d\uFEFF]/g, '')
                .replace(/[\[\](){}<>`"'*_.,!?;:/\\|]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!normalized) return '';

            const prefix = normalized.slice(0, 64);
            if (/^(?:man health worker|male health worker|man doctor|male doctor|doctor|dr|physician|clinician|medical worker|health worker)\b/.test(prefix)) {
                return '👨‍⚕️';
            }
            if (/^(?:patient|person|adult|user)\b/.test(prefix)) {
                return '🧑';
            }
            return '';
        },

        extractLeadingSpeakerEmoji(text) {
            if (!text) return '';
            const source = String(text);
            const directMatch = source.match(this.CONFIG.SPEAKER_EMOJI_REGEX);
            if (directMatch) return directMatch[1];

            const scanWindow = source.slice(0, 64);
            const fallbackEmojiMatch = scanWindow.match(/(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/u);
            if (fallbackEmojiMatch) return fallbackEmojiMatch[0];

            return this.extractSpeakerEmojiFromLeadingLabel(scanWindow);
        },

        extractLeadingSpeakerEmojiFromElement(element, rawText = '') {
            const fromText = this.extractLeadingSpeakerEmoji(rawText);
            if (fromText) return fromText;
            if (!element) return '';

            const labelCandidates = [];
            if (typeof element.getAttribute === 'function') {
                const ownLabel = element.getAttribute('aria-label');
                if (ownLabel) labelCandidates.push(ownLabel);
            }

            if (typeof element.querySelectorAll === 'function') {
                const iconNodes = element.querySelectorAll('[role="img"][aria-label], img[alt], [aria-label][data-testid*="emoji"]');
                const limit = Math.min(iconNodes.length, 4);
                for (let i = 0; i < limit; i++) {
                    const node = iconNodes[i];
                    const label = node.getAttribute('aria-label') || node.getAttribute('alt') || '';
                    if (label) labelCandidates.push(label);
                }
            }

            for (const label of labelCandidates) {
                const emoji = this.extractLeadingSpeakerEmoji(label);
                if (emoji) return emoji;
            }
            return '';
        },

        normalizeEmojiRuleValue(value) {
            if (typeof value !== 'string') return '';
            return this.extractLeadingSpeakerEmoji(value.trim());
        },

        normalizeEmojiVoiceMappings(mappings) {
            if (!Array.isArray(mappings)) return [];

            const normalizedMappings = [];
            for (const mapping of mappings) {
                const emoji = this.normalizeEmojiRuleValue(mapping?.emoji);
                if (!emoji) continue;

                normalizedMappings.push({
                    emoji,
                    voiceName: typeof mapping?.voiceName === 'string' ? mapping.voiceName : ''
                });
            }

            return normalizedMappings;
        },

        seedDefaultEmojiVoiceMappings() {
            if (this.hasStoredEmojiVoiceMappings || this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings.length > 0) return;

            const doctorVoice = this.findMaleVoice();
            const patientVoice = this.findAvaVoice() || this.findFemaleVoice();

            this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings = [
                { emoji: '👨‍⚕️', voiceName: doctorVoice ? doctorVoice.name : '' },
                { emoji: '🧑', voiceName: patientVoice ? patientVoice.name : '' }
            ];
            this.hasStoredEmojiVoiceMappings = true;
            this.saveVoicePreferences();
        },

        getVoiceForSpeakerEmoji(speakerEmoji) {
            const normalizedEmoji = this.normalizeEmojiRuleValue(speakerEmoji);
            if (normalizedEmoji) {
                const mapping = (this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings || []).find(entry =>
                    this.normalizeEmojiRuleValue(entry?.emoji) === normalizedEmoji
                );
                if (mapping && mapping.voiceName) {
                    const mappedVoice = this.findVoiceByName(mapping.voiceName);
                    if (mappedVoice) return mappedVoice;
                }
            }

            return this.findDefaultVoice();
        },

        createUtterance(text, speakerEmoji = '') {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.CONFIG.SPEECH_RATE;
            utterance.pitch = this.CONFIG.VOICE_PREFERENCES.pitch;
            utterance.volume = this.CONFIG.VOICE_PREFERENCES.volume;

            const voice = this.getVoiceForSpeakerEmoji(speakerEmoji);
            if (voice) {
                utterance.voice = voice;
            }

            return utterance;
        },

        extractTTSMetadata(text, fallbackSpeakerEmoji = '', sourceElement = null) {
            const rawText = typeof text === 'string' ? text : '';
            let speakerEmoji = this.extractLeadingSpeakerEmoji(rawText);
            if (!speakerEmoji && sourceElement) {
                speakerEmoji = this.extractLeadingSpeakerEmojiFromElement(sourceElement, rawText);
            }
            if (!speakerEmoji) {
                speakerEmoji = this.normalizeEmojiRuleValue(fallbackSpeakerEmoji);
            }
            const cleaned = this.cleanTextForTTS(rawText);

            return {
                rawText,
                speakerEmoji,
                text: this.trimGapForParagraphEnd(cleaned)
            };
        },

        getTextDataFromElement(element) {
            if (!element) {
                return { rawText: '', speakerEmoji: '', text: '' };
            }

            const storedSpeakerEmoji = element.getAttribute('data-tts-speaker-emoji') || '';
            const metadata = this.extractTTSMetadata(element.textContent || '', storedSpeakerEmoji, element);
            if (metadata.speakerEmoji) {
                element.setAttribute('data-tts-speaker-emoji', metadata.speakerEmoji);
            } else {
                element.removeAttribute('data-tts-speaker-emoji');
            }

            return metadata;
        },

        populateVoiceSelect(selectElement, selectedVoiceName = '', defaultLabel = 'Default') {
            if (!selectElement) return;

            const voices = this.getAvailableVoices();
            selectElement.innerHTML = '';

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = defaultLabel;
            selectElement.appendChild(defaultOption);

            if (selectedVoiceName && !voices.some(voice => voice.name === selectedVoiceName)) {
                const missingOption = document.createElement('option');
                missingOption.value = selectedVoiceName;
                missingOption.textContent = `${selectedVoiceName} (unavailable)`;
                selectElement.appendChild(missingOption);
            }

            voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                selectElement.appendChild(option);
            });

            selectElement.value = selectedVoiceName || '';
        },

        syncVoiceSettingsUI() {
            const speedInput = document.getElementById('tts-speed');
            const speedValue = document.getElementById('speed-value');
            const voiceSelect = document.getElementById('tts-voice-select');

            if (speedInput) {
                speedInput.value = String(this.CONFIG.SPEECH_RATE);
            }
            if (speedValue) {
                speedValue.textContent = this.CONFIG.SPEECH_RATE.toFixed(1);
            }
            if (voiceSelect) {
                this.populateVoiceSelect(voiceSelect, this.currentVoice ? this.currentVoice.name : '', 'Default');
            }

            this.renderEmojiVoiceMappings();
        },

        addEmojiVoiceMapping() {
            this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings.push({ emoji: '', voiceName: '' });
            this.renderEmojiVoiceMappings();
        },

        updateEmojiVoiceMapping(index, changes = {}) {
            if (!Array.isArray(this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings) || index < 0) return;

            const currentMapping = this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings[index] || { emoji: '', voiceName: '' };
            const nextMapping = {
                ...currentMapping,
                ...changes
            };

            if (Object.prototype.hasOwnProperty.call(changes, 'emoji')) {
                nextMapping.emoji = this.normalizeEmojiRuleValue(changes.emoji);
            }

            this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings[index] = nextMapping;
            this.saveVoicePreferences();
        },

        removeEmojiVoiceMapping(index) {
            if (!Array.isArray(this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings) || index < 0) return;
            this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings.splice(index, 1);
            this.saveVoicePreferences();
            this.renderEmojiVoiceMappings();
        },

        renderEmojiVoiceMappings() {
            const mappingsContainer = document.getElementById('tts-emoji-voice-list');
            if (!mappingsContainer) return;

            mappingsContainer.innerHTML = '';
            const mappings = this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings || [];

            if (mappings.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.textContent = 'No emoji voice rules yet.';
                emptyState.style.cssText = 'font-size: 11px; opacity: 0.75;';
                mappingsContainer.appendChild(emptyState);
                return;
            }

            mappings.forEach((mapping, index) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; gap:4px; align-items:center;';

                const emojiInput = document.createElement('input');
                emojiInput.type = 'text';
                emojiInput.placeholder = '👨‍⚕️';
                emojiInput.value = mapping.emoji || '';
                emojiInput.maxLength = 16;
                emojiInput.title = 'Leading emoji to match';
                emojiInput.style.cssText = 'width: 56px; padding: 2px 4px; background: rgba(0,0,0,0.8); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 3px;';
                emojiInput.addEventListener('change', e => {
                    this.updateEmojiVoiceMapping(index, { emoji: e.target.value });
                    e.target.value = this.CONFIG.VOICE_PREFERENCES.emojiVoiceMappings[index]?.emoji || '';
                    this.renderEmojiVoiceMappings();
                });
                emojiInput.addEventListener('mousedown', e => e.stopPropagation());

                const mappingSelect = document.createElement('select');
                mappingSelect.style.cssText = 'flex: 1; min-width: 0; padding: 2px; background: rgba(0,0,0,0.8); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 3px;';
                this.populateVoiceSelect(mappingSelect, mapping.voiceName || '', 'Use default');
                mappingSelect.addEventListener('change', e => {
                    this.updateEmojiVoiceMapping(index, { voiceName: e.target.value });
                });
                mappingSelect.addEventListener('mousedown', e => e.stopPropagation());

                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.textContent = '×';
                removeButton.title = 'Remove emoji voice rule';
                removeButton.style.cssText = 'width: 28px; padding: 2px 0; background: rgba(255,255,255,0.14); border: none; color: #fff; cursor: pointer; border-radius: 3px;';
                removeButton.addEventListener('click', () => this.removeEmojiVoiceMapping(index));
                removeButton.addEventListener('mousedown', e => e.stopPropagation());

                row.appendChild(emojiInput);
                row.appendChild(mappingSelect);
                row.appendChild(removeButton);
                mappingsContainer.appendChild(row);
            });
        },

        updateReadingStats(wordCount) {
            if (!this.CONFIG.READING_STATS.startTime) return;
            
            const now = Date.now();
            const elapsedMs = now - this.CONFIG.READING_STATS.startTime;
            if (elapsedMs > 0) {
                this.CONFIG.READING_STATS.wordsPerMinute = Math.round((wordCount * 60000) / elapsedMs);
                this.CONFIG.READING_STATS.totalTimeMs += elapsedMs;
            }
        },

        detectIntelligentPause(text) {
            const pauseIndicators = /[.!?]+\s*$/;
            const commaPauses = /,\s*$/;
            const questionMarks = /[?]$/;
            
            return pauseIndicators.test(text.trim()) || 
                   commaPauses.test(text.trim()) || 
                   questionMarks.test(text.trim());
        },

        setReadingMode(mode) {
            if (!this.CONFIG.READING_MODES[mode.toUpperCase()]) return;
            this.CONFIG.READING_MODE = mode;
            this.showNotification(`Reading mode: ${mode}`);
        },

        initParagraphObserver() {
            if (this.paragraphObserver) return;
            this.paragraphObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        this.paragraphsDirty = true;
                        if (this.waitingForMoreContent) {
                            this.scheduleWaitForMore();
                        }
                        break;
                    }
                }
            });
            this.paragraphObserver.observe(document.body, { childList: true, subtree: true });
        },

        refreshParagraphsIfNeeded(force = false) {
            if (!force && !this.paragraphsDirty && this.paragraphsList.length > 0) return;
            this.paragraphsList = this.findAllParagraphs();
            this.paragraphsDirty = false;
            this.prunePrewrappedParagraphs();
        },

        refreshParagraphIndex(currentIndex) {
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (this.lastSpokenElement) {
                const idx = this.paragraphsList.findIndex(p => p.element === this.lastSpokenElement);
                if (idx !== -1) return idx;
            }
            return currentIndex;
        },

        cleanTextForTTS(text) {
            return text
                .replace(this.CONFIG.EMOJI_REGEX, '')
                .replace(/[\u200D\uFE0E]/g, '')
                .replace(/\s+/g, ' ');
        },

        trimGapForParagraphEnd(text) {
            if (!this.CONFIG.GAP_TRIM_ENABLED) return text;
            let trimmed = text.replace(/\s+$/g, '');
            trimmed = trimmed.replace(/[.!?]+$/g, '');
            return trimmed.replace(/\s+$/g, '');
        },

        getTextFromElement(element) {
            return this.getTextDataFromElement(element).text;
        },

        isUserMessageInSavedHTML(element) {
            if (!element) return false;
            
            const text = this.getTextFromElement(element);
            if (!text) return false;
            
            // Pattern 1: Look for "Copy" text after user input
            const nextSibling = element.nextElementSibling;
            if (nextSibling && nextSibling.textContent && nextSibling.textContent.trim() === 'Copy') {
                return true;
            }
            
            // Pattern 2: Check if text matches typical user input patterns
            const userPatterns = [
                /^(give me|tell me|show me|help me|what is|how to|why|when|where|who)/i,
                /^(yes|no|okay|alright|sure|thanks|thank you)/i,
                /^\d+.*,/, // Numbers followed by comma (like "8028267,")
                /^(doctor|dr\.?)/i, // Addressing the doctor
                /^(i'm|i am|it's|that's|this is)/i, // First person statements
            ];
            
            return userPatterns.some(pattern => pattern.test(text.trim()));
        },

        isVisiblyReadable(element) {
            if (!element || !element.tagName || element.offsetParent === null || window.getComputedStyle(element).visibility === 'hidden' || window.getComputedStyle(element).display === 'none') {
                return false;
            }
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            
            // Original check for live ChatGPT pages
            if (this.isChatGPTPage && !this.CONFIG.READ_USER_MESSAGES && element.closest('[data-message-author-role="user"]')) return false;
            
            // New check for saved HTML files (only if enabled)
            if (!this.CONFIG.READ_USER_MESSAGES && this.CONFIG.SAVED_HTML_USER_DETECTION && this.isUserMessageInSavedHTML(element)) return false;
            
            const text = this.getTextFromElement(element);
            if (!text || text.trim().length === 0) return false;
            return true;
        },

        findAllParagraphs() {
            let candidates = Array.from(document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS));
            let readableCandidates = candidates.filter(el => this.isVisiblyReadable(el));
            const candidateSet = new Set(readableCandidates);

            const finalParagraphs = readableCandidates.filter(el => {
                for (const otherEl of candidateSet) {
                    if (el !== otherEl && el.contains(otherEl)) return false;
                }
                return true;
            });

            return finalParagraphs.map(element => {
                const metadata = this.getTextDataFromElement(element);
                return {
                    element,
                    text: metadata.text,
                    speakerEmoji: metadata.speakerEmoji
                };
            });
        },

        clearHighlights(keepFading = false) {
            const selectors = ['.tts-current-sentence', '.tts-current-word'];
            if (!keepFading) {
                selectors.push('.tts-navigation-focus', '.tts-focus-fade-out');
            }
            document.querySelectorAll(selectors.join(', ')).forEach(el => {
                el.classList.remove(...selectors.map(s => s.substring(1)));
            });
            this.currentWordSpan = null;
        },

        revertParagraph() {
            const { element, originalHTML } = this.processedParagraph;
            if (element && originalHTML) {
                element.innerHTML = originalHTML;
            }
            this.processedParagraph = { element: null, originalHTML: '', wordSpans: [], wordOffsets: [] };
            this.clearHighlights();
        },

        prepareParagraphForReading(paraElement) {
            if (this.processedParagraph.element && this.processedParagraph.element !== paraElement) {
                this.deferProcessedParagraphRevert();
            }
            if (!paraElement || !paraElement.parentNode) return null;

            if (!this.wordHighlightActiveForCurrent) {
                return this.getTextFromElement(paraElement);
            }

            const cached = this.prewrappedParagraphs.get(paraElement);
            if (cached) {
                this.processedParagraph.element = paraElement;
                this.processedParagraph.originalHTML = cached.originalHTML;
                this.processedParagraph.wordSpans = cached.wordSpans;
                this.processedParagraph.wordOffsets = cached.wordOffsets;
                this.prewrappedParagraphs.delete(paraElement);
                return this.processedParagraph.wordSpans.map(s => s.textContent).join(' ');
            }

            this.processedParagraph.element = paraElement;
            this.processedParagraph.originalHTML = paraElement.innerHTML;
            const wordSpans = [];
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];
            while(walker.nextNode()) {
                if (walker.currentNode.textContent.trim().length > 0) nodesToProcess.push(walker.currentNode);
            }

            nodesToProcess.forEach(node => {
                const fragment = document.createDocumentFragment();
                const cleanedText = this.cleanTextForTTS(node.textContent);
                const parts = cleanedText.split(/(\s+)/);

                parts.forEach(part => {
                    if (/\S/.test(part)) {
                        const span = document.createElement('span');
                        span.textContent = part;
                        fragment.appendChild(span);
                        wordSpans.push(span);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                if (node.parentNode) node.parentNode.replaceChild(fragment, node);
            });

            this.processedParagraph.wordSpans = wordSpans;
            const wordOffsets = new Array(wordSpans.length);
            let offset = 0;
            for (let i = 0; i < wordSpans.length; i++) {
                wordOffsets[i] = offset;
                offset += wordSpans[i].textContent.length + 1;
            }
            this.processedParagraph.wordOffsets = wordOffsets;
            return this.processedParagraph.wordSpans.map(s => s.textContent).join(' ');
        },

        prewrapParagraph(paraElement) {
            if (!paraElement || !paraElement.parentNode) return null;
            if (this.prewrappedParagraphs.has(paraElement)) return this.prewrappedParagraphs.get(paraElement);

            const originalHTML = paraElement.innerHTML;
            const wordSpans = [];
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];
            while(walker.nextNode()) {
                if (walker.currentNode.textContent.trim().length > 0) nodesToProcess.push(walker.currentNode);
            }

            nodesToProcess.forEach(node => {
                const fragment = document.createDocumentFragment();
                const cleanedText = this.cleanTextForTTS(node.textContent);
                const parts = cleanedText.split(/(\s+)/);

                parts.forEach(part => {
                    if (/\S/.test(part)) {
                        const span = document.createElement('span');
                        span.textContent = part;
                        fragment.appendChild(span);
                        wordSpans.push(span);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                if (node.parentNode) node.parentNode.replaceChild(fragment, node);
            });

            const wordOffsets = new Array(wordSpans.length);
            let offset = 0;
            for (let i = 0; i < wordSpans.length; i++) {
                wordOffsets[i] = offset;
                offset += wordSpans[i].textContent.length + 1;
            }

            const data = { element: paraElement, originalHTML, wordSpans, wordOffsets };
            this.prewrappedParagraphs.set(paraElement, data);
            return data;
        },

        prewrapNextParagraph(currentIndex) {
            if (!this.continuousReadingActive) return;
            const nextIndex = currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) return;
            const nextElement = this.paragraphsList[nextIndex].element;
            if (!nextElement) return;
            if (!this.shouldHighlightWordsForElement(nextElement)) return;

            const schedule = () => this.prewrapParagraph(nextElement);
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => schedule(), { timeout: this.CONFIG.PREWRAP_IDLE_TIMEOUT_MS });
            } else {
                setTimeout(schedule, 0);
            }
        },

        prunePrewrappedParagraphs() {
            if (this.prewrappedParagraphs.size === 0) return;
            const validElements = new Set(this.paragraphsList.map(p => p.element));
            for (const [element, data] of this.prewrappedParagraphs.entries()) {
                const isValid = element && element.isConnected && validElements.has(element);
                if (!isValid) {
                    if (element && element.isConnected && data.originalHTML) {
                        element.innerHTML = data.originalHTML;
                    }
                    this.prewrappedParagraphs.delete(element);
                }
            }
        },

        clearPrewrappedParagraphs() {
            if (this.prewrappedParagraphs.size === 0) return;
            for (const [element, data] of this.prewrappedParagraphs.entries()) {
                if (element && element.isConnected && data.originalHTML) {
                    element.innerHTML = data.originalHTML;
                }
            }
            this.prewrappedParagraphs.clear();
        },

        deferProcessedParagraphRevert() {
            const { element, originalHTML } = this.processedParagraph;
            if (element && originalHTML) {
                this.pendingReverts.push({ element, originalHTML });
                this.schedulePendingRevert();
            }
            this.processedParagraph = { element: null, originalHTML: '', wordSpans: [], wordOffsets: [] };
            this.currentWordSpan = null;
        },

        schedulePendingRevert() {
            if (this.pendingRevertId) return;
            const run = () => {
                this.pendingRevertId = null;
                this.pendingRevertUsesIdle = false;
                if (this.pendingReverts.length === 0) return;
                const next = this.pendingReverts.shift();
                if (next && next.element && next.element.isConnected && next.originalHTML) {
                    next.element.innerHTML = next.originalHTML;
                }
                if (this.pendingReverts.length > 0) {
                    this.schedulePendingRevert();
                }
            };

            if ('requestIdleCallback' in window) {
                this.pendingRevertUsesIdle = true;
                this.pendingRevertId = requestIdleCallback(run, { timeout: this.CONFIG.DEFERRED_REVERT_IDLE_MS });
            } else {
                this.pendingRevertUsesIdle = false;
                this.pendingRevertId = setTimeout(run, this.CONFIG.DEFERRED_REVERT_IDLE_MS);
            }
        },

        cancelPendingRevert() {
            if (!this.pendingRevertId) return;
            if (this.pendingRevertUsesIdle && 'cancelIdleCallback' in window) {
                cancelIdleCallback(this.pendingRevertId);
            } else {
                clearTimeout(this.pendingRevertId);
            }
            this.pendingRevertId = null;
            this.pendingRevertUsesIdle = false;
        },

        flushPendingReverts() {
            this.cancelPendingRevert();
            while (this.pendingReverts.length > 0) {
                const next = this.pendingReverts.shift();
                if (next && next.element && next.element.isConnected && next.originalHTML) {
                    next.element.innerHTML = next.originalHTML;
                }
            }
        },

        updateDiagnosticsPanel() {
            if (!this.diagnosticsPanel) return;
            const gap = this.lastGapMs === null ? '--' : Math.round(this.lastGapMs);
            const wrap = this.lastWrapMs === null ? '--' : Math.round(this.lastWrapMs);
            this.diagnosticsPanel.textContent = `gap: ${gap} ms | wrap: ${wrap} ms`;
        },

        updateProgressPanel(forceHide = false) {
            if (!this.progressPanel) return;
            if (forceHide || (!this.ttsActive && !this.continuousReadingActive) || this.currentParagraphIndex < 0) {
                this.progressPanel.style.opacity = '0';
                return;
            }
            const total = this.paragraphsList.length;
            const current = this.currentParagraphIndex >= 0 ? this.currentParagraphIndex + 1 : 0;
            this.progressPanel.textContent = `Reading ${current}/${total}`;
            this.progressPanel.style.opacity = '1';
        },

        initAutoReadObserver() {
            if (this.autoReadObserver) return;
            this.autoReadObserver = new MutationObserver((mutations) => {
                if (!this.CONFIG.AUTO_READ_NEW_MESSAGES) return;
                if (this.continuousReadingActive || this.ttsActive || this.isNavigating || this.navKeyHeld) return;

                const now = Date.now();
                const touchedMessages = new Set();
                let shouldTrigger = false;
                for (const mutation of mutations) {
                    if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
                    const targetElement = mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE
                        ? mutation.target
                        : mutation.target && mutation.target.parentElement;
                    const targetMessage = targetElement ? targetElement.closest('[data-message-author-role="assistant"]') : null;
                    if (targetMessage) {
                        touchedMessages.add(targetMessage);
                    }
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const parentElement = node.parentElement;
                            const messageElement = parentElement ? parentElement.closest('[data-message-author-role="assistant"]') : null;
                            if (this.isAutoReadEligibleMessage(messageElement)) {
                                shouldTrigger = true;
                                break;
                            }
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            const messageElement = element.matches && element.matches('[data-message-author-role="assistant"]')
                                ? element
                                : element.querySelector && element.querySelector('[data-message-author-role="assistant"]');
                            if (this.isAutoReadEligibleMessage(messageElement)) {
                                shouldTrigger = true;
                                break;
                            }
                        }
                    }
                    if (shouldTrigger) break;
                }

                if (touchedMessages.size > 0) {
                    for (const messageElement of touchedMessages) {
                        this.autoReadMessageActivity.set(messageElement, now);
                    }
                }

                if (shouldTrigger) {
                    this.scheduleAutoRead();
                }
            });

            this.autoReadObserver.observe(document.body, { childList: true, subtree: true });
        },

        scheduleAutoRead() {
            if (!this.CONFIG.AUTO_READ_NEW_MESSAGES) return;
            clearTimeout(this.autoReadDebounceId);
            this.autoReadDebounceId = setTimeout(() => {
                this.autoReadDebounceId = null;
                this.startAutoReadFromLatestAssistant();
            }, 120);
        },

        getLatestAssistantMessageElement() {
            const messages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
            if (messages.length === 0) return null;
            return messages[messages.length - 1];
        },

        getAssistantParagraphs(messageElement) {
            if (!messageElement) return [];
            return this.paragraphsList.filter(p => messageElement.contains(p.element));
        },

        isAutoReadEligibleMessage(messageElement) {
            if (!messageElement) return false;
            if (messageElement.getAttribute('data-message-author-role') !== 'assistant') return false;
            const messageType = (messageElement.getAttribute('data-message-type') || '').toLowerCase();
            if (messageType && /thinking|analysis|tool|status/.test(messageType)) return false;
            const label = (messageElement.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('thinking')) return false;
            const text = (messageElement.textContent || '').trim();
            if (!text) return false;
            if (/^(thinking|analyzing|searching)\b/i.test(text)) return false;
            return true;
        },

        startAutoReadFromLatestAssistant() {
            if (!this.CONFIG.AUTO_READ_NEW_MESSAGES) return;
            if (this.continuousReadingActive || this.ttsActive || this.isNavigating || this.navKeyHeld) return;

            this.refreshParagraphsIfNeeded(true);
            const messageElement = this.getLatestAssistantMessageElement();
            if (!this.isAutoReadEligibleMessage(messageElement)) return;
            if (this.lastAutoReadMessageElement === messageElement) return;
            const now = Date.now();
            if (this.lastAutoReadTriggeredAt && now - this.lastAutoReadTriggeredAt < this.CONFIG.AUTO_READ_COOLDOWN_MS) return;
            const lastMutationAt = this.autoReadMessageActivity.get(messageElement);
            if (lastMutationAt && now - lastMutationAt < this.CONFIG.AUTO_READ_STABLE_MS) {
                this.scheduleAutoRead();
                return;
            }
            const messageParagraphs = this.getAssistantParagraphs(messageElement);
            if (messageParagraphs.length < this.CONFIG.AUTO_READ_MIN_PARAGRAPHS) {
                this.scheduleAutoRead();
                return;
            }

            const startIndex = this.paragraphsList.findIndex(p => messageElement.contains(p.element));
            if (startIndex === -1) return;

            this.lastAutoReadMessageElement = messageElement;
            this.lastAutoReadTriggeredAt = now;
            this.continuousReadingActive = true;
            this.readFromParagraph(startIndex);
        },

        waitForMoreParagraphs(nextIndex) {
            if (!this.continuousReadingActive) return;
            this.waitingForMoreContent = true;
            this.waitForMoreSince = Date.now();
            this.waitForMoreNextIndex = nextIndex;
            this.scheduleWaitForMore();
        },

        scheduleWaitForMore() {
            clearTimeout(this.waitForMoreTimeoutId);
            this.waitForMoreTimeoutId = setTimeout(() => {
                this.waitForMoreTimeoutId = null;
                this.checkForMoreParagraphs();
            }, this.CONFIG.WAIT_RETRY_MS);
        },

        checkForMoreParagraphs() {
            if (!this.waitingForMoreContent || !this.continuousReadingActive) return;
            const now = Date.now();
            const waitLimit = this.CONFIG.LOOP_ON_END ? this.CONFIG.LOOP_WAIT_MS : this.CONFIG.WAIT_FOR_MORE_MS;
            if (now - this.waitForMoreSince > waitLimit) {
                this.waitingForMoreContent = false;
                this.waitForMoreNextIndex = -1;
                if (this.CONFIG.LOOP_ON_END) {
                    this.loopToTop();
                    return;
                }
                this.stopTTS(false);
                this.showNotification('End of page.');
                return;
            }

            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }

            if (this.waitForMoreNextIndex >= 0 && this.waitForMoreNextIndex < this.paragraphsList.length) {
                const nextIndex = this.waitForMoreNextIndex;
                this.waitingForMoreContent = false;
                this.waitForMoreNextIndex = -1;
                this.readFromParagraph(nextIndex);
                return;
            }

            this.scheduleWaitForMore();
        },

        loopToTop() {
            if (!this.continuousReadingActive) return;
            this.waitingForMoreContent = false;
            this.waitForMoreNextIndex = -1;
            clearTimeout(this.waitForMoreTimeoutId);
            this.waitForMoreTimeoutId = null;

            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }
            this.continuousReadingActive = true;
            this.showNotification('Looping to top.');
            this.readFromParagraph(0);
        },

        setWordHighlightEnabled(enabled) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.WORD_HIGHLIGHT_ENABLED === nextValue) return;
            this.CONFIG.WORD_HIGHLIGHT_ENABLED = nextValue;
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                this.clearHighlights(true);
                this.clearPrewrappedParagraphs();
            }
            this.showNotification(`Word highlight ${this.CONFIG.WORD_HIGHLIGHT_ENABLED ? 'on' : 'off'}`);
        },

        setGapTrimEnabled(enabled) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.GAP_TRIM_ENABLED === nextValue) return;
            this.CONFIG.GAP_TRIM_ENABLED = nextValue;
            this.paragraphsDirty = true;
            if (!this.continuousReadingActive) {
                this.refreshParagraphsIfNeeded(true);
            }
            this.showNotification(`Gap trim ${this.CONFIG.GAP_TRIM_ENABLED ? 'on' : 'off'}`);
        },

        setAutoReadEnabled(enabled) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.AUTO_READ_NEW_MESSAGES === nextValue) return;
            this.CONFIG.AUTO_READ_NEW_MESSAGES = nextValue;
            this.showNotification(`Auto-read ${this.CONFIG.AUTO_READ_NEW_MESSAGES ? 'on' : 'off'}`);
            if (this.CONFIG.AUTO_READ_NEW_MESSAGES) {
                this.scheduleAutoRead();
            } else {
                clearTimeout(this.autoReadDebounceId);
                this.autoReadDebounceId = null;
                this.lastAutoReadMessageElement = null;
                this.lastAutoReadTriggeredAt = 0;
            }
        },

        setReadUserMessagesEnabled(enabled) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.READ_USER_MESSAGES === nextValue) return;
            this.CONFIG.READ_USER_MESSAGES = nextValue;
            this.paragraphsDirty = true;
            if (!this.continuousReadingActive) {
                this.refreshParagraphsIfNeeded(true);
            }
            this.showNotification(`User messages ${this.CONFIG.READ_USER_MESSAGES ? 'on' : 'off'}`);
        },

        setSavedHtmlDetectionEnabled(enabled) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.SAVED_HTML_USER_DETECTION === nextValue) return;
            this.CONFIG.SAVED_HTML_USER_DETECTION = nextValue;
            this.paragraphsDirty = true;
            if (!this.continuousReadingActive) {
                this.refreshParagraphsIfNeeded(true);
            }
            this.showNotification(`Saved HTML detection ${this.CONFIG.SAVED_HTML_USER_DETECTION ? 'on' : 'off'}`);
        },

        setLoopEnabled(enabled) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.LOOP_ON_END === nextValue) return;
            this.CONFIG.LOOP_ON_END = nextValue;
            this.showNotification(`Loop ${this.CONFIG.LOOP_ON_END ? 'on' : 'off'}`);
        },

        toggleWordHighlight() {
            this.setWordHighlightEnabled(!this.CONFIG.WORD_HIGHLIGHT_ENABLED);
        },

        findWordIndexByChar(charIndex) {
            const spans = this.processedParagraph.wordSpans;
            const offsets = this.processedParagraph.wordOffsets;
            if (!spans || !offsets || offsets.length === 0) return -1;

            let low = 0;
            let high = offsets.length - 1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (offsets[mid] <= charIndex) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            const idx = high;
            if (idx < 0) return -1;
            const start = offsets[idx];
            const end = start + spans[idx].textContent.length;
            if (charIndex < start || charIndex > end) return -1;
            return idx;
        },

        highlightCurrentWord(event) {
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED || !this.wordHighlightActiveForCurrent) return;
            if (event.name !== 'word') return;

            this.highlightWordByCharIndex(event.charIndex || 0);
        },

        highlightWordByCharIndex(charIndex) {
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED || !this.wordHighlightActiveForCurrent) return;
            if (this.currentWordSpan) {
                this.currentWordSpan.classList.remove('tts-current-word');
                this.currentWordSpan = null;
            }

            const idx = this.findWordIndexByChar(charIndex);
            if (idx === -1) return;
            const span = this.processedParagraph.wordSpans[idx];
            if (!span) return;
            span.classList.add('tts-current-word');
            this.currentWordSpan = span;
        },

        triggerTTS(text, options = {}) {
            const normalizedOptions = typeof options === 'function' ? { onComplete: options } : (options || {});
            const { onComplete = null, speakerEmoji = '' } = normalizedOptions;

            if (!text || text.length === 0) {
                if (onComplete) onComplete();
                return;
            }

            this.ttsActive = true;
            this.isPaused = false;
            const utterance = this.createUtterance(text, speakerEmoji);

            if (this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                utterance.onboundary = (event) => this.highlightCurrentWord(event);
            }

            utterance.onend = () => {
                this.ttsActive = false;
                if (onComplete && this.continuousReadingActive) {
                    onComplete();
                } else {
                    this.stopTTS(false);
                }
            };
            utterance.onerror = (e) => {
                console.error("Speech Synthesis Error:", e);
                this.ttsActive = false;
                this.revertParagraph();
                if (onComplete && this.continuousReadingActive) onComplete();
            };

            this.speechSynthesis.speak(utterance);
        },

        enqueueParagraph(index) {
            if (!this.continuousReadingActive) return;
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }
            if (index < 0 || index >= this.paragraphsList.length) return;
            if (this.queuedParagraphs.has(index)) return;

            const para = this.paragraphsList[index];
            if (!para || !para.element || !para.text) return;

            const utterance = this.createUtterance(para.text, para.speakerEmoji);

            utterance.onstart = () => this.onUtteranceStart(index);
            if (this.CONFIG.WORD_HIGHLIGHT_ENABLED) {
                utterance.onboundary = (event) => this.highlightCurrentWord(event);
            }
            utterance.onend = () => this.onUtteranceEnd(index);
            utterance.onerror = (e) => this.onUtteranceError(index, e);

            this.queuedParagraphs.add(index);
            this.speechSynthesis.speak(utterance);
        },

        queueFromIndex(startIndex) {
            this.queuedParagraphs.clear();
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }
            const maxIndex = Math.min(this.paragraphsList.length - 1, startIndex + this.CONFIG.QUEUE_LOOKAHEAD);
            for (let i = startIndex; i <= maxIndex; i++) {
                this.enqueueParagraph(i);
            }
        },

        onUtteranceStart(index) {
            this.ttsActive = true;
            this.isPaused = false;

            const startTime = performance.now();
            this.lastGapMs = this.lastUtteranceEndTime ? startTime - this.lastUtteranceEndTime : null;

            this.currentParagraphIndex = index;
            const para = this.paragraphsList[index];
            if (!para || !para.element) return;

            this.wordHighlightActiveForCurrent = this.shouldHighlightWordsForElement(para.element);
            this.lastSpokenElement = para.element;
            this.startAutoScroll();
            this.maybeAutoScrollOnStart();

            const wrapStart = performance.now();
            const textToRead = this.prepareParagraphForReading(para.element);
            this.lastWrapMs = performance.now() - wrapStart;
            this.updateDiagnosticsPanel();
            this.updateProgressPanel();
            if (!textToRead) return;

            this.clearHighlights(true);
            para.element.classList.add('tts-current-sentence');
            this.highlightWordByCharIndex(0);

            if (this.pointerLoopId) cancelAnimationFrame(this.pointerLoopId);
            this.updatePointerArrow();
            this.prewrapNextParagraph(index);
            
            // KEY BEHAVIORAL FIX: Fill entire lookahead window immediately when paragraph starts
            if (this.continuousReadingActive) {
                this.fillLookaheadWindow(index);
            }
        },

        onUtteranceEnd(index) {
            this.ttsActive = false;
            this.queuedParagraphs.delete(index);
            this.lastUtteranceEndTime = performance.now();
            this.clearHighlights(true);
            this.deferProcessedParagraphRevert();

            if (!this.continuousReadingActive) return;

            const refreshedIndex = this.refreshParagraphIndex(index);
            const lastIndex = this.paragraphsList.length - 1;
            if (refreshedIndex >= lastIndex) {
                if (!this.isChatGPTPage) {
                    if (this.CONFIG.LOOP_ON_END) {
                        this.loopToTop();
                    } else {
                        this.stopTTS(false);
                        this.showNotification('End of page.');
                    }
                    return;
                }
                const nextIndex = refreshedIndex + 1;
                this.waitForMoreParagraphs(nextIndex);
                return;
            }
        },

        onUtteranceError(index, error) {
            console.error('Speech Synthesis Error:', error);
            this.ttsActive = false;
            this.queuedParagraphs.delete(index);
            this.flushPendingReverts();
            this.revertParagraph();
            if (!this.continuousReadingActive) return;

            const nextIndex = index + 1;
            this.enqueueParagraph(nextIndex);
        },

        prewarmNextUtterance(index) {
            if (!this.continuousReadingActive) return;
            let nextIndex = index + this.CONFIG.QUEUE_LOOKAHEAD + 1;
            if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) {
                if (this.paragraphsDirty) {
                    this.refreshParagraphsIfNeeded(true);
                }
                if (nextIndex < 0 || nextIndex >= this.paragraphsList.length) return;
            }
            this.enqueueParagraph(nextIndex);
        },

        fillLookaheadWindow(currentIndex) {
            if (!this.continuousReadingActive) return;
            if (this.paragraphsDirty) {
                this.refreshParagraphsIfNeeded(true);
            }

            // Top up the lookahead window without clearing pending entries.
            const maxIndex = Math.min(this.paragraphsList.length - 1, currentIndex + this.CONFIG.QUEUE_LOOKAHEAD);
            for (let i = currentIndex + 1; i <= maxIndex; i++) {
                this.enqueueParagraph(i);
            }
        },

        playServerSentence(sentenceText, sentenceIndex, onComplete = null) {
            if (!sentenceText || !this.serverVoiceEnabled) return;
            
            // Check cache first
            const cacheKey = `${sentenceIndex}:${sentenceText.substring(0, 50)}`;
            if (this.serverSentenceCache.has(cacheKey)) {
                const cachedAudio = this.serverSentenceCache.get(cacheKey);
                this.playServerAudio(cachedAudio, sentenceIndex, onComplete);
                return;
            }
            
            // Fetch from server
            this.fetchServerAudio(sentenceText, sentenceIndex, (audioUrl) => {
                if (audioUrl) {
                    // Cache the audio URL
                    if (this.serverSentenceCache.size >= this.CONFIG.SERVER_VOICE_MAX_CACHE_SIZE) {
                        // Remove oldest entry if cache is full
                        const firstKey = this.serverSentenceCache.keys().next().value;
                        this.serverSentenceCache.delete(firstKey);
                    }
                    this.serverSentenceCache.set(cacheKey, audioUrl);
                    
                    // Play the audio
                    this.playServerAudio(audioUrl, sentenceIndex, onComplete);
                    
                    // PROACTIVE FETCHING: Start fetching sentences N+1 and N+2 immediately
                    this.proactiveFetchNextSentences(sentenceIndex);
                } else if (onComplete) {
                    onComplete();
                }
            });
        },

        playServerAudio(audioUrl, sentenceIndex, onComplete) {
            if (this.currentServerAudio) {
                this.currentServerAudio.pause();
                this.currentServerAudio = null;
            }
            
            const audio = new Audio(audioUrl);
            this.currentServerAudio = audio;
            
            audio.onplay = () => {
                this.ttsActive = true;
                this.isPaused = false;
            };
            
            audio.onended = () => {
                this.ttsActive = false;
                this.currentServerAudio = null;
                if (onComplete) onComplete();
            };
            
            audio.onerror = (e) => {
                console.error('Server audio error:', e);
                this.ttsActive = false;
                this.currentServerAudio = null;
                if (onComplete) onComplete();
            };
            
            audio.play().catch(e => {
                console.error('Failed to play server audio:', e);
                if (onComplete) onComplete();
            });
        },

        fetchServerAudio(text, index, callback) {
            // This is a placeholder - implement actual server fetching logic
            // You would make an API call to your TTS server here
            const url = `${this.CONFIG.SERVER_VOICE_URL}?text=${encodeURIComponent(text)}&index=${index}`;
            
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.audioUrl) {
                        callback(data.audioUrl);
                    } else {
                        callback(null);
                    }
                })
                .catch(error => {
                    console.error('Server TTS fetch error:', error);
                    callback(null);
                });
        },

        proactiveFetchNextSentences(currentIndex) {
            if (!this.CONFIG.SERVER_PRECACHE_ENABLED) return;
            
            // Fetch sentences N+1 and N+2 proactively
            for (let offset = 1; offset <= 2; offset++) {
                const nextIndex = currentIndex + offset;
                if (nextIndex < this.paragraphsList.length) {
                    const nextPara = this.paragraphsList[nextIndex];
                    if (nextPara && nextPara.text) {
                        const cacheKey = `${nextIndex}:${nextPara.text.substring(0, 50)}`;
                        if (!this.serverSentenceCache.has(cacheKey)) {
                            // Fetch in background without blocking
                            this.fetchServerAudio(nextPara.text, nextIndex, (audioUrl) => {
                                if (audioUrl) {
                                    if (this.serverSentenceCache.size >= this.CONFIG.SERVER_VOICE_MAX_CACHE_SIZE) {
                                        const firstKey = this.serverSentenceCache.keys().next().value;
                                        this.serverSentenceCache.delete(firstKey);
                                    }
                                    this.serverSentenceCache.set(cacheKey, audioUrl);
                                }
                            });
                        }
                    }
                }
            }
        },

        startServerPlaybackFromParagraph(paragraphIndex) {
            if (!this.serverVoiceEnabled || paragraphIndex < 0 || paragraphIndex >= this.paragraphsList.length) return;
            
            const para = this.paragraphsList[paragraphIndex];
            if (!para || !para.text) return;
            
            // Set current paragraph for highlighting
            this.currentParagraphIndex = paragraphIndex;
            this.lastSpokenElement = para.element;
            this.wordHighlightActiveForCurrent = this.shouldHighlightWordsForElement(para.element);
            
            // Prepare paragraph for reading (word highlighting)
            const textToRead = this.prepareParagraphForReading(para.element);
            if (!textToRead) return;
            
            this.clearHighlights(true);
            para.element.classList.add('tts-current-sentence');
            this.startAutoScroll();
            this.maybeAutoScrollOnStart();
            
            if (this.pointerLoopId) cancelAnimationFrame(this.pointerLoopId);
            this.updatePointerArrow();
            
            // PREFETCH: Fetch first 3 sentences before playback begins
            this.prefetchParagraphSentences(para.text, paragraphIndex, () => {
                // Start playing the first sentence immediately from cache
                this.playFirstSentenceFromCache(textToRead, paragraphIndex);
            });
        },

        prefetchParagraphSentences(paragraphText, paragraphIndex, onComplete) {
            if (!this.CONFIG.SERVER_PRECACHE_ENABLED) {
                onComplete();
                return;
            }
            
            // Split paragraph into sentences (simple split - you may want to improve this)
            const sentences = paragraphText.match(/[^.!?]+[.!?]+/g) || [paragraphText];
            const prefetchCount = Math.min(sentences.length, this.CONFIG.SERVER_VOICE_PREFETCH_SENTENCES);
            
            let pendingFetches = 0;
            const fetchComplete = () => {
                pendingFetches--;
                if (pendingFetches === 0 && onComplete) {
                    onComplete();
                }
            };
            
            // Prefetch first N sentences
            for (let i = 0; i < prefetchCount; i++) {
                const sentence = sentences[i].trim();
                if (!sentence) continue;
                
                const cacheKey = `${paragraphIndex}-${i}:${sentence.substring(0, 50)}`;
                if (!this.serverSentenceCache.has(cacheKey)) {
                    pendingFetches++;
                    this.fetchServerAudio(sentence, `${paragraphIndex}-${i}`, (audioUrl) => {
                        if (audioUrl) {
                            if (this.serverSentenceCache.size >= this.CONFIG.SERVER_VOICE_MAX_CACHE_SIZE) {
                                const firstKey = this.serverSentenceCache.keys().next().value;
                                this.serverSentenceCache.delete(firstKey);
                            }
                            this.serverSentenceCache.set(cacheKey, audioUrl);
                        }
                        fetchComplete();
                    });
                }
            }
            
            // If nothing to fetch, complete immediately
            if (pendingFetches === 0 && onComplete) {
                onComplete();
            }
        },

        playFirstSentenceFromCache(paragraphText, paragraphIndex) {
            const sentences = paragraphText.match(/[^.!?]+[.!?]+/g) || [paragraphText];
            const firstSentence = sentences[0].trim();
            
            if (!firstSentence) return;
            
            const cacheKey = `${paragraphIndex}-0:${firstSentence.substring(0, 50)}`;
            const cachedAudio = this.serverSentenceCache.get(cacheKey);
            
            if (cachedAudio) {
                // Play immediately from cache - no fetch wait
                this.playServerAudio(cachedAudio, `${paragraphIndex}-0`, () => {
                    // Continue with next sentences or move to next paragraph
                    this.continueServerPlayback(paragraphIndex, 1);
                });
            } else {
                // Fallback: fetch and play
                this.playServerSentence(firstSentence, `${paragraphIndex}-0`, () => {
                    this.continueServerPlayback(paragraphIndex, 1);
                });
            }
        },

        continueServerPlayback(paragraphIndex, sentenceIndex) {
            const para = this.paragraphsList[paragraphIndex];
            if (!para || !para.text) return;
            
            const sentences = para.text.match(/[^.!?]+[.!?]+/g) || [para.text];
            
            if (sentenceIndex < sentences.length) {
                // Play next sentence in same paragraph
                const sentence = sentences[sentenceIndex].trim();
                if (sentence) {
                    this.playServerSentence(sentence, `${paragraphIndex}-${sentenceIndex}`, () => {
                        this.continueServerPlayback(paragraphIndex, sentenceIndex + 1);
                    });
                    return;
                }
            }
            
            // Move to next paragraph
            const nextParagraphIndex = paragraphIndex + 1;
            if (nextParagraphIndex < this.paragraphsList.length) {
                this.startServerPlaybackFromParagraph(nextParagraphIndex);
            } else {
                // End of content
                this.stopTTS(false);
                this.showNotification('End of page.');
            }
        },

        readFromParagraph(index) {
            if (!this.continuousReadingActive) {
                this.revertParagraph();
                return;
            }

            if (index < 0 || index >= this.paragraphsList.length) {
                this.stopTTS(false);
                return;
            }

            this.queueFromIndex(index);
        },

        stopTTS(notify = true) {
            this.ttsActive = false;
            this.isPaused = false;
            this.isNavigating = false;
            this.continuousReadingActive = false;
            this.pendingNavIndex = -1;
            this.navKeyHeld = false;
            clearTimeout(this.navigationTimeoutId);
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.speechSynthesis.cancel();
            }
            this.queuedParagraphs.clear();
            this.waitingForMoreContent = false;
            this.waitForMoreNextIndex = -1;
            clearTimeout(this.waitForMoreTimeoutId);
            this.waitForMoreTimeoutId = null;
            this.clearPrewrappedParagraphs();
            this.flushPendingReverts();
            this.revertParagraph();
            this.currentParagraphIndex = -1;
            this.wordHighlightActiveForCurrent = false;
            this.lastUtteranceEndTime = 0;
            this.lastGapMs = null;
            this.lastWrapMs = null;

            // Stop the pointer arrow loop and hide the arrow
            if (this.pointerLoopId) {
                cancelAnimationFrame(this.pointerLoopId);
                this.pointerLoopId = null;
            }
            this.hidePointerArrow();
            this.stopAutoScroll();
            this.updateProgressPanel(true);

            if (notify) this.showNotification('All TTS stopped');
            return true;
        },

        shouldHighlightWordsForElement(element) {
            if (!this.CONFIG.WORD_HIGHLIGHT_ENABLED) return false;
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            return rect.bottom > 0 && rect.top < viewportHeight;
        },

        // ... (pauseResumeTTS, navigate, startReadingOnClick, setupEventListeners are unchanged) ...
        pauseResumeTTS() {
            if (!this.speechSynthesis.speaking && !this.isPaused) return;
            if (this.isPaused) {
                this.speechSynthesis.resume();
                this.isPaused = false;
                this.showNotification('Resumed');
            } else {
                this.speechSynthesis.pause();
                this.isPaused = true;
                this.showNotification('Paused');
            }
        },

        isPlaybackSessionActive() {
            const synth = this.speechSynthesis;
            const synthBusy = Boolean(synth && (synth.speaking || synth.pending || synth.paused));
            return synthBusy ||
                this.ttsActive ||
                this.continuousReadingActive ||
                this.waitingForMoreContent ||
                this.isPaused ||
                this.queuedParagraphs.size > 0;
        },

        clearStalePlaybackFlagsIfIdle() {
            const synth = this.speechSynthesis;
            const synthBusy = Boolean(synth && (synth.speaking || synth.pending || synth.paused));
            if (synthBusy || this.continuousReadingActive || this.waitingForMoreContent || this.queuedParagraphs.size > 0) {
                return false;
            }
            const hadStaleFlags = this.ttsActive || this.isPaused;
            if (hadStaleFlags) {
                this.ttsActive = false;
                this.isPaused = false;
            }
            return hadStaleFlags;
        },

        shouldHandleNavigationHotkeys() {
            return this.isPlaybackSessionActive();
        },

        navigate(direction, options = {}) {
            const previewOnly = options.previewOnly === true;
            if (this.isNavigating) return;
            this.isNavigating = true;
            setTimeout(() => { this.isNavigating = false; }, this.CONFIG.NAV_THROTTLE_MS);

            this.stopTTS(false);

            this.refreshParagraphsIfNeeded(false);
            if (this.paragraphsList.length === 0) return this.showNotification("No readable text found.");

            const currentFocus = document.querySelector('.tts-navigation-focus');
            if(currentFocus) {
                currentFocus.classList.remove('tts-navigation-focus');
                currentFocus.classList.add('tts-focus-fade-out');
                setTimeout(() => currentFocus.classList.remove('tts-focus-fade-out'), this.CONFIG.NAV_FOCUS_FADE_MS);
            }

            let currentIndex = this.currentParagraphIndex;
            if (currentIndex < 0 || currentIndex >= this.paragraphsList.length || (this.lastSpokenElement && this.paragraphsList[currentIndex].element !== this.lastSpokenElement)) {
                currentIndex = this.lastSpokenElement
                    ? this.paragraphsList.findIndex(p => p.element === this.lastSpokenElement)
                    : -1;
            }

            if (currentIndex === -1) {
                const threshold = window.innerHeight * 0.2;
                currentIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
                currentIndex = (currentIndex === -1) ? 0 : currentIndex - 1;
            }

            const newIndex = currentIndex + direction;

            if (newIndex >= 0 && newIndex < this.paragraphsList.length) {
                const targetElement = this.paragraphsList[newIndex].element;
                this.clearHighlights(true);
                targetElement.classList.add('tts-navigation-focus');
                this.gentleScrollToElement(targetElement); // Still useful for navigation highlight
                this.lastSpokenElement = targetElement;

                this.pendingNavIndex = newIndex;
                clearTimeout(this.navigationTimeoutId);
                if (!previewOnly) {
                    this.navigationTimeoutId = setTimeout(() => {
                        if (this.pendingNavIndex === -1) return;
                        this.continuousReadingActive = true;
                        this.readFromParagraph(this.pendingNavIndex);
                    }, this.CONFIG.NAV_FOCUS_HOLD_MS);
                }
            } else {
                 this.showNotification(direction > 0 ? "End of page." : "Start of page.");
            }
        },

        startReadingFromPendingNav() {
            if (this.pendingNavIndex === -1) return;
            clearTimeout(this.navigationTimeoutId);
            this.navigationTimeoutId = setTimeout(() => {
                if (this.pendingNavIndex === -1) return;
                this.continuousReadingActive = true;
                this.readFromParagraph(this.pendingNavIndex);
            }, this.CONFIG.NAV_KEYUP_READ_DELAY_MS);
        },

        startReadingOnClick(event) {
            if (event.target.closest('#thread-bottom-container')) return;

            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            let startParaIndex = -1;

            const containingParagraph = this.paragraphsList.find(p => p.element.contains(event.target));
            if (containingParagraph) {
                startParaIndex = this.paragraphsList.indexOf(containingParagraph);
            } else {
                const clickY = event.clientY;
                for(let i = 0; i < this.paragraphsList.length; i++) {
                    const rect = this.paragraphsList[i].element.getBoundingClientRect();
                    if (rect.top > clickY) {
                        startParaIndex = i;
                        break;
                    }
                }
            }

            if (startParaIndex !== -1) {
                this.continuousReadingActive = true;
                this.readFromParagraph(startParaIndex);
            } else {
                this.showNotification('No readable text found at or below your click.');
            }
        },

        startReadingFromTop() {
            this.stopTTS(false);
            this.refreshParagraphsIfNeeded(true);
            if (this.paragraphsList.length === 0) {
                this.showNotification('No readable text found.');
                return;
            }
            this.continuousReadingActive = true;
            this.readFromParagraph(0);
        },

        startReadingFromSelection() {
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString() : '';
            const selectionData = this.extractTTSMetadata(selectedText);
            const cleaned = selectionData.text.trim();
            if (!cleaned) {
                this.showNotification('No text selected.');
                return;
            }
            this.stopTTS(false);
            this.continuousReadingActive = false;
            this.triggerTTS(cleaned, { speakerEmoji: selectionData.speakerEmoji });
        },

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;

                this.markUserInteraction();
                const key = e.key;
                const shiftOnly = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
                const ctrlShift = e.ctrlKey && e.shiftKey;
                const KEY = this.CONFIG.HOTKEYS;
                const isNavKey = key === KEY.NAV_NEXT || key === KEY.NAV_PREV;

                if (isNavKey && !this.shouldHandleNavigationHotkeys()) {
                    this.navKeyHeld = false;
                    return;
                }

                switch (key) {
                    case KEY.NAV_NEXT:
                        e.preventDefault();
                        this.navKeyHeld = true;
                        this.navigate(1, { previewOnly: true });
                        break;
                    case KEY.NAV_PREV:
                        e.preventDefault();
                        this.navKeyHeld = true;
                        this.navigate(-1, { previewOnly: true });
                        break;
                    case KEY.STOP: e.preventDefault(); this.stopTTS(); break;
                }

                if (shiftOnly && key.toUpperCase() === KEY.ACTIVATE) {
                    e.preventDefault();
                    this.clearStalePlaybackFlagsIfIdle();
                    if (this.isPlaybackSessionActive()) { this.stopTTS(); return; }
                    document.body.style.cursor = 'crosshair';
                    this.showNotification('Click where you want to start reading');

                    const clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.style.cursor = 'default';
                        this.startReadingOnClick(ev);
                    };
                    document.addEventListener('click', clickHandler, { once: true, capture: true });
                } else if (ctrlShift && key.toUpperCase() === KEY.PAUSE_RESUME) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                }
            });
            document.addEventListener('keyup', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;

                const key = e.key;
                const KEY = this.CONFIG.HOTKEYS;
                if (key === KEY.NAV_NEXT || key === KEY.NAV_PREV) {
                    if (!this.navKeyHeld) return;
                    e.preventDefault();
                    this.navKeyHeld = false;
                    this.startReadingFromPendingNav();
                }
            });
            const interactionHandler = () => this.markUserInteraction();
            window.addEventListener('wheel', interactionHandler, { passive: true });
            window.addEventListener('touchstart', interactionHandler, { passive: true });
            window.addEventListener('pointerdown', interactionHandler, { passive: true });
            window.addEventListener('scroll', () => {
                if (!this.autoScrollInProgress) this.markUserInteraction();
            }, { passive: true });
            window.addEventListener('beforeunload', () => this.stopTTS(false));
        },

        // --- UI AND POINTER LOGIC ---

        createUI() {
            document.documentElement.style.setProperty('--tts-focus-fade-ms', `${this.CONFIG.NAV_FOCUS_FADE_MS}ms`);
            const style = document.createElement('style');
            style.textContent = `
                /* ... (highlighting styles are the same) ... */
                .tts-current-sentence { background-color: rgba(46, 204, 113, 0.08) !important; box-shadow: inset 4px 0 0 #2ecc71 !important; transition: background-color 0.3s, box-shadow 0.3s; }
                .tts-current-word { background-color: rgba(250, 210, 50, 0.9) !important; font-weight: bold !important; color: black !important; border-radius: 3px; transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: background-color 0.1s, transform 0.1s; }
                .tts-navigation-focus { background-color: rgba(52, 152, 219, 0.3) !important; box-shadow: inset 4px 0 0 #3498db !important; transition: background-color 0.3s, box-shadow 0.3s; }
                .tts-focus-fade-out { box-shadow: none !important; background-color: transparent !important; transition: background-color var(--tts-focus-fade-ms, 500ms) ease, box-shadow var(--tts-focus-fade-ms, 500ms) ease; }

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
            uiPanel.style.cssText = `position: fixed; top: 80px; left: 10%; width: 280px; max-width: calc(100vw - 24px); padding: 8px; background: rgba(0,0,0,0.7); color: #fff; font-family: Arial, sans-serif; font-size: 13px; border-radius: 6px; cursor: move; z-index: 2147483647; user-select: none; -webkit-user-select: none;`;
            uiPanel.innerHTML = `
                <div style="font-weight:bold; text-align:center; margin-bottom: 5px;">TTS Reader</div>
                
                <label for="tts-speed" style="display:block; margin-bottom:4px;">Speed: <span id="speed-value">${this.CONFIG.SPEECH_RATE.toFixed(1)}</span>x</label>
                <input type="range" id="tts-speed" min="0.5" max="5" step="0.1" value="${this.CONFIG.SPEECH_RATE}" style="width:100%;">
                
                <div style="border-top: 1px solid rgba(255,255,255,0.2); margin-top: 6px; padding-top: 6px;">
                
                <label for="tts-voice-select" style="display:block; margin-bottom:4px;">Voice:</label>
                <select id="tts-voice-select" style="width:100%; margin-bottom:6px; background: rgba(0,0,0,0.8); color: #fff; border: none; padding: 2px;">
                    <option value="">Default</option>
                </select>

                <label style="display:block; margin-bottom:4px;">Emoji voices:</label>
                <div id="tts-emoji-voice-list" style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px;"></div>
                <button id="tts-add-emoji-voice" type="button" style="width:100%; margin-bottom:6px; padding:4px 8px; background: rgba(255,255,255,0.14); border: none; color: #fff; cursor: pointer; border-radius: 3px;">Add emoji voice rule</button>
                <div style="font-size:11px; opacity:0.8; margin-bottom:6px;">Match the leading emoji in a line, for example <span style="white-space:nowrap;">👨‍⚕️</span> or <span style="white-space:nowrap;">🧑</span>.</div>
                
                <div style="display:flex; gap:10px; margin-bottom:6px;">
                    <button id="tts-preset-casual" style="flex:1; padding:4px 8px; background: rgba(255,255,255,0.2); border: none; color: #fff; cursor: pointer; border-radius: 3px;">Casual</button>
                    <button id="tts-preset-learning" style="flex:1; padding:4px 8px; background: rgba(255,255,255,0.2); border: none; color: #fff; cursor: pointer; border-radius: 3px;">Learning</button>
                    <button id="tts-preset-news" style="flex:1; padding:4px 8px; background: rgba(255,255,255,0.2); border: none; color: #fff; cursor: pointer; border-radius: 3px;">News</button>
                </div>
                
                <label for="tts-reading-mode" style="display:block; margin-bottom:4px;">Reading mode:</label>
                <select id="tts-reading-mode" style="width:100%; margin-bottom:6px; background: rgba(0,0,0,0.8); color: #fff; border: none; padding: 2px;">
                    <option value="sentence">Sentence</option>
                    <option value="paragraph">Paragraph</option>
                    <option value="continuous">Continuous</option>
                </select>
                
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label for="tts-highlight-toggle" style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="tts-highlight-toggle" ${this.CONFIG.WORD_HIGHLIGHT_ENABLED ? 'checked' : ''} style="margin:0;">Word highlight</label>
                    <label for="tts-gap-trim-toggle" style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="tts-gap-trim-toggle" ${this.CONFIG.GAP_TRIM_ENABLED ? 'checked' : ''} style="margin:0;">Gap trim</label>
                    <label for="tts-read-user-toggle" style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="tts-read-user-toggle" ${this.CONFIG.READ_USER_MESSAGES ? 'checked' : ''} style="margin:0;">Read user msgs</label>
                    <label for="tts-saved-html-detection-toggle" style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="tts-saved-html-detection-toggle" ${this.CONFIG.SAVED_HTML_USER_DETECTION ? 'checked' : ''} style="margin:0;">Saved HTML detection</label>
                    <label for="tts-auto-read-toggle" style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="tts-auto-read-toggle" ${this.CONFIG.AUTO_READ_NEW_MESSAGES ? 'checked' : ''} style="margin:0;">Auto-read new</label>
                    <label for="tts-loop-toggle" style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="tts-loop-toggle" ${this.CONFIG.LOOP_ON_END ? 'checked' : ''} style="margin:0;">Loop to top</label>
                </div>
            `;
            document.body.appendChild(uiPanel);
            
            // Populate voice selection after voices are loaded
            this.loadVoices().then(() => {
                this.syncVoiceSettingsUI();
            });
            
            const speedInput = document.getElementById('tts-speed');
            speedInput.addEventListener('input', e => {
                this.CONFIG.SPEECH_RATE = parseFloat(e.target.value);
                this.CONFIG.VOICE_PREFERENCES.rate = this.CONFIG.SPEECH_RATE;
                document.getElementById('speed-value').textContent = this.CONFIG.SPEECH_RATE.toFixed(1);
            });
            speedInput.addEventListener('change', () => this.saveVoicePreferences());
            speedInput.addEventListener('mousedown', e => e.stopPropagation());
            
            // Voice selection and presets
            const voiceSelect = document.getElementById('tts-voice-select');
            voiceSelect.addEventListener('change', e => {
                this.setVoice(e.target.value);
            });
            voiceSelect.addEventListener('mousedown', e => e.stopPropagation());

            const addEmojiVoiceButton = document.getElementById('tts-add-emoji-voice');
            addEmojiVoiceButton.addEventListener('click', () => this.addEmojiVoiceMapping());
            addEmojiVoiceButton.addEventListener('mousedown', e => e.stopPropagation());
            
            // Preset buttons
            const casualPreset = document.getElementById('tts-preset-casual');
            casualPreset.addEventListener('click', () => this.applyVoicePreset(this.CONFIG.VOICE_PREFERENCES.presets.casual));
            casualPreset.addEventListener('mousedown', e => e.stopPropagation());
            
            const learningPreset = document.getElementById('tts-preset-learning');
            learningPreset.addEventListener('click', () => this.applyVoicePreset(this.CONFIG.VOICE_PREFERENCES.presets.learning));
            learningPreset.addEventListener('mousedown', e => e.stopPropagation());
            
            const newsPreset = document.getElementById('tts-preset-news');
            newsPreset.addEventListener('click', () => this.applyVoicePreset(this.CONFIG.VOICE_PREFERENCES.presets.news));
            newsPreset.addEventListener('mousedown', e => e.stopPropagation());
            
            // Reading mode
            const readingModeSelect = document.getElementById('tts-reading-mode');
            readingModeSelect.addEventListener('change', e => {
                this.setReadingMode(e.target.value);
            });
            readingModeSelect.addEventListener('mousedown', e => e.stopPropagation());
            
            // Original checkboxes
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
            const savedHtmlDetectionToggle = document.getElementById('tts-saved-html-detection-toggle');
            savedHtmlDetectionToggle.addEventListener('change', e => {
                this.setSavedHtmlDetectionEnabled(e.target.checked);
            });
            savedHtmlDetectionToggle.addEventListener('mousedown', e => e.stopPropagation());
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
            this.makeDraggable(uiPanel);

            if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                const diagnostics = document.createElement('div');
                diagnostics.id = 'tts-diagnostics-panel';
                diagnostics.setAttribute('data-tts-ui', 'true');
                diagnostics.setAttribute('aria-hidden', 'true');
                diagnostics.style.cssText = 'position: fixed; right: 12px; bottom: 12px; background: rgba(0,0,0,0.75); color: #fff; padding: 6px 8px; border-radius: 6px; font-family: Arial, sans-serif; font-size: 11px; z-index: 2147483647; pointer-events: none; user-select: none; -webkit-user-select: none;';
                diagnostics.textContent = 'gap: -- ms | wrap: -- ms';
                document.body.appendChild(diagnostics);
                this.diagnosticsPanel = diagnostics;
            }

            const progress = document.createElement('div');
            progress.id = 'tts-progress-panel';
            progress.setAttribute('data-tts-ui', 'true');
            progress.setAttribute('aria-hidden', 'true');
            progress.style.cssText = 'position: fixed; right: 12px; bottom: 44px; background: rgba(0,0,0,0.75); color: #fff; padding: 6px 8px; border-radius: 6px; font-family: Arial, sans-serif; font-size: 11px; z-index: 2147483647; pointer-events: none; user-select: none; -webkit-user-select: none; opacity: 0; transition: opacity 0.2s ease;';
            progress.textContent = 'Reading 0/0';
            document.body.appendChild(progress);
            this.progressPanel = progress;
        },

        // MODIFIED: This function is now mostly disabled for TTS reading.
        gentleScrollToElement(element) {
            if (!element) return;
            const now = Date.now();
            if (now - this.lastScrollTime < this.CONFIG.SCROLL_THROTTLE_MS) return;

            const rect = element.getBoundingClientRect();
            const padding = this.CONFIG.SCROLL_EDGE_PADDING;
            if (rect.top < padding || rect.bottom > window.innerHeight - padding) {
                this.lastScrollTime = now;
                element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        },

        canAutoScrollNow() {
            if (!this.continuousReadingActive || this.isPaused) return false;
            if (this.isNavigating || this.navKeyHeld) return false;
            if (Date.now() < this.userInteractingUntil) return false;
            return true;
        },

        scrollElementToCenter(element) {
            if (!element) return;
            this.autoScrollInProgress = true;
            if (this.autoScrollInProgressId) {
                clearTimeout(this.autoScrollInProgressId);
            }
            this.autoScrollInProgressId = setTimeout(() => {
                this.autoScrollInProgress = false;
                this.autoScrollInProgressId = null;
            }, this.CONFIG.AUTO_SCROLL_SUPPRESS_SCROLL_MS);
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        },

        markUserInteraction() {
            if (this.autoScrollInProgress) return;
            this.userInteractingUntil = Date.now() + this.CONFIG.AUTO_SCROLL_USER_PAUSE_MS;
            this.scheduleAutoScrollResume();
        },

        scheduleAutoScrollResume() {
            if (!this.CONFIG.AUTO_SCROLL_ENABLED) return;
            if (this.autoScrollResumeId) {
                clearTimeout(this.autoScrollResumeId);
            }
            const delay = Math.max(0, this.userInteractingUntil - Date.now());
            this.autoScrollResumeId = setTimeout(() => {
                this.autoScrollResumeId = null;
                if (this.canAutoScrollNow() && this.lastSpokenElement) {
                    this.scrollElementToCenter(this.lastSpokenElement);
                }
            }, delay);
        },

        maybeAutoScrollOnStart() {
            if (!this.CONFIG.AUTO_SCROLL_ENABLED) return;
            if (this.CONFIG.AUTO_SCROLL_MODE !== 'paragraph') return;
            if (this.canAutoScrollNow() && this.lastSpokenElement) {
                this.scrollElementToCenter(this.lastSpokenElement);
            } else {
                this.scheduleAutoScrollResume();
            }
        },

        startAutoScroll() {
            if (!this.CONFIG.AUTO_SCROLL_ENABLED) return;
            if (this.CONFIG.AUTO_SCROLL_MODE !== 'interval') return;
            if (this.autoScrollIntervalId) return;
            this.autoScrollIntervalId = setInterval(() => {
                if (!this.canAutoScrollNow()) return;
                if (this.lastSpokenElement) {
                    this.scrollElementToCenter(this.lastSpokenElement);
                }
            }, this.CONFIG.AUTO_SCROLL_INTERVAL_MS);
        },

        stopAutoScroll() {
            if (this.autoScrollIntervalId) {
                clearInterval(this.autoScrollIntervalId);
                this.autoScrollIntervalId = null;
            }
            if (this.autoScrollResumeId) {
                clearTimeout(this.autoScrollResumeId);
                this.autoScrollResumeId = null;
            }
        },

        // REWRITTEN: New intelligent waypoint arrow logic
        updatePointerArrow() {
            const currentSentence = document.querySelector('.tts-current-sentence');
            const pointer = document.getElementById('tts-pointer');

            // Exit conditions: No sentence, paused, or no pointer element.
            if (!currentSentence || !pointer || this.isPaused || !this.continuousReadingActive) {
                this.hidePointerArrow();
                this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
                return;
            }

            const rect = currentSentence.getBoundingClientRect();
            const viewport = { w: window.innerWidth, h: window.innerHeight };

            // THE CRUCIAL CHECK: If the element is visible on screen, hide the arrow.
            const isVisible = rect.bottom > 0 && rect.top < viewport.h;
            if (isVisible) {
                this.hidePointerArrow();
                this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
                return;
            }

            // --- If we reach here, the element is OFF-SCREEN ---
            pointer.classList.add('visible');

            // 1. Define the center of the screen (our arrow's origin)
            const origin = { x: viewport.w / 2, y: viewport.h / 2 };

            // 2. Define the target (the center of the off-screen element)
            const target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

            // 3. Calculate the angle from origin to target
            const angleDeg = Math.atan2(target.y - origin.y, target.x - origin.x) * (180 / Math.PI) + 90;

            // 4. Position the arrow on a small circle around the screen's center
            const radius = 80; // How far from the center the arrow sits
            const angleRad = (angleDeg - 90) * (Math.PI / 180);
            const pointerPos = {
                x: origin.x + radius * Math.cos(angleRad),
                y: origin.y + radius * Math.sin(angleRad)
            };

            // 5. Apply the position and rotation
            pointer.style.left = `${pointerPos.x}px`;
            pointer.style.top = `${pointerPos.y}px`;
            pointer.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;

            this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
        },

        // Helper to hide the single arrow
        hidePointerArrow() {
            const pointer = document.getElementById('tts-pointer');
            if (pointer) {
                pointer.classList.remove('visible');
            }
        },

        // ... (showNotification and makeDraggable are unchanged) ...
        showNotification(message) {
            let existing = document.getElementById('tts-notification-popup');
            if(existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = 'tts-notification-popup';
            notification.setAttribute('data-tts-ui', 'true');
            notification.setAttribute('aria-hidden', 'true');
            notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #333; color: white; padding: 10px 20px; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px; z-index: 2147483647; opacity: 0; transition: opacity 0.3s; user-select: none; -webkit-user-select: none;`;
            notification.textContent = message;
            document.body.appendChild(notification);
            setTimeout(() => { notification.style.opacity = '1'; }, 10);
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
            }, 2500);
        },

        makeDraggable(el) {
            let isDown = false, startX, startY, origLeft, origTop;
            el.addEventListener('mousedown', e => {
                if(e.target.tagName === 'INPUT') return;
                isDown = true;
                startX = e.clientX;
                startY = e.clientY;
                const style = window.getComputedStyle(el);
                origLeft = parseInt(style.left, 10);
                origTop = parseInt(style.top, 10);
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!isDown) return;
                el.style.left = (origLeft + e.clientX - startX) + 'px';
                el.style.top = (origTop + e.clientY - startY) + 'px';
            });
            document.addEventListener('mouseup', () => { isDown = false; });
        },
    };

    TTSReader.init();

})();
