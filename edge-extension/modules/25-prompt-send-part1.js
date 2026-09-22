(function () {
    'use strict';

    const ns = window.__TTSNS;
    if (!ns) {
        console.error('[TTSReader] __TTSNS not initialized — load order broken');
        return;
    }

    // S3.8 (churn 2026-09): composer/send resolution goes through driftwatch pack v2 via
    // the shared 23-resolution helpers — no hardcoded site selector arrays remain (the
    // pre-repair fallback lists were confirmed 0-match live and are deleted, not
    // commented out). composer/sendButton are risk:"action" anchors scoped inside
    // composerForm: past their degradeLimit they fail closed (null), and sendButton is
    // state-conditioned — it is resolved with state 'composing' because an idle-EMPTY
    // page legitimately has no Send button (R3). The Dictate/Voice mic exclusion is a
    // code invariant (00-DESIGN #19), kept in isSendButtonReady below, never in pack data.

    // S7.1 (D-S9 drift visibility): the startup audit is a state-aware driftwatch
    // canary. dw.canary(pack, doc, opts, onDegrade) forwards { state } to audit
    // (review-16 fix 1); the diagnostics badge renders from EVERY returned report,
    // not from onDegrade — which fires only on a NEW degraded fingerprint and
    // never on recovery (review-16 fix 2). Re-runs ride the existing observer-bus
    // debounce, throttled by timestamp to one canary per 5 s; the canary owns no
    // timer, and nothing here touches the network.
    const DRIFT_CANARY_MIN_INTERVAL_MS = 5000;
    let driftwatchAudited = false;
    let driftCanaryLastRunAt = 0;

    // Anchor names only — never page text, per driftwatch's own privacy contract.
    function handleDriftwatchDegrade(report) {
        const log = ns.diagnostics && typeof ns.diagnostics.log === 'function' ? ns.diagnostics.log : null;
        if (!log) return;
        const drifting = computeDriftingAnchors(report, ns.TTSReader.getChatGptPack());
        const degraded = [];
        const broken = [];
        for (const name of drifting) {
            const status = report.anchors[name].status;
            if (status === 'broken' || status === 'ambiguous') broken.push(name);
            else if (status === 'degraded') degraded.push(name);
        }
        if (broken.length) {
            log('warn', 'driftwatch anchors broken', { anchors: broken.join(',') });
        } else if (degraded.length) {
            log('warn', 'driftwatch anchors degraded', { anchors: degraded.join(',') });
        }
    }

    // Plan follow-up (d): expected absences must not count as drift. A page is an
    // empty chat only when neither exchangeRoot nor any exchange-scoped anchor
    // matched and its path is not a known conversation path. A lazy new-chat
    // composer exposes only the pendingComposerInput stub, so composer/composerForm
    // are legitimately missing there too.
    function computeDriftingAnchors(report, pack) {
        const anchors = report && report.anchors ? report.anchors : {};
        const packAnchors = pack && pack.anchors ? pack.anchors : {};
        const exchangeAnchorNames = Object.keys(packAnchors).filter((name) =>
            name === 'exchangeRoot' || (packAnchors[name] && packAnchors[name].scope === 'exchange')
        );
        const zeroExchangeMatches = exchangeAnchorNames.every((name) =>
            !(anchors[name] && anchors[name].matchedCount > 0)
        );
        const conversationPathPatterns = pack && pack.data && Array.isArray(pack.data.conversationPathPatterns)
            ? pack.data.conversationPathPatterns
            : [];
        const onConversationPath = conversationPathPatterns.some((pattern) => {
            try {
                return new RegExp(pattern).test(location.pathname);
            } catch (_error) {
                return false;
            }
        });
        const emptyChat = zeroExchangeMatches && !onConversationPath;
        const pendingStatus = anchors.pendingComposerInput && anchors.pendingComposerInput.status;
        const lazyComposer = pendingStatus === 'ok' || pendingStatus === 'degraded';
        const expectedAbsent = new Set();
        if (emptyChat) {
            for (const name of Object.keys(packAnchors)) {
                if (packAnchors[name] && packAnchors[name].scope === 'exchange') expectedAbsent.add(name);
            }
            expectedAbsent.add('exchangeRoot');
            expectedAbsent.add('assistantMessage');
            expectedAbsent.add('conversationTurn');
        }
        if (lazyComposer) {
            expectedAbsent.add('composer');
            expectedAbsent.add('composerForm');
        }
        const drifting = [];
        for (const name of Object.keys(anchors)) {
            if (expectedAbsent.has(name)) continue;
            const status = anchors[name].status;
            if (status === 'broken' || status === 'ambiguous' || status === 'degraded') {
                drifting.push(name);
            }
        }
        return drifting;
    }

    // The badge is its own span inside #tts-diagnostics-panel: 65-prewrap rewrites
    // the timing text on its cadence, and a panel-level textContent write would
    // wipe every child (badge included).
    function renderDriftBadge(drifting) {
        const panel = ns.TTSReader.diagnosticsPanel;
        if (!panel || typeof panel.appendChild !== 'function') return;
        let badge = document.getElementById('tts-drift-badge');
        if (!badge || badge.parentElement !== panel) {
            badge = document.createElement('span');
            badge.id = 'tts-drift-badge';
            badge.setAttribute('data-tts-ui', 'true');
            badge.style.marginLeft = '6px';
            panel.appendChild(badge);
        }
        badge.textContent = `drift: ${drifting.length}`;
        // Tooltip lists anchor names only — never page text.
        if (drifting.length) {
            badge.title = drifting.join(', ');
        } else {
            badge.removeAttribute('title');
        }
    }

    function runDriftwatchCanary() {
        const dw = window.driftwatch;
        const pack = ns.TTSReader.getChatGptPack();
        if (!dw || !pack || typeof dw.canary !== 'function') return;
        const state = ns.TTSReader.getAuditState();
        let report;
        try {
            report = dw.canary(pack, document, { state }, handleDriftwatchDegrade);
        } catch (_error) {
            return;
        }
        const drifting = computeDriftingAnchors(report, pack);
        renderDriftBadge(drifting);
        if (!drifting.length && ns.diagnostics && typeof ns.diagnostics.log === 'function') {
            ns.diagnostics.log('debug', 'driftwatch audit clean', { state, summary: report.summary });
        }
    }

    function auditDriftwatchOnce() {
        if (driftwatchAudited) return;
        driftwatchAudited = true;
        driftCanaryLastRunAt = Date.now();
        runDriftwatchCanary();
        if (ns.observerBus && typeof ns.observerBus.subscribe === 'function') {
            ns.observerBus.subscribe({
                name: 'driftwatch-canary',
                onFlush: () => {
                    const now = Date.now();
                    if (now - driftCanaryLastRunAt < DRIFT_CANARY_MIN_INTERVAL_MS) return;
                    driftCanaryLastRunAt = now;
                    runDriftwatchCanary();
                }
            });
        }
    }

    Object.assign(ns.TTSReader, {
        // SECTION 06: Prompt / Send / Paste
        // -----------------------------------------------------------------------------
        // (See refactor_plan.md section B.1 for the canonical section list.)
        // =============================================================================

        auditDriftwatchOnce,

        findPromptArea() {
            const composer = this.resolveSingleton('composer');
            if (composer && this.isUsablePromptArea(composer)) return composer;
            return null;
        },

        // The form that scopes the real composer. Absent on a lazy NEW-CHAT page before
        // the first interaction — that page only has the pendingComposerInput stub.
        findComposerForm() {
            return this.resolveSingleton('composerForm');
        },

        // Pre-hydration stub on the lazy new-chat page: textarea#pending-home-input.
        // Writing text into it (writePendingComposerInput) makes the page mount the real
        // composer form and carry the text over (measured live 2026-09-21).
        findPendingComposerInput() {
            const stub = this.resolveSingleton('pendingComposerInput');
            if (!stub) return null;
            if (stub.disabled || stub.getAttribute('aria-hidden') === 'true') return null;
            return stub;
        },

        // Framework-controlled textarea: a plain `.value =` write is invisible to the
        // framework's change detection (it patches the value descriptor), so the write
        // goes through the native prototype setter, and the bubbling input event is what
        // triggers hydration of the real composer.
        writePendingComposerInput(text) {
            const stub = this.findPendingComposerInput();
            if (!stub || stub.tagName !== 'TEXTAREA') return false;
            const normalizedText = String(text || '').replace(/\r\n/g, '\n');
            try {
                const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
                if (!descriptor || typeof descriptor.set !== 'function') return false;
                descriptor.set.call(stub, normalizedText);
                stub.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            } catch (_error) {
                return false;
            }
        },

        // Waits for the real composer form to mount after a stub write (~1.5-3 s live).
        // MutationObserver carries the wait (mutation callbacks are not timer-throttled
        // in background tabs); the poll is the safety net, and the whole wait is bounded.
        waitForComposerForm(timeoutMs = 5000) {
            const boundedMs = Math.max(0, Number(timeoutMs) || 0);
            return new Promise((resolve) => {
                const existing = this.findComposerForm();
                if (existing) {
                    resolve(existing);
                    return;
                }
                let settled = false;
                let observer = null;
                let pollTimer = null;
                let timeoutTimer = null;
                const finish = (form) => {
                    if (settled) return;
                    settled = true;
                    if (observer) observer.disconnect();
                    clearInterval(pollTimer);
                    clearTimeout(timeoutTimer);
                    resolve(form || null);
                };
                const check = () => {
                    const form = this.findComposerForm();
                    if (form) finish(form);
                };
                const observeRoot = document.body || document.documentElement;
                if (observeRoot && typeof MutationObserver === 'function') {
                    observer = new MutationObserver(check);
                    observer.observe(observeRoot, { childList: true, subtree: true });
                }
                pollTimer = setInterval(check, 250);
                timeoutTimer = setTimeout(() => finish(this.findComposerForm()), boundedMs);
            });
        },

        // Paste-anywhere entry (S3.8). Lands text in the REAL composer; on a lazy
        // new-chat page it hydrates through the stub first, waits (bounded) for the real
        // composer form to mount, then continues there — re-applying the text only if the
        // page did not carry it over. Never throws past this boundary; failures notify
        // the user and return false.
        async applyPromptText(text, options = {}) {
            const waitMs = options.waitMs == null ? 5000 : Math.max(0, Number(options.waitMs) || 0);

            const liveComposer = this.findPromptArea();
            if (liveComposer) {
                const applied = this.setPromptText(text);
                if (!applied) this.notifyPromptFailure('Could not write to the ChatGPT composer.');
                else if (options.autoSend) this.scheduleSendButtonClick();
                return applied;
            }

            if (!this.findComposerForm() && this.findPendingComposerInput()) {
                const written = this.writePendingComposerInput(text);
                if (!written) {
                    this.notifyPromptFailure('Could not write to the ChatGPT composer.');
                    return false;
                }
                const form = await this.waitForComposerForm(waitMs);
                if (!form) {
                    this.notifyPromptFailure('ChatGPT composer did not appear in time — text left in the input.');
                    return false;
                }
                const mounted = this.findPromptArea();
                if (!mounted) {
                    this.notifyPromptFailure('ChatGPT composer appeared but could not be used.');
                    return false;
                }
                const carried = String(this.getPromptText(mounted) || '').trim();
                if (carried) {
                    mounted.focus();
                } else {
                    this.setPromptText(text);
                }
                if (options.autoSend) this.scheduleSendButtonClick();
                return true;
            }

            const applied = this.setPromptText(text);
            if (!applied) this.notifyPromptFailure('ChatGPT composer not found on this page.');
            return applied;
        },

        notifyPromptFailure(message) {
            try {
                if (typeof this.showNotification === 'function') this.showNotification(message);
            } catch (_error) {
                // fail soft — notification is best-effort
            }
        },

        findSendButton() {
            // R3: Send exists only while the composer holds text. idle-empty legitimately
            // has no Send button, so the send path always resolves with state 'composing'
            // and treats "absent" as "nothing to click", never as an error.
            const button = this.resolveSingleton('sendButton', 'composing');
            if (button && this.isSendButtonReady(button)) return button;
            return null;
        },

        // Generic shape check for send-capture (no site selector literals): a button
        // inside the resolved composer form whose label says Send and passes the mic
        // exclusion. Works across the Jul ("Send prompt", testid button) and Sept
        // ("Send", submit button) composers alike.
        isSendButtonElement(element) {
            if (!element || element.tagName !== 'BUTTON') return false;
            if (element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
            const label = String(element.getAttribute('aria-label') || '').toLowerCase();
            if (!label.startsWith('send')) return false;
            const composerForm = this.findComposerForm();
            if (!composerForm || typeof composerForm.contains !== 'function') return false;
            return composerForm.contains(element) && this.isSendButtonReady(element);
        },

        isUsablePromptArea(element) {
            if (!element) return false;
            if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
                if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
                return !element.disabled && element.getAttribute('aria-hidden') !== 'true';
            }
            return element.isContentEditable === true || element.getAttribute('contenteditable') === 'true';
        },

        isSendButtonReady(button) {
            if (!button || button.disabled) return false;
            if (button.getAttribute('aria-disabled') === 'true') return false;
            const label = String(button.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('dictation') || label.includes('voice')) return false;
            return true;
        },

        isEditableElement(element) {
            if (!element || !element.tagName) return false;
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return true;
            return element.isContentEditable === true || element.getAttribute('contenteditable') === 'true';
        },

        isPromptFocused(promptArea) {
            if (!promptArea) return false;
            const activeElement = document.activeElement;
            if (!activeElement) return false;
            return activeElement === promptArea || promptArea.contains(activeElement);
        },

        setPromptText(text) {
            const promptArea = this.findPromptArea();
            if (!promptArea) return false;
            const normalizedText = String(text || '').replace(/\r\n/g, '\n');

            promptArea.focus();
            if (promptArea.tagName === 'TEXTAREA' || promptArea.tagName === 'INPUT') {
                promptArea.value = normalizedText;
                promptArea.dispatchEvent(new Event('input', { bubbles: true }));
                promptArea.selectionStart = promptArea.value.length;
                promptArea.selectionEnd = promptArea.value.length;
                return true;
            }

            const selection = window.getSelection();
            let insertedWithCommand = false;
            if (selection) {
                const selectAllRange = document.createRange();
                selectAllRange.selectNodeContents(promptArea);
                selection.removeAllRanges();
                selection.addRange(selectAllRange);
            }

            try {
                if (typeof document.execCommand === 'function') {
                    insertedWithCommand = normalizedText === ''
                        ? document.execCommand('delete', false)
                        : document.execCommand('insertText', false, normalizedText);
                }
            } catch (_error) {
                insertedWithCommand = false;
            }

            if (normalizedText === '' && promptArea.textContent.trim() !== '') {
                insertedWithCommand = false;
            }

            if (!insertedWithCommand) {
                const lines = normalizedText.split('\n');
                promptArea.replaceChildren(...lines.map((line) => {
                    const paragraph = document.createElement('p');
                    if (line) {
                        paragraph.textContent = line;
                    } else {
                        paragraph.appendChild(document.createElement('br'));
                    }
                    return paragraph;
                }));
            }

            const inputEvent = typeof InputEvent === 'function'
                ? new InputEvent('input', {
                    bubbles: true,
                    inputType: normalizedText === '' ? 'deleteContentBackward' : 'insertText',
                    data: normalizedText === '' ? null : normalizedText
                })
                : new Event('input', { bubbles: true });
            promptArea.dispatchEvent(inputEvent);
            if (selection) {
                const range = document.createRange();
                range.selectNodeContents(promptArea);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            return true;
        },

        getPromptText(promptArea = null) {
            const el = promptArea || this.findPromptArea();
            if (!el) return '';
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                return String(el.value || '').replace(/\r\n/g, '\n');
            }
            return String(el.innerText || el.textContent || '').replace(/\r\n/g, '\n');
        },

        capturePromptForHistoryFromPromptArea(source = '') {
            if (!this.isChatGPTPage || !this.CONFIG.PROMPT_HISTORY_NAV_ENABLED) return;
            const promptArea = this.findPromptArea();
            if (!promptArea) return;
            const text = this.getPromptText(promptArea);
            if (!text || !text.trim()) return;
            this.addPromptToHistory(text);
            if (this.CONFIG.SHOW_DIAGNOSTICS_PANEL) {
                console.debug('[TTS] Prompt captured for history', {
                    source,
                    length: text.length
                });
            }
        },

        capturePromptForNativeEnterSend(event) {
            if (!this.isChatGPTPage || !this.CONFIG.PROMPT_HISTORY_NAV_ENABLED) return;
            if (this.CONFIG.ENTER_TO_SEND_ENABLED) return;
            if (!event || event.key !== 'Enter') return;
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

            const promptArea = this.findPromptArea();
            if (!promptArea || !this.isPromptFocused(promptArea)) return;
            this.capturePromptForHistoryFromPromptArea('native-enter');
        },

        handleSendButtonCapture(event) {
            if (!this.isChatGPTPage || !this.CONFIG.PROMPT_HISTORY_NAV_ENABLED) return;
            const target = event && event.target && event.target.closest ? event.target.closest('button') : null;
            if (!target || !this.isSendButtonElement(target)) return;
            this.capturePromptForHistoryFromPromptArea('send-button-click');
        },

        normalizePromptHistoryText(text) {
            return String(text || '').replace(/\r\n/g, '\n').trim();
        },

    });
})();
