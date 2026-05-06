(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }
    const TTSReader = ns.TTSReader;

    // =============================================================================
    // SECTION 22: Bottom-Level Bootstrap
    // -----------------------------------------------------------------------------
    // (See refactor_plan.md section B.1 for the canonical section list.)
    // =============================================================================

    function getPlaybackState() {
        if (!TTSReader) return 'unknown';
        if (TTSReader.ttsActive) return 'playing';
        if (TTSReader.isPaused) return 'paused';
        return 'stopped';
    }

    // Bootstrap initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TTSReader.init());
    } else {
        TTSReader.init();
    }

    // Expose global functions for external access if needed
    window.TTSReaderGlobal = {
        getPlaybackState,
        TTSReader
    };
})();
