(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // =============================================================================
        // SECTION 15: Server TTS
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        ensureServerAudioGraph() {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            if (!this.serverAudioContext || this.serverAudioContext.state === 'closed') {
                this.serverAudioContext = new AudioCtx({ latencyHint: 'interactive' });
                this.serverAudioGainNode = this.serverAudioContext.createGain();
                this.serverAudioGainNode.connect(this.serverAudioContext.destination);
            }
            if (!this.serverAudioGainNode) {
                this.serverAudioGainNode = this.serverAudioContext.createGain();
                this.serverAudioGainNode.connect(this.serverAudioContext.destination);
            }
            this.serverAudioGainNode.gain.value = this.getSpeechVolume();
            return this.serverAudioContext;
        },

        isServerAudioPlaybackAvailable() {
            return Boolean(this.serverAudioContext && this.serverCurrentSource);
        },

        isServerAudioPlaying() {
            return Boolean(
                this.serverAudioContext &&
                this.serverCurrentSource &&
                this.serverAudioContext.state === 'running'
            );
        },

        isServerAudioPaused() {
            return Boolean(
                this.serverAudioContext &&
                this.serverCurrentSource &&
                this.serverAudioContext.state === 'suspended'
            );
        },

        stopCurrentServerSource() {
            if (!this.serverCurrentSource) return;
            try {
                this.serverCurrentSource.onended = null;
                this.serverCurrentSource.stop();
                this.serverCurrentSource.disconnect();
            } catch (_error) {
                // Ignore races where source already ended.
            }
            this.serverCurrentSource = null;
        },

        cancelScheduledNext() {
            if (!this.scheduledNextSource) return;
            try {
                this.scheduledNextSource.onended = null;
                this.scheduledNextSource.stop();
                this.scheduledNextSource.disconnect();
            } catch (_error) {
                // Ignore races where source already played or stopped.
            }
            this.scheduledNextSource = null;
        },

        async pauseServerAudioPlayback() {
            if (!this.serverAudioContext) return false;
            if (this.serverAudioContext.state !== 'running') return false;
            try {
                await this.serverAudioContext.suspend();
                return true;
            } catch (_error) {
                return false;
            }
        },

        async resumeServerAudioPlayback() {
            if (!this.serverAudioContext) return false;
            if (this.serverAudioContext.state === 'running') return true;
            try {
                await this.serverAudioContext.resume();
                return this.serverAudioContext.state === 'running';
            } catch (_error) {
                return false;
            }
        },

        getMaxSynthBacklog() {
            const configured = Math.max(0, Number(this.CONFIG.MAX_SYNTH_BACKLOG) || 0);
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 2);
        },

        getSpeechChunkMaxChars() {
            const configured = Math.max(80, Number(this.CONFIG.SPEECH_CHUNK_MAX_CHARS) || 220);
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 320);
        },

        getSpeechChunkGapMs() {
            if (this.CONFIG.LOW_GAP_MODE) return 0;
            return Math.max(0, Number(this.CONFIG.SPEECH_CHUNK_GAP_MS) || 0);
        },

        getEffectiveQueueLookahead() {
            const configured = Math.max(0, Math.round(Number(this.CONFIG.QUEUE_LOOKAHEAD) || 0));
            return configured;
        },

        getServerPrecacheWordBudget() {
            const configured = Math.max(10, Math.round(Number(this.CONFIG.SERVER_PRECACHE_WORD_BUDGET) || 100));
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 220);
        },

        getServerPrecacheMaxSentences() {
            const configured = Math.max(1, Math.round(Number(this.CONFIG.SERVER_PRECACHE_MAX_SENTENCES) || 8));
            if (!this.CONFIG.LOW_GAP_MODE) return configured;
            return Math.max(configured, 14);
        },

        getServerHandoffWaitMs() {
            const configured = Math.max(0, Math.round(Number(this.CONFIG.SERVER_HANDOFF_WAIT_MS) || 120));
            return configured;
        },

        getServerTtsSampleRate() {
            return Math.max(8000, Math.min(48000, Math.round(Number(this.CONFIG.SERVER_TTS_SAMPLE_RATE) || 24000)));
        },

        getServerTtsDefaultBaseUrl() {
            const configured = String(this.CONFIG.SERVER_TTS_DEFAULT_BASE_URL || this.CONFIG.SERVER_BASE_URL || '').trim();
            return configured || 'http://127.0.0.1:7860';
        },

        getServerTtsMinSpeed() {
            return Math.max(0.25, Math.min(2.0, Number(this.CONFIG.SERVER_TTS_MIN_SPEED) || 0.5));
        },

        getServerTtsMaxSpeed() {
            return Math.max(0.25, Math.min(4.0, Number(this.CONFIG.SERVER_TTS_MAX_SPEED) || 2.0));
        },

        normalizeServerQuotePolicy(policy) {
            const normalized = String(policy || '').toLowerCase().trim();
            const valid = ['strip', 'quote', 'verbatim'];
            return valid.includes(normalized) ? normalized : 'strip';
        },

        normalizeServerCustomRemovalMode(mode) {
            const normalized = String(mode || '').toLowerCase().trim();
            const valid = ['exact', 'regex'];
            return valid.includes(normalized) ? normalized : 'exact';
        },

        normalizeHiddenTabPolicy(policy) {
            const normalized = String(policy || '').toLowerCase().trim();
            const valid = ['never', 'immediate', 'delay'];
            return valid.includes(normalized) ? normalized : 'delay';
        }
    });
})();
