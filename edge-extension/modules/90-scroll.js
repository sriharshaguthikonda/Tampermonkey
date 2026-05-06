(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 20: Scroll & Pointer
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

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
        // =============================================================================
    });
})();
