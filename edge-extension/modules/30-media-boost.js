(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // =============================================================================
        // SECTION 07: Media Boost
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        boostMediaElement(mediaElement) {
            if (!mediaElement || !this.CONFIG.VOLUME_BOOST_ENABLED) return;
            if (!this.audioContexts.has(mediaElement)) {
                try {
                    const Ctx = window.AudioContext || window.webkitAudioContext;
                    if (!Ctx) return;
                    const ctx = new Ctx();
                    const source = ctx.createMediaElementSource(mediaElement);
                    const gainNode = ctx.createGain();
                    source.connect(gainNode);
                    gainNode.connect(ctx.destination);
                    this.audioContexts.set(mediaElement, { ctx, gainNode });
                } catch (error) {
                    console.warn('Volume boost unavailable for media element:', error);
                    return;
                }
            }

            const audio = this.audioContexts.get(mediaElement);
            if (!audio) return;
            audio.gainNode.gain.value = this.CONFIG.VOLUME_BOOST_LEVEL;
            mediaElement.volume = 1;
            if (audio.ctx.state === 'suspended') {
                audio.ctx.resume().catch(() => {});
            }
        },

        updateVolumeBoostForTrackedMedia() {
            for (const [mediaElement, audio] of this.audioContexts.entries()) {
                if (!mediaElement || !mediaElement.isConnected) {
                    try {
                        if (audio && audio.ctx && typeof audio.ctx.close === 'function') {
                            audio.ctx.close();
                        }
                    } catch (_err) {}
                    this.audioContexts.delete(mediaElement);
                    continue;
                }
                audio.gainNode.gain.value = this.CONFIG.VOLUME_BOOST_ENABLED ? this.CONFIG.VOLUME_BOOST_LEVEL : 1;
            }
        },

        handleMediaElements() {
            const mediaElements = document.querySelectorAll('video, audio');
            mediaElements.forEach((mediaElement) => {
                if (mediaElement.dataset.ttsVolumeBound !== '1') {
                    mediaElement.dataset.ttsVolumeBound = '1';
                    mediaElement.addEventListener('play', () => this.boostMediaElement(mediaElement));
                }
                if (!mediaElement.paused) {
                    this.boostMediaElement(mediaElement);
                }
            });
            this.updateVolumeBoostForTrackedMedia();
        },

        setVolumeBoostEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.VOLUME_BOOST_ENABLED === nextValue) return;
            this.CONFIG.VOLUME_BOOST_ENABLED = nextValue;
            if (nextValue) {
                this.handleMediaElements();
            }
            this.updateVolumeBoostForTrackedMedia();
            if (this.serverAudioGainNode) {
                this.serverAudioGainNode.gain.value = this.getSpeechVolume();
            }
            if (!silent) {
                this.showNotification(`Volume boost ${this.CONFIG.VOLUME_BOOST_ENABLED ? 'on' : 'off'}`);
            }
        },

        setVolumeBoostLevel(level, silent = false) {
            const parsed = Number(level);
            if (!Number.isFinite(parsed)) return;
            const clamped = Math.max(0.1, Math.min(2, parsed));
            this.CONFIG.VOLUME_BOOST_LEVEL = clamped;
            this.updateVolumeBoostForTrackedMedia();
            if (this.serverAudioGainNode) {
                this.serverAudioGainNode.gain.value = this.getSpeechVolume();
            }
            if (!silent) {
                this.showNotification(`Volume boost ${clamped.toFixed(1)}x`);
            }
        },

        setLowGapMode(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.LOW_GAP_MODE === nextValue) return;
            this.CONFIG.LOW_GAP_MODE = nextValue;
            if (!silent) {
                this.showNotification(`Low-gap mode ${nextValue ? 'on' : 'off'}`);
            }
        },

        setServerPrecacheMode(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.SERVER_PRECACHE_MODE === nextValue) return;
            this.CONFIG.SERVER_PRECACHE_MODE = nextValue;
            if (!silent) {
                this.showNotification(`Server precache ${nextValue ? 'on' : 'off'}`);
            }
        },

        setServerTextNormalizationEnabled(enabled, silent = false) {
            const nextValue = Boolean(enabled);
            if (this.CONFIG.SERVER_TEXT_NORMALIZATION_ENABLED === nextValue) return;
            this.CONFIG.SERVER_TEXT_NORMALIZATION_ENABLED = nextValue;
            if (!silent) {
                this.showNotification(`Server text normalize ${nextValue ? 'on' : 'off'}`);
            }
        },

        setServerQuotePolicy(policy, silent = false) {
            const nextPolicy = this.normalizeServerQuotePolicy(policy);
            if (this.CONFIG.SERVER_QUOTE_POLICY === nextPolicy) return;
            this.CONFIG.SERVER_QUOTE_POLICY = nextPolicy;
            if (!silent) {
                this.showNotification(`Server quote policy: ${nextPolicy}`);
            }
        },

        setServerCustomRemovalMode(mode, silent = false) {
            const nextMode = this.normalizeServerCustomRemovalMode(mode);
            if (this.CONFIG.SERVER_CUSTOM_REMOVAL_MODE === nextMode) return;
            this.CONFIG.SERVER_CUSTOM_REMOVAL_MODE = nextMode;
            if (!silent) {
                this.showNotification(`Server removal mode: ${nextMode}`);
            }
        },

        getSpeechVolume() {
            if (!this.CONFIG.VOLUME_BOOST_ENABLED) return 0.9;
            const level = Number(this.CONFIG.VOLUME_BOOST_LEVEL);
            if (!Number.isFinite(level)) return 0.9;
            return Math.max(0.1, Math.min(1, level));
        }
    });
})();
