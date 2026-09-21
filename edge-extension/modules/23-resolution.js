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
        const site = getChatGptSite();
        if (!site) return [];
        try {
            const result = site.resolve('exchangeRoot', document);
            return (result && result.ok && Array.isArray(result.els)) ? result.els : [];
        } catch (_error) {
            return [];
        }
    }

    // Per-exchange anchor, resolved with the exchange element as scope. Returns the
    // element or null — never throws, never resolves document-wide.
    function resolveInExchange(anchor, exchangeEl) {
        if (!anchor || !exchangeEl || exchangeEl.nodeType !== 1) return null;
        const site = getChatGptSite();
        if (!site) return null;
        try {
            const result = site.resolve(anchor, exchangeEl);
            return (result && result.ok && result.el) ? result.el : null;
        } catch (_error) {
            return null;
        }
    }

    Object.assign(ns.TTSReader, {
        getChatGptPack,
        getChatGptSite,
        resolveSingleton,
        exchanges,
        resolveInExchange
    });
})();
