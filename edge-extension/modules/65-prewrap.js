(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 13: Prewrap & Revert
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        createEmptyProcessedParagraph() {
            return { element: null, originalHTML: '', wordSpans: [], wordRanges: [], wordOffsets: [], wordLengths: [], wordTexts: [], usesCssHighlights: false };
        },

        revertParagraph() {
            const { element, wordSpans, usesCssHighlights } = this.processedParagraph;
            if (!usesCssHighlights) {
                this.unwrapWordSpans(element, wordSpans);
            }
            this.processedParagraph = this.createEmptyProcessedParagraph();
            this.clearHighlights();
        },

        buildCssWordHighlightData(paraElement) {
            if (!paraElement || !paraElement.isConnected) return null;
            const wordRanges = [];
            const wordOffsets = [];
            const wordLengths = [];
            const wordTexts = [];
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];
            while (walker.nextNode()) {
                if ((walker.currentNode.textContent || '').trim().length > 0) nodesToProcess.push(walker.currentNode);
            }

            let offset = 0;
            for (const node of nodesToProcess) {
                const source = String(node.textContent || '');
                const regex = /\S+/g;
                let match;
                while ((match = regex.exec(source)) !== null) {
                    const cleanedWord = this.cleanTextForTTS(match[0]).trim();
                    if (!cleanedWord) continue;
                    const range = document.createRange();
                    range.setStart(node, match.index);
                    range.setEnd(node, match.index + match[0].length);
                    wordRanges.push(range);
                    wordOffsets.push(offset);
                    wordLengths.push(cleanedWord.length);
                    wordTexts.push(cleanedWord);
                    offset += cleanedWord.length + 1;
                }
            }

            return {
                element: paraElement,
                originalHTML: '',
                wordSpans: [],
                wordRanges,
                wordOffsets,
                wordLengths,
                wordTexts,
                usesCssHighlights: true,
                text: wordTexts.join(' ')
            };
        },

        buildSpanWordHighlightData(paraElement) {
            if (!paraElement || !paraElement.isConnected) return null;
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
                        span.setAttribute('data-tts-word', '1');
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
            const wordLengths = new Array(wordSpans.length);
            const wordTexts = new Array(wordSpans.length);
            let offset = 0;
            for (let i = 0; i < wordSpans.length; i++) {
                const text = wordSpans[i].textContent || '';
                wordOffsets[i] = offset;
                wordLengths[i] = text.length;
                wordTexts[i] = text;
                offset += text.length + 1;
            }

            return {
                element: paraElement,
                originalHTML,
                wordSpans,
                wordRanges: [],
                wordOffsets,
                wordLengths,
                wordTexts,
                usesCssHighlights: false,
                text: wordTexts.join(' ')
            };
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
                this.processedParagraph = cached;
                this.prewrappedParagraphs.delete(paraElement);
                return cached.text || (cached.wordTexts || []).join(' ');
            }

            const data = this.supportsCssTextHighlights()
                ? this.buildCssWordHighlightData(paraElement)
                : this.buildSpanWordHighlightData(paraElement);
            if (!data) return null;
            this.processedParagraph = data;
            return data.text;
        },

        prewrapParagraph(paraElement) {
            if (!paraElement || !paraElement.parentNode) return null;
            if (this.prewrappedParagraphs.has(paraElement)) return this.prewrappedParagraphs.get(paraElement);

            const data = this.supportsCssTextHighlights()
                ? this.buildCssWordHighlightData(paraElement)
                : this.buildSpanWordHighlightData(paraElement);
            if (!data) return null;
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
                    if (!(data && data.usesCssHighlights)) {
                        this.unwrapWordSpans(element, data && data.wordSpans);
                    }
                    this.prewrappedParagraphs.delete(element);
                }
            }
        },

        clearPrewrappedParagraphs() {
            if (this.prewrappedParagraphs.size === 0) return;
            for (const [element, data] of this.prewrappedParagraphs.entries()) {
                if (!(data && data.usesCssHighlights)) {
                    this.unwrapWordSpans(element, data && data.wordSpans);
                }
            }
            this.prewrappedParagraphs.clear();
        },

        deferProcessedParagraphRevert() {
            const { element, originalHTML, wordSpans, usesCssHighlights } = this.processedParagraph;
            if (element) {
                this.pendingReverts.push({ element, originalHTML, wordSpans, usesCssHighlights });
                this.schedulePendingRevert();
            }
            this.processedParagraph = this.createEmptyProcessedParagraph();
            this.currentWordSpan = null;
            this.clearCssWordHighlight();
        },

        schedulePendingRevert() {
            if (this.pendingRevertId) return;
            const run = () => {
                this.pendingRevertId = null;
                this.pendingRevertUsesIdle = false;
                if (this.pendingReverts.length === 0) return;
                const next = this.pendingReverts.shift();
                if (next && next.element && !next.usesCssHighlights) {
                    this.unwrapWordSpans(next.element, next.wordSpans);
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
                if (next && next.element && !next.usesCssHighlights) {
                    this.unwrapWordSpans(next.element, next.wordSpans);
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

        ensureNavigationTrailLayer() {
            if (this.navigationTrailCanvas && this.navigationTrailCanvas.isConnected) return;
            const canvas = document.createElement('canvas');
            canvas.id = 'tts-navigation-trail';
            canvas.setAttribute('data-tts-ui', 'true');
            canvas.setAttribute('aria-hidden', 'true');
            canvas.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 2147483645; pointer-events: none;';
            document.body.appendChild(canvas);
            this.navigationTrailCanvas = canvas;
            this.navigationTrailCtx = canvas.getContext('2d');
            this.resizeNavigationTrailLayer();
        },

        resizeNavigationTrailLayer() {
            const canvas = this.navigationTrailCanvas;
            const ctx = this.navigationTrailCtx;
            if (!canvas || !ctx) return;
            const dpr = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.round(window.innerWidth * dpr));
            const height = Math.max(1, Math.round(window.innerHeight * dpr));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        },

        addNavigationTrailPoint(element) {
            if (!element || !element.isConnected) return;
            this.ensureNavigationTrailLayer();
            const rect = element.getBoundingClientRect();
            const x = Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2));
            const y = Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2));
            this.navigationTrailPoints.push({
                x,
                y,
                createdAt: performance.now()
            });
            const maxPoints = this.CONFIG.NAV_TRAIL_MAX_POINTS;
            if (this.navigationTrailPoints.length > maxPoints) {
                this.navigationTrailPoints.splice(0, this.navigationTrailPoints.length - maxPoints);
            }
            this.renderNavigationTrail(performance.now());
            this.startNavigationTrailAnimation();
        },

        renderNavigationTrail(now = performance.now()) {
            const canvas = this.navigationTrailCanvas;
            const ctx = this.navigationTrailCtx;
            if (!canvas || !ctx) return;

            this.resizeNavigationTrailLayer();

            const fadeMs = this.CONFIG.NAV_TRAIL_FADE_MS;
            this.navigationTrailPoints = this.navigationTrailPoints.filter(point => now - point.createdAt <= fadeMs);

            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            if (this.navigationTrailPoints.length === 0) return;

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let i = 1; i < this.navigationTrailPoints.length; i++) {
                const prev = this.navigationTrailPoints[i - 1];
                const point = this.navigationTrailPoints[i];
                const ageRatio = Math.min(1, (now - point.createdAt) / fadeMs);
                const alpha = 1 - ageRatio;
                ctx.strokeStyle = `rgba(52, 152, 219, ${0.15 + (alpha * 0.45)})`;
                ctx.lineWidth = 2 + (alpha * 2.5);
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(point.x, point.y);
                ctx.stroke();
            }

            this.navigationTrailPoints.forEach((point, index) => {
                const ageRatio = Math.min(1, (now - point.createdAt) / fadeMs);
                const alpha = 1 - ageRatio;
                const isLatest = index === this.navigationTrailPoints.length - 1;
                const radius = (isLatest ? 6 : 4) + (alpha * 2);

                ctx.beginPath();
                ctx.fillStyle = `rgba(52, 152, 219, ${0.2 + (alpha * 0.6)})`;
                ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                ctx.fill();
            });

            const latest = this.navigationTrailPoints[this.navigationTrailPoints.length - 1];
            if (latest) {
                const age = now - latest.createdAt;
                const pulseMs = 360;
                if (age <= pulseMs) {
                    const progress = age / pulseMs;
                    const ringRadius = 12 + (progress * 22);
                    const ringAlpha = 0.45 * (1 - progress);
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(52, 152, 219, ${ringAlpha})`;
                    ctx.lineWidth = 2;
                    ctx.arc(latest.x, latest.y, ringRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        },

        startNavigationTrailAnimation() {
            if (this.navigationTrailAnimationId) return;
            const tick = (now) => {
                this.renderNavigationTrail(now);
                if (this.navigationTrailPoints.length === 0) {
                    this.navigationTrailAnimationId = null;
                    return;
                }
                this.navigationTrailAnimationId = requestAnimationFrame(tick);
            };
            this.navigationTrailAnimationId = requestAnimationFrame(tick);
        },

        // =============================================================================
    });
})();
