(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    Object.assign(ns.TTSReader, {
        // SECTION 12: Highlight & Word Spans
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        clearHighlights(keepFading = false) {
            const selectors = ['.tts-current-sentence', '.tts-current-word'];
            if (!keepFading) {
                selectors.push('.tts-navigation-focus', '.tts-focus-fade-out');
            }
            document.querySelectorAll(selectors.join(', ')).forEach(el => {
                el.classList.remove(...selectors.map(s => s.substring(1)));
            });
            this.currentWordSpan = null;
            this.clearCssWordHighlight();
            this.clearServerWordHighlightTimers();
        },

        getCssHighlightRegistry() {
            const css = (typeof window !== 'undefined' && window.CSS) || (typeof CSS !== 'undefined' ? CSS : null);
            try {
                return css && css.highlights && typeof css.highlights.set === 'function'
                    ? css.highlights
                    : null;
            } catch (_) {
                return null;
            }
        },

        supportsCssTextHighlights() {
            const HighlightCtor = (typeof window !== 'undefined' && window.Highlight) || (typeof Highlight !== 'undefined' ? Highlight : null);
            return Boolean(this.getCssHighlightRegistry() && typeof HighlightCtor === 'function' && typeof document.createRange === 'function');
        },

        clearCssWordHighlight() {
            const registry = this.getCssHighlightRegistry();
            if (registry && typeof registry.delete === 'function') {
                try {
                    registry.delete('tts-current-word');
                } catch (_) {}
            }
            this.currentWordRange = null;
        },

        isRangeConnected(range) {
            if (!range) return false;
            try {
                const start = range.startContainer;
                const end = range.endContainer;
                if (start && start.isConnected === false) return false;
                if (end && end.isConnected === false) return false;
                return true;
            } catch (_) {
                return false;
            }
        },

        setCssWordHighlightRange(range) {
            if (!this.isRangeConnected(range)) return false;
            const registry = this.getCssHighlightRegistry();
            const HighlightCtor = (typeof window !== 'undefined' && window.Highlight) || (typeof Highlight !== 'undefined' ? Highlight : null);
            if (!registry || typeof HighlightCtor !== 'function') return false;
            try {
                registry.set('tts-current-word', new HighlightCtor(range));
                this.currentWordRange = range;
                return true;
            } catch (_) {
                return false;
            }
        },

        sanitizeHTMLForRestore(html) {
            if (typeof html !== 'string' || !html) return '';
            const tpl = document.createElement('template');
            tpl.innerHTML = html;
            const BAD_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'BASE', 'LINK', 'META']);
            const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc']);
            const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT);
            const toRemove = [];
            while (walker.nextNode()) {
                const el = walker.currentNode;
                if (BAD_TAGS.has(el.tagName)) {
                    toRemove.push(el);
                    continue;
                }
                for (const attr of Array.from(el.attributes)) {
                    const name = attr.name.toLowerCase();
                    const val = attr.value || '';
                    if (name.startsWith('on')) {
                        el.removeAttribute(attr.name);
                    } else if (URL_ATTRS.has(name) && /^\s*(javascript|vbscript):/i.test(val)) {
                        el.removeAttribute(attr.name);
                    }
                }
            }
            for (const el of toRemove) el.remove();
            return tpl.innerHTML;
        },

        unwrapWordSpans(element, wordSpans) {
            if (!element || !element.isConnected) return;
            const targets = (Array.isArray(wordSpans) && wordSpans.length > 0)
                ? wordSpans
                : Array.from(element.querySelectorAll('span[data-tts-word="1"]'));
            for (const span of targets) {
                if (!span || !span.parentNode || !span.isConnected) continue;
                if (span.getAttribute && span.getAttribute('data-tts-word') !== '1') continue;
                const textNode = document.createTextNode(span.textContent || '');
                span.parentNode.replaceChild(textNode, span);
            }
            const stragglers = element.querySelectorAll('span[data-tts-word="1"]');
            for (const span of stragglers) {
                if (!span.parentNode) continue;
                span.parentNode.replaceChild(document.createTextNode(span.textContent || ''), span);
            }
        },

        // =============================================================================
    });
})();
