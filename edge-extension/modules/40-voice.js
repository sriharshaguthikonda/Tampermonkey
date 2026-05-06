(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 08: Voice Resolution
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        loadVoices() {
            return new Promise((resolve) => {
                const voices = this.speechSynthesis.getVoices();
                if (voices.length > 0) resolve(voices);
                else this.speechSynthesis.onvoiceschanged = () => resolve(this.speechSynthesis.getVoices());
            });
        },

        normalizeServerBaseUrl(rawUrl) {
            const input = (typeof rawUrl === 'string' && rawUrl.trim())
                ? rawUrl.trim()
                : this.CONFIG.SERVER_BASE_URL;
            try {
                const parsed = new URL(input);
                const host = (parsed.hostname || '').toLowerCase();
                if (host !== '127.0.0.1' && host !== 'localhost') {
                    return 'http://127.0.0.1:7860';
                }
                const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
                const port = parsed.port ? `:${parsed.port}` : '';
                return `${protocol}//${host}${port}`;
            } catch (_error) {
                return 'http://127.0.0.1:7860';
            }
        },

        isServerVoiceUri(voiceUri) {
            return typeof voiceUri === 'string' && voiceUri.startsWith('server:');
        },

        isAutoVoiceSelected() {
            return !(typeof this.CONFIG.VOICE_URI === 'string' && this.CONFIG.VOICE_URI.trim());
        },

        getServerVoiceIdFromVoiceUri(voiceUri) {
            if (!this.isServerVoiceUri(voiceUri)) return '';
            const voiceId = voiceUri.slice('server:'.length);
            return typeof voiceId === 'string' ? voiceId.trim() : '';
        },

        normalizeVoiceCandidateText(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/[_-]+/g, ' ')
                .trim();
        },

        isAvaVoiceCandidate(voice) {
            if (!voice) return false;
            const name = this.normalizeVoiceCandidateText(voice.name);
            const id = this.normalizeVoiceCandidateText(voice.id);
            const combined = `${name} ${id}`.trim();
            return /\bava\b/.test(combined);
        },

        isMultilingualVoiceCandidate(voice) {
            if (!voice) return false;
            const lang = this.normalizeVoiceCandidateText(voice.lang);
            const name = this.normalizeVoiceCandidateText(voice.name);
            const id = this.normalizeVoiceCandidateText(voice.id);
            const combined = `${lang} ${name} ${id}`.trim();
            return /multi\s*lingual/.test(combined);
        },

        isEnglishUsVoiceCandidate(voice) {
            if (!voice) return false;
            const lang = this.normalizeVoiceCandidateText(voice.lang);
            const name = this.normalizeVoiceCandidateText(voice.name);
            const id = this.normalizeVoiceCandidateText(voice.id);
            if (/^en\s*us\b/.test(lang) || /^en\s*usa\b/.test(lang)) {
                return true;
            }
            const combined = `${name} ${id}`.trim();
            return /english/.test(combined) && /(united states|\bus\b)/.test(combined);
        },

        findAutoPreferredServerVoice() {
            const serverVoices = Array.isArray(this.serverVoices) ? this.serverVoices : [];
            if (serverVoices.length === 0) return null;
            const matches = serverVoices.filter((voice) =>
                this.isAvaVoiceCandidate(voice)
                && this.isEnglishUsVoiceCandidate(voice)
                && !this.isMultilingualVoiceCandidate(voice)
            );
            return matches[0] || null;
        },

        findAutoPreferredBrowserAvaVoice(voices = null) {
            const availableVoices = Array.isArray(voices) ? voices : this.getAvailableBrowserVoices();
            if (!availableVoices || availableVoices.length === 0) return null;
            const avaVoices = availableVoices.filter((voice) =>
                this.isAvaVoiceCandidate(voice)
                && this.isEnglishUsVoiceCandidate(voice)
                && !this.isMultilingualVoiceCandidate(voice)
            );
            if (avaVoices.length === 0) return null;
            return avaVoices.find((voice) => !this.isLikelyUnstableVoice(voice))
                || avaVoices[0];
        },

        getSelectedServerVoiceId() {
            const configuredVoiceId = this.getServerVoiceIdFromVoiceUri(this.CONFIG.VOICE_URI);
            if (configuredVoiceId) {
                return configuredVoiceId;
            }
            if (!this.isAutoVoiceSelected()) {
                return '';
            }
            const autoServerVoice = this.findAutoPreferredServerVoice();
            if (!autoServerVoice) return '';
            return this.getServerVoiceIdFromVoiceUri(autoServerVoice.voiceURI)
                || (typeof autoServerVoice.id === 'string' ? autoServerVoice.id.trim() : '');
        },

        isServerVoiceSelected() {
            return Boolean(this.getSelectedServerVoiceId());
        },

        sendRuntimeMessageAsync(message) {
            return new Promise((resolve, reject) => {
                this.sendRuntimeMessage(message, (response, error) => {
                    if (error) {
                        reject(new Error(error));
                        return;
                    }
                    resolve(response);
                });
            });
        },

        async fetchServerVoices(force = false) {
            const now = Date.now();
            if (!force && this.serverVoices.length > 0 && (now - this.serverVoicesFetchedAt) < 30000) {
                return this.serverVoices;
            }
            if (this.serverVoicesFetchPromise) {
                return this.serverVoicesFetchPromise;
            }

            const baseUrl = this.normalizeServerBaseUrl(this.CONFIG.SERVER_BASE_URL);
            this.serverVoicesFetchPromise = this.sendRuntimeMessageAsync({
                action: 'getServerVoices',
                baseUrl
            }).then((response) => {
                const voices = response && Array.isArray(response.voices) ? response.voices : [];
                this.serverVoices = voices;
                this.serverVoicesFetchedAt = Date.now();
                return this.serverVoices;
            }).catch((error) => {
                this.logPlaybackGuardEvent('server-voices-fetch-failed', {
                    error: error ? String(error.message || error) : 'unknown'
                });
                this.serverVoices = [];
                this.serverVoicesFetchedAt = Date.now();
                return [];
            }).finally(() => {
                this.serverVoicesFetchPromise = null;
            });

            return this.serverVoicesFetchPromise;
        },

        getAvailableVoices() {
            const browserVoices = this.speechSynthesis.getVoices().map((voice) => ({
                name: voice.name,
                lang: voice.lang,
                default: Boolean(voice.default),
                voiceURI: voice.voiceURI,
                source: 'browser'
            }));
            const serverVoices = Array.isArray(this.serverVoices) ? this.serverVoices : [];
            return [...browserVoices, ...serverVoices];
        },

        getAvailableBrowserVoices() {
            return this.speechSynthesis.getVoices();
        },

        isLikelyUnstableVoice(voice) {
            if (!voice) return false;
            const name = (voice.name || '').toLowerCase();
            if (!name) return false;
            if (/zira|david|mark|hazel|susan|desktop/.test(name)) return true;
            if (name.includes('microsoft') && !name.includes('natural') && !name.includes('neural')) return true;
            return false;
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

                const voiceUri = typeof mapping?.voiceUri === 'string' ? mapping.voiceUri.trim() : '';
                normalizedMappings.push({ emoji, voiceUri });
            }

            return normalizedMappings;
        },

        setEmojiVoiceMappings(mappings, silent = false) {
            this.CONFIG.EMOJI_VOICE_MAPPINGS = this.normalizeEmojiVoiceMappings(mappings);
            if (!silent) {
                this.showNotification('Emoji voice rules updated');
            }
        },

        getVoiceUriForSpeakerEmoji(speakerEmoji) {
            const normalizedEmoji = this.normalizeEmojiRuleValue(speakerEmoji);
            if (!normalizedEmoji) return '';

            const mapping = (this.CONFIG.EMOJI_VOICE_MAPPINGS || []).find(entry =>
                this.normalizeEmojiRuleValue(entry?.emoji) === normalizedEmoji
            );
            if (!mapping || typeof mapping.voiceUri !== 'string') return '';
            if (this.isServerVoiceUri(mapping.voiceUri)) return '';
            return mapping.voiceUri.trim();
        },

        hasEmojiVoiceRule(speakerEmoji = '') {
            const normalizedEmoji = this.normalizeEmojiRuleValue(speakerEmoji);
            if (!normalizedEmoji) return false;
            return Boolean((this.CONFIG.EMOJI_VOICE_MAPPINGS || []).find((entry) =>
                this.normalizeEmojiRuleValue(entry?.emoji) === normalizedEmoji
            ));
        },

        shouldUseEmojiVoiceRoutingForParagraph(para) {
            if (!para) return false;
            if (Array.isArray(para.speechUnits) && para.speechUnits.some((unit) => this.hasEmojiVoiceRule(unit.speakerEmoji))) {
                return true;
            }
            return this.hasEmojiVoiceRule(para.speakerEmoji);
        },

        resolvePreferredVoice(speakerEmoji = '', options = {}) {
            const { forceBrowser = false } = options;
            if (this.isServerVoiceSelected() && !forceBrowser) return null;
            const voices = this.getAvailableBrowserVoices();
            if (!voices || voices.length === 0) return null;

            const mappedVoiceUri = this.getVoiceUriForSpeakerEmoji(speakerEmoji);
            if (mappedVoiceUri) {
                const mappedVoice = voices.find(v => v.voiceURI === mappedVoiceUri);
                if (mappedVoice && !this.isLikelyUnstableVoice(mappedVoice)) return mappedVoice;
                if (mappedVoice) return mappedVoice;
            }

            const selectedBrowserVoiceUri = this.isServerVoiceUri(this.CONFIG.VOICE_URI)
                ? ''
                : this.CONFIG.VOICE_URI;
            if (selectedBrowserVoiceUri) {
                const selected = voices.find(v => v.voiceURI === selectedBrowserVoiceUri);
                if (selected && !this.isLikelyUnstableVoice(selected)) return selected;
                if (selected) return selected;
            }

            if (this.isAutoVoiceSelected()) {
                const autoBrowserAvaVoice = this.findAutoPreferredBrowserAvaVoice(voices);
                if (autoBrowserAvaVoice) return autoBrowserAvaVoice;
            }

            return voices.find(v => /natural|neural/i.test(v.name))
                || voices.find(v => /ava/i.test(v.name || '') && !/multilingual/i.test(v.name || ''))
                || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en') && !this.isLikelyUnstableVoice(v))
                || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'))
                || voices[0];
        },

        getSafeSpeechRate(preferredVoice = null) {
            const configuredRate = Number(this.CONFIG.SPEECH_RATE);
            if (!Number.isFinite(configuredRate)) return 1;
            const cap = Math.max(0.5, Number(this.CONFIG.UNSTABLE_VOICE_RATE_CAP) || 1.6);
            if (configuredRate <= cap) return configuredRate;
            if (!this.isLikelyUnstableVoice(preferredVoice)) return configuredRate;
            this.logPlaybackGuardEvent('rate-capped', {
                configuredRate,
                cappedRate: cap,
                voiceName: preferredVoice ? preferredVoice.name : null
            });
            return cap;
        },

        // =============================================================================
    });
})();
