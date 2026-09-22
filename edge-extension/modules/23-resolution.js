(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    // S3.3 Resolution-model helpers (churn plan R1/D-S3). Every feature module resolves
    // chatgpt.com DOM through driftwatch pack v2 via this module — never a site selector
    // literal. Two hard rules from the Resolution model:
    //   1. Per-exchange anchors (userUnit, assistantUnit, assistantMarkdownRoot,
    //      responseActionBar, codeBlock, copyResponseButton, editMessageButton) are ONLY
    //      resolved with an exchange element as scope (resolveInExchange). Enumerating
    //      them document-wide is a review-reject: document-scoped inside: containment
    //      checks exactly ONE element and silently drops every other exchange.
    //   2. Document singletons (composerForm, composer, sendButton, stopButton,
    //      pendingComposerInput) resolve document-wide; state-conditioned ones
    //      (sendButton/stopButton) must be resolved WITH a state.
    // One dw.use(pack) instance is cached for the document's lifetime — building it per
    // call would re-compile every strategy on each resolve.
    const singleton = { site: null };

    // ponytail: tick-scoped memo — one synchronous scan shares one exchanges() resolve and one
    // resolve per (anchor, exchange); dropped on the next microtask so it can never go stale
    // across tasks. Singletons (composer/send) are NOT memoized: those paths mutate the DOM synchronously.
    let memo = null;
    function tickMemo() {
        if (!memo) {
            memo = { exchanges: null, set: null, one: new Map(), all: new Map() };
            queueMicrotask(() => { memo = null; });
        }
        return memo;
    }

    function resetResolutionMemo() {
        memo = null;
    }

    // D7 pattern: never let a resolution failure escape — missing engine, missing pack,
    // throw inside the engine, all collapse to null so callers fail soft.
    function getChatGptPack() {
        try {
            const dw = window.driftwatch;
            const pack = dw && dw.packs && dw.packs['chatgpt.com'];
            if (!dw || typeof dw.use !== 'function' || !pack) return null;
            return pack;
        } catch (_error) {
            return null;
        }
    }

    function getChatGptSite() {
        if (singleton.site) return singleton.site;
        const dw = window.driftwatch;
        const pack = getChatGptPack();
        if (!dw || !pack) return null;
        try {
            singleton.site = dw.use(pack);
        } catch (_error) {
            singleton.site = null;
        }
        return singleton.site;
    }

    // Document-scoped singleton anchor (composerForm, composer, sendButton, stopButton,
    // pendingComposerInput, exchangeRoot). `state` is required for sendButton/stopButton —
    // pack v2 declares `expected` per state, and a stateless resolve returns
    // unknown-state (null) by design (R3: idle-empty Send absent is correct, not broken).
    function resolveSingleton(anchor, state) {
        const site = getChatGptSite();
        if (!site) return null;
        try {
            const result = site.resolve(anchor, document, state ? { state } : undefined);
            return (result && result.ok && result.el) ? result.el : null;
        } catch (_error) {
            return null;
        }
    }

    // Every exchange on the page, in DOM order — the ONLY document-wide resolution
    // consumers perform for per-exchange concepts (R1 rule 1).
    function exchanges() {
        const cache = tickMemo();
        if (cache.exchanges) return cache.exchanges;
        const site = getChatGptSite();
        let exchangeList = [];
        try {
            const result = site ? site.resolve('exchangeRoot', document) : null;
            if (result && result.ok && Array.isArray(result.els)) exchangeList = result.els;
        } catch (_error) {
            exchangeList = [];
        }
        cache.exchanges = Object.freeze(exchangeList.slice());
        cache.set = new Set(cache.exchanges);
        return cache.exchanges;
    }

    // Per-exchange anchor, resolved with the exchange element as scope. Returns the
    // element or null — never throws, never resolves document-wide.
    function resolveInExchange(anchor, exchangeEl) {
        if (!anchor || !exchangeEl || exchangeEl.nodeType !== 1) return null;
        const cache = tickMemo();
        let anchorMemo = cache.one.get(anchor);
        if (!anchorMemo) {
            anchorMemo = new WeakMap();
            cache.one.set(anchor, anchorMemo);
        }
        if (anchorMemo.has(exchangeEl)) return anchorMemo.get(exchangeEl);
        const site = getChatGptSite();
        let element = null;
        try {
            const result = site ? site.resolve(anchor, exchangeEl) : null;
            element = (result && result.ok && result.el) ? result.el : null;
        } catch (_error) {
            element = null;
        }
        anchorMemo.set(exchangeEl, element);
        return element;
    }

    // Per-exchange anchor as a COLLECTION — resolveInExchange returns one element;
    // features needing every member of a per-exchange anchor (e.g. every codeBlock
    // in an exchange) use this. Same scoping rule, same fail-soft.
    function resolveAllInExchange(anchor, exchangeEl) {
        if (!anchor || !exchangeEl || exchangeEl.nodeType !== 1) return [];
        const cache = tickMemo();
        let anchorMemo = cache.all.get(anchor);
        if (!anchorMemo) {
            anchorMemo = new WeakMap();
            cache.all.set(anchor, anchorMemo);
        }
        if (anchorMemo.has(exchangeEl)) return anchorMemo.get(exchangeEl);
        const site = getChatGptSite();
        let elements = [];
        try {
            const result = site ? site.resolve(anchor, exchangeEl) : null;
            if (result && result.ok && Array.isArray(result.els)) elements = result.els;
        } catch (_error) {
            elements = [];
        }
        const frozen = Object.freeze(elements.slice());
        anchorMemo.set(exchangeEl, frozen);
        return frozen;
    }

    // Pack v2 `data` section lookup (R7): site-specific selector lists (citations,
    // ignore entries, native-selection allowlist, style targets) live in pack DATA,
    // never as literals in feature code. Any failure collapses to [] (D7 fail-soft).
    function packData(key) {
        try {
            const pack = getChatGptPack();
            const entry = pack && pack.data ? pack.data[key] : null;
            return Array.isArray(entry) ? entry.filter((item) => typeof item === 'string' && item) : [];
        } catch (_error) {
            return [];
        }
    }

    // Map an arbitrary node to the exchange element containing it (R1: walk up to
    // the element present in exchanges(), never a hardcoded site attribute).
    function exchangeForElement(node) {
        try {
            if (!node) return null;
            const cache = tickMemo();
            if (!cache.set) {
                exchanges();
            }
            let element = node.nodeType === 1 ? node : (node.parentElement || null);
            while (element) {
                if (cache.set.has(element)) return element;
                element = element.parentElement;
            }
        } catch (_error) {
            // Fail soft when DOM traversal or pack resolution is unavailable.
        }
        return null;
    }

    function exchangeKey(exchangeEl) {
        if (!exchangeEl || exchangeEl.nodeType !== 1 || typeof exchangeEl.getAttribute !== 'function') return null;
        try {
            const pack = getChatGptPack();
            const strategies = pack && pack.anchors && pack.anchors.exchangeRoot
                ? pack.anchors.exchangeRoot.strategies
                : null;
            if (!Array.isArray(strategies)) return null;
            for (const strategy of strategies) {
                if (!strategy || typeof strategy.attr !== 'string' || !strategy.attr) continue;
                const value = exchangeEl.getAttribute(strategy.attr);
                if (typeof value === 'string' && value.trim()) return value;
            }
        } catch (_error) {
            return null;
        }
        return null;
    }

    // Effective ignore selector (00-namespace.js:258 + 55-selection.js:157): the
    // generic/own entries stay in code (CONFIG.IGNORE_SELECTORS); on chatgpt.com the
    // site entries are appended from pack data. The non-ChatGPT override in
    // 10-lifecycle.js rewrites CONFIG.IGNORE_SELECTORS itself and keeps working
    // because this reads CONFIG live on every call.
    function getIgnoreSelectors() {
        const reader = ns.TTSReader;
        const base = reader && reader.CONFIG && typeof reader.CONFIG.IGNORE_SELECTORS === 'string'
            ? reader.CONFIG.IGNORE_SELECTORS
            : '';
        if (!reader || !reader.isChatGPTPage) return base;
        const siteEntries = packData('ignoreSelectors');
        if (siteEntries.length === 0) return base;
        return base ? `${base}, ${siteEntries.join(', ')}` : siteEntries.join(', ');
    }

    // S7.1 page-state classifier for state-aware driftwatch audits (sendButton/
    // stopButton declare per-state expected counts). 'streaming' while the stop
    // control resolves, else 'composing' while the composer holds text, else
    // 'idle' — an empty idle composer legitimately has no Send button (R3).
    // No site selectors: pack resolution plus the generic getPromptText read
    // (25-prompt-send-part1.js).
    function getAuditState() {
        if (this.resolveSingleton('stopButton', 'streaming')) return 'streaming';
        const composer = this.resolveSingleton('composer');
        if (composer && typeof this.getPromptText === 'function') {
            const text = this.getPromptText(composer);
            if (text && text.trim()) return 'composing';
        }
        return 'idle';
    }

    Object.assign(ns.TTSReader, {
        getChatGptPack,
        getChatGptSite,
        resolveSingleton,
        exchanges,
        resolveInExchange,
        resolveAllInExchange,
        packData,
        exchangeForElement,
        exchangeKey,
        resetResolutionMemo,
        getIgnoreSelectors,
        getAuditState
    });
})();
