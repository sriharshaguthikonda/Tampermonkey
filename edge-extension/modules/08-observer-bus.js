(function () {
    'use strict';

    // Issue #12: one filtered body observer prevents ChatGPT hydration from
    // fanning out across many expensive document-wide MutationObservers.
    // Subscribers receive debounced, relevant mutation batches off the hot path.

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    const IGNORE_SELECTOR = [
        '.tmx-copy-row',
        '.tmx-copy-button',
        '[data-tmx-control]',
        '[data-tts-ui]',
        '[data-tts-word="1"]',
        '.tts-current-sentence',
        '.tts-current-word',
        '.tts-navigation-focus',
        '.tts-focus-fade-out',
        '#tts-pointer',
        '#tts-control-panel',
        '#tts-diagnostics-panel',
        '#tts-progress-panel',
        '#tts-navigation-trail',
        '#tts-notification-popup'
    ].join(', ');

    const subscribers = new Set();
    let observer = null;
    let waitingForBody = false;
    const ELEMENT_NODE = 1;

    function getElement(node) {
        if (!node) return null;
        if (node.nodeType === ELEMENT_NODE) return node;
        return node.parentElement || null;
    }

    function isExtensionOwned(node) {
        const element = getElement(node);
        if (!element) return false;
        try {
            if (element.matches && element.matches(IGNORE_SELECTOR)) return true;
            if (element.closest && element.closest(IGNORE_SELECTOR)) return true;
        } catch (_error) {
            return false;
        }
        return false;
    }

    function selectorMatches(element, selector) {
        if (!element || !selector) return false;
        try {
            if (element.matches && element.matches(selector)) return true;
            if (element.closest && element.closest(selector)) return true;
            if (element.querySelector && element.querySelector(selector)) return true;
        } catch (_error) {
            return false;
        }
        return false;
    }

    // S3.3: map an arbitrary node to the exchange element containing it by walking
    // up to the element present in 23-resolution's exchanges() — never a hardcoded
    // site attribute. When driftwatch or the resolution helpers are unavailable this
    // returns null and exchange subscriptions stay quiet (fail-soft, D7).
    function exchangeFor(node) {
        const reader = ns.TTSReader;
        if (!reader || typeof reader.exchangeForElement !== 'function') return null;
        try {
            return reader.exchangeForElement(node);
        } catch (_error) {
            return null;
        }
    }

    // Exchanges an added node touches: the one containing it, else every exchange it
    // contains (an inserted wrapper can carry whole exchanges). exchanges() is
    // tick-memoized in 23-resolution.js, so a batch shares one enumeration.
    // ponytail: O(exchanges) contains() checks for nodes outside every exchange.
    function exchangesTouchedBy(node, seen) {
        const containing = exchangeFor(node);
        if (containing) return [containing];
        const reader = ns.TTSReader;
        if (!node || typeof node.contains !== 'function' || !reader || typeof reader.exchanges !== 'function') return [];
        try {
            // Only NEW exchanges count through containment: a mutation target such as the
            // list container or body contains every exchange already on the page.
            return reader.exchanges().filter((exchangeEl) => !seen.has(exchangeEl) && node.contains(exchangeEl));
        } catch (_error) {
            return [];
        }
    }

    function isRelevantForSubscriber(element, subscriber) {
        if (!element || element.isConnected === false || isExtensionOwned(element)) return false;
        if (typeof subscriber.relevant === 'function') {
            try {
                return Boolean(subscriber.relevant(element));
            } catch (error) {
                logSubscriberError(subscriber, error);
                return false;
            }
        }
        if (subscriber.selector) return selectorMatches(element, subscriber.selector);
        return true;
    }

    function scheduleIdle(callback) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(callback, { timeout: 250 });
            return;
        }
        setTimeout(callback, 32);
    }

    function logSubscriberError(subscriber, error) {
        const details = {
            subscriber: subscriber && subscriber.name ? subscriber.name : 'anonymous',
            error: error && error.message ? error.message : String(error),
            stack: error && error.stack ? error.stack : ''
        };
        if (ns.diagnostics && typeof ns.diagnostics.log === 'function') {
            ns.diagnostics.log('error', 'Observer bus subscriber failed', details);
            return;
        }
        console.error('[TTSReader] Observer bus subscriber failed', details);
    }

    function clearSubscriberTimers(subscriber) {
        if (subscriber.debounceTimer) clearTimeout(subscriber.debounceTimer);
        if (subscriber.maxWaitTimer) clearTimeout(subscriber.maxWaitTimer);
        subscriber.debounceTimer = null;
        subscriber.maxWaitTimer = null;
    }

    function flushSubscriber(subscriber) {
        clearSubscriberTimers(subscriber);
        const addedNodes = Array.from(subscriber.pendingAdded)
            .filter((element) => element && element.isConnected !== false && isRelevantForSubscriber(element, subscriber));
        const removedCount = subscriber.pendingRemovedCount;
        const batchCount = subscriber.pendingBatchCount;
        subscriber.pendingAdded.clear();
        subscriber.pendingRemovedCount = 0;
        subscriber.pendingBatchCount = 0;
        subscriber.firstQueuedAt = 0;
        if (addedNodes.length === 0 && removedCount === 0 && batchCount === 0) return;

        scheduleIdle(() => {
            try {
                subscriber.onFlush({ addedNodes, removedCount, batchCount });
            } catch (error) {
                logSubscriberError(subscriber, error);
            }
        });
    }

    function scheduleFlush(subscriber) {
        if (subscriber.debounceTimer) clearTimeout(subscriber.debounceTimer);
        subscriber.debounceTimer = setTimeout(() => flushSubscriber(subscriber), subscriber.debounceMs);
        if (!subscriber.maxWaitTimer) {
            subscriber.maxWaitTimer = setTimeout(() => flushSubscriber(subscriber), subscriber.maxWaitMs);
        }
    }

    function queueForSubscriber(subscriber, candidates, removedCount) {
        let hasRelevantAddition = false;
        for (const candidate of candidates) {
            if (!isRelevantForSubscriber(candidate, subscriber)) continue;
            subscriber.pendingAdded.add(candidate);
            hasRelevantAddition = true;
        }
        if (!hasRelevantAddition && removedCount === 0) return;
        subscriber.pendingRemovedCount += removedCount;
        subscriber.pendingBatchCount += 1;
        if (!subscriber.firstQueuedAt) subscriber.firstQueuedAt = Date.now();
        scheduleFlush(subscriber);
    }

    function handleMutations(mutations) {
        if (subscribers.size === 0) return;
        for (const mutation of mutations) {
            if (isExtensionOwned(mutation.target)) continue;
            const candidates = [];
            const targetElement = getElement(mutation.target);
            if (targetElement && !isExtensionOwned(targetElement)) candidates.push(targetElement);
            let removedCount = 0;

            for (const node of Array.from(mutation.addedNodes || [])) {
                if (isExtensionOwned(node)) continue;
                const element = getElement(node);
                if (element) candidates.push(element);
            }
            for (const node of Array.from(mutation.removedNodes || [])) {
                if (isExtensionOwned(node)) continue;
                removedCount += 1;
            }
            if (candidates.length === 0 && removedCount === 0) continue;
            subscribers.forEach((subscriber) => queueForSubscriber(subscriber, candidates, removedCount));
        }
    }

    function startObserver() {
        if (observer || subscribers.size === 0) return;
        if (!document.body) {
            if (!waitingForBody) {
                waitingForBody = true;
                document.addEventListener('DOMContentLoaded', () => {
                    waitingForBody = false;
                    startObserver();
                }, { once: true });
            }
            return;
        }
        observer = new MutationObserver(handleMutations);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        subscribers.forEach((subscriber) => clearSubscriberTimers(subscriber));
        subscribers.clear();
    }

    ns.observerBus = {
        subscribe(options = {}) {
            const subscriber = {
                name: typeof options.name === 'string' && options.name ? options.name : 'anonymous',
                selector: typeof options.selector === 'string' && options.selector ? options.selector : '',
                relevant: typeof options.relevant === 'function' ? options.relevant : null,
                onFlush: typeof options.onFlush === 'function' ? options.onFlush : null,
                debounceMs: Math.max(0, Number(options.debounceMs) || 200),
                maxWaitMs: Math.max(1, Number(options.maxWaitMs) || 1000),
                pendingAdded: new Set(),
                pendingRemovedCount: 0,
                pendingBatchCount: 0,
                firstQueuedAt: 0,
                debounceTimer: null,
                maxWaitTimer: null
            };
            if (!subscriber.onFlush) {
                throw new Error('observerBus.subscribe requires onFlush');
            }
            subscribers.add(subscriber);
            startObserver();
            return () => {
                clearSubscriberTimers(subscriber);
                subscribers.delete(subscriber);
                if (subscribers.size === 0 && observer) {
                    observer.disconnect();
                    observer = null;
                }
            };
        },

        // S3.3: subscribe to exchangeRoot/assistantUnit change batches. Same options
        // shape as subscribe() (minus selector/relevant — relevance IS exchange
        // membership); the own-UI noise filter still applies because it rides the
        // same subscriber machinery. onExchangeChange receives the DISTINCT exchange
        // elements touched in the batch — per-exchange anchors (assistantUnit,
        // assistantMarkdownRoot, ...) are then resolved by the feature with the
        // exchange as scope (Resolution model R1).
        subscribeExchanges(options = {}) {
            // onExchangeChange gets the exchanges a batch touched: the one containing a
            // mutated node, plus exchanges that newly appeared inside an inserted subtree.
            const onExchangeChange = typeof options.onExchangeChange === 'function' ? options.onExchangeChange : null;
            if (!onExchangeChange) {
                throw new Error('observerBus.subscribeExchanges requires onExchangeChange');
            }
            const seen = new WeakSet();
            try {
                const reader = ns.TTSReader;
                if (reader && typeof reader.exchanges === 'function') reader.exchanges().forEach((exchangeEl) => seen.add(exchangeEl));
            } catch (_error) {
                // Fail soft: an empty seen set only means the first batch reports every exchange once.
            }
            return ns.observerBus.subscribe({
                name: typeof options.name === 'string' && options.name ? `${options.name}:exchanges` : 'anonymous:exchanges',
                relevant: (element) => exchangesTouchedBy(element, seen).length > 0,
                debounceMs: options.debounceMs,
                maxWaitMs: options.maxWaitMs,
                onFlush: ({ addedNodes, removedCount, batchCount }) => {
                    const touched = new Set();
                    addedNodes.forEach((element) => {
                        exchangesTouchedBy(element, seen).forEach((exchangeEl) => touched.add(exchangeEl));
                    });
                    touched.forEach((exchangeEl) => seen.add(exchangeEl));
                    if (touched.size === 0 && removedCount === 0 && batchCount === 0) return;
                    onExchangeChange({ exchanges: Array.from(touched), removedCount, batchCount });
                }
            });
        },

        exchangeFor,
        stop
    };
})();
