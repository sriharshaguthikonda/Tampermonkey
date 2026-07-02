(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 09: Paragraph Indexing
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        initParagraphObserver() {
            if (this.paragraphBusUnsubscribe || !ns.observerBus) return;
            this.paragraphBusUnsubscribe = ns.observerBus.subscribe({
                name: 'paragraphs',
                onFlush: () => {
                    this.paragraphsDirty = true;
                    if (this.waitingForMoreContent) {
                        this.scheduleWaitForMore();
                    }
                }
            });
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

        // =============================================================================
    });
})();
