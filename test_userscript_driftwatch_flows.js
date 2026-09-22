const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

// jsdom comes from the driftwatch repo (24.1.3, `:has()` verified — same convention
// as test_driftwatch_exchange_features.js; this repo deliberately has no node_modules).
const { JSDOM, VirtualConsole } = require(path.join(repoRoot, '..', 'driftwatch', 'node_modules', 'jsdom'));

const scriptPath = path.join(repoRoot, 'Tampermonkey_scripts', 'ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js');
const IDLE_FIXTURE = path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-09-21-idle', 'conversation.html');
const COMPOSING_FIXTURE = path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-09-21-composing', 'conversation.html');

// The sanitized Sept fixtures carry structure only (text stripped by the privacy
// sanitizer), so TEXT-dependent assertions run against hand-written structure-only
// snippets instead — synthetic tokens, never page text.
function exchangeMarkup(key, extra = '') {
    return `<article data-turn-key="${key}">
  <div data-content-search-unit-key="${key}:0:user"><p>${key}-u</p></div>
  <div data-content-search-unit-key="${key}:2:assistant">
    <div data-markdown-text-style="assistant-message"><p>${key}-a</p></div>
    ${extra}
  </div>
</article>`;
}

const SYNTHETIC_HTML = `<!doctype html><html><body><main>${exchangeMarkup('sx-1')}${exchangeMarkup('sx-2')}</main></body></html>`;

// Saved/local-page synthetic DOM (pre-2026-09 attributes, structure only).
const LEGACY_SAVED_HTML = `<!doctype html><html><body><main>
<div data-message-id="m-1" data-message-author-role="assistant"><div class="markdown"><p>legacy-a1</p></div></div>
<div data-message-id="m-2" data-message-author-role="user"><div class="markdown"><p id="legacy-user-p">what is the legacy token</p></div></div>
<div data-message-id="m-3" data-message-author-role="assistant"><div class="markdown"><p>legacy-a2</p></div></div>
</main></body></html>`;

// jsdom fires "Not implemented: ...requestSubmit" when a test clicks a form
// submit button (composer-flow checks). That diagnostic is expected noise;
// every OTHER jsdomError — a boot-time exception included — fails the load.
function isExpectedJsdomDiagnostic(message) {
    return /^Not implemented: .*requestSubmit/.test(message);
}

// Load the REAL userscript (driftwatch inlined, resolution helpers, migrated call
// sites — nothing stubbed to null) into a JSDOM document and let its own boot run.
// jsdom fires DOMContentLoaded as a task, so the document-start deferral tail needs
// one await before the reader has booted — that await IS the tail being exercised.
async function loadUserscript(html, url, options = {}) {
    const expectChatGPTPage = options.expectChatGPTPage !== false;
    const source = fs.readFileSync(scriptPath, 'utf8')
        .replace(
            '    const startTTSReader = () => { TTSReader.init(); };',
            '    window.__TTSReaderForTest = TTSReader;\n    const startTTSReader = () => { TTSReader.init(); };'
        );
    assert.ok(source.includes('window.__TTSReaderForTest'), 'userscript tail anchor must match the loader replace');
    // Uncaught errors (boot exceptions included) surface as jsdomError events on
    // the VirtualConsole and window "error" events — collect and fail on any.
    const jsdomErrors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => {
        const message = error && error.message ? error.message : String(error);
        if (!isExpectedJsdomDiagnostic(message)) jsdomErrors.push(message);
    });
    const dom = new JSDOM(html, { url: url || 'https://chatgpt.com/c/fixture', runScripts: 'outside-only', virtualConsole });
    dom.window.addEventListener('error', (event) => {
        const message = event && event.message ? event.message : 'uncaught window error';
        if (!isExpectedJsdomDiagnostic(message)) jsdomErrors.push(message);
    });
    dom.window.speechSynthesis = { getVoices: () => [], onvoiceschanged: null };
    const context = dom.getInternalVMContext();
    vm.runInContext(source, context, { filename: scriptPath });
    if (dom.window.document.readyState === 'loading') {
        await new Promise((resolve) => dom.window.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    const reader = dom.window.__TTSReaderForTest;
    assert.ok(reader, 'userscript must expose TTSReader to the loader');
    // init() ran via the real tail; detectContext set isChatGPTPage from the URL.
    // Re-assert boot state instead of assuming it.
    assert.strictEqual(reader.isChatGPTPage, expectChatGPTPage,
        `URL must be classified ${expectChatGPTPage ? 'live chatgpt.com' : 'saved/non-chatgpt'} (isChatGPTPage)`);
    assert.ok(dom.window.driftwatch && dom.window.driftwatch.packs['chatgpt.com'], 'inline driftwatch must expose the pack');
    // init() must have COMPLETED, not just started: the reader UI root exists.
    assert.ok(dom.window.document.getElementById('tts-control-panel'),
        'init must complete: the reader UI root (#tts-control-panel) must exist after boot');
    assert.deepStrictEqual(jsdomErrors, [], 'boot must not raise uncaught jsdom/window errors');
    return { dom, window: dom.window, document: dom.window.document, reader, jsdomErrors };
}

function ok(name, detail) {
    console.log(`OK ${name}${detail ? ` (${detail})` : ''}`);
}

// S5.3 check 1: composer resolve + send-button click target, state-aware.
async function testComposerAndSendButtonResolve() {
    const composing = fs.readFileSync(COMPOSING_FIXTURE, 'utf8');
    const { document, reader } = await loadUserscript(composing, 'https://chatgpt.com/c/composing');

    const composer = reader.resolveSingleton('composer');
    assert.ok(composer, 'composer must resolve on the composing fixture');
    assert.strictEqual(composer.getAttribute('data-oracle'), 'composer', 'composer must be the oracle-marked editor');
    assert.ok(composer.hasAttribute('data-composer-markdown'), 'composer must be the form-scoped editor, never a code editor');
    assert.strictEqual(
        composer.closest('form'),
        document.querySelector('[data-oracle="composerForm"]'),
        'composer must sit inside the resolved composer form'
    );

    const send = reader.resolveSingleton('sendButton', 'composing');
    assert.ok(send, 'sendButton must resolve in the composing state');
    assert.strictEqual(send.getAttribute('data-oracle'), 'sendButton', 'send must be the oracle-marked submit button');
    let clicks = 0;
    send.addEventListener('click', () => { clicks += 1; });
    send.click();
    assert.strictEqual(clicks, 1, 'send button click target must be clickable');
    assert.strictEqual(reader.resolveSingleton('sendButton', 'idle'), null, 'idle send resolve on a composing page is a state mismatch -> null is fine');

    // Idle fixture: composer present, Send legitimately absent (R3), Stop absent.
    const idle = fs.readFileSync(IDLE_FIXTURE, 'utf8');
    const idleLoad = await loadUserscript(idle, 'https://chatgpt.com/c/idle');
    assert.ok(idleLoad.reader.resolveSingleton('composer'), 'composer must resolve on the idle fixture');
    assert.strictEqual(idleLoad.reader.resolveSingleton('sendButton', 'idle'), null, 'idle-empty composer: Send absent is correct, not broken');
    assert.strictEqual(idleLoad.reader.resolveSingleton('stopButton', 'idle'), null, 'idle composer: Stop must be absent');
    ok('composer resolve + state-aware send-button click target', 'composing send clicked; idle send/stop absent');
}

// S5.3 check 2: exchange enumeration == fixture exchange count, DOM order, roles.
async function testExchangeEnumerationOnSeptFixture() {
    const html = fs.readFileSync(IDLE_FIXTURE, 'utf8');
    const { document, reader } = await loadUserscript(html, 'https://chatgpt.com/c/enumerate');

    const marked = Array.from(document.querySelectorAll('[data-oracle-collection="exchangeRoot"]'));
    assert.ok(marked.length >= 2, 'fixture must expose >= 2 exchanges');
    const exchangeList = reader.exchanges();
    assert.strictEqual(exchangeList.length, marked.length, 'exchanges() count must equal the fixture exchange count');

    const units = reader.getConversationMessageElements();
    assert.strictEqual(units.length, exchangeList.length * 2, 'one user + one assistant unit per exchange');
    const expectedRoles = exchangeList.flatMap(() => ['user', 'assistant']);
    assert.deepStrictEqual(units.map((el) => reader.getMessageRoleFromElement(el)), expectedRoles,
        'roles must come from per-exchange unit anchors in DOM order (user first)');

    for (let i = 0; i < exchangeList.length; i += 1) {
        assert.strictEqual(exchangeList[i], marked[i], 'exchanges must be in DOM order');
        const userUnit = reader.resolveInExchange('userUnit', exchangeList[i]);
        const assistantUnit = reader.resolveInExchange('assistantUnit', exchangeList[i]);
        assert.strictEqual(userUnit.getAttribute('data-oracle-exchange'), 'userUnit');
        assert.strictEqual(assistantUnit.getAttribute('data-oracle-exchange'), 'assistantUnit');
        assert.strictEqual(reader.getMessageOrderInsideTurn(userUnit), 0);
        assert.strictEqual(reader.getMessageOrderInsideTurn(assistantUnit), 1);
        assert.strictEqual(reader.getConversationTurnIndex(userUnit), null,
            'chatgpt.com exchange indices must not become persistent turn indices');
    }
    // exchangeKey reads the identity attribute through the pack strategy, not a literal.
    assert.strictEqual(reader.exchangeKey(exchangeList[0]), marked[0].getAttribute('data-turn-key'));
    ok('exchange enumeration, DOM order and roles', `${exchangeList.length} exchanges, ${units.length} units`);
}

// S5.3 check 3: auto-read eligibility picks the LAST assistant markdown root.
async function testAutoReadPicksLastAssistantMarkdownRoot() {
    const { document, reader } = await loadUserscript(SYNTHETIC_HTML, 'https://chatgpt.com/c/synthetic');
    const exchangeList = reader.exchanges();
    const lastExchange = exchangeList[exchangeList.length - 1];
    const lastAssistantUnit = document.querySelector(`[data-content-search-unit-key="sx-2:2:assistant"]`);
    const lastMarkdownRoot = document.querySelector('[data-turn-key="sx-2"] [data-markdown-text-style="assistant-message"]');

    const latest = reader.getLatestAssistantMessageElement();
    assert.strictEqual(latest, lastAssistantUnit, 'latest assistant message must be the LAST exchange assistant unit');
    assert.ok(reader.exchangeForElement(lastMarkdownRoot) === lastExchange, 'markdown root maps back to its exchange');
    assert.strictEqual(reader.getPreferredMessageContentNode(latest), lastMarkdownRoot,
        'auto-read content scope must be the last exchange assistant markdown root');
    assert.strictEqual(reader.isAutoReadEligibleMessage(latest), true, 'resolved assistant unit with text must be eligible');
    assert.strictEqual(reader.isAutoReadEligibleMessage(null), false);
    ok('auto-read eligibility picks the last assistant markdown root');
}

// S5.3 check 4: copy placement/content — suppressed when native Copy exists,
// injected after the action bar when removed, content == markdown root, never code.
async function testCopyButtonPlacementAndContent() {
    // (a) Native Copy present in the action bar -> injection suppressed.
    const withNative = `<!doctype html><html><body><main>
<article data-turn-key="cp-1">
  <div data-content-search-unit-key="cp-1:0:user"><p>cp-1-u</p></div>
  <div data-content-search-unit-key="cp-1:2:assistant">
    <div data-markdown-text-style="assistant-message"><p>prose-token</p></div>
    <div id="bar"><span><button aria-label="Copy">c</button></span><button aria-label="More actions">m</button></div>
  </div>
</article>
</main></body></html>`;
    const a = await loadUserscript(withNative, 'https://chatgpt.com/c/native-copy');
    a.reader.CONFIG.COPY_BUTTON_ENABLED = true;
    a.reader.updateCopyButtons();
    assert.strictEqual(a.document.querySelectorAll('.tmx-copy-row').length, 0,
        'native copyResponseButton per exchange must suppress the custom row');

    // (b) Native Copy removed -> row injected adjacent to the action bar; the copied
    // payload equals the exchange's assistant markdown root text — never a code block.
    const withoutNative = `<!doctype html><html><body><div contenteditable="true" role="textbox" aria-label="Edit code">decoy-code-token</div><main>
<article data-turn-key="cp-1">
  <div data-content-search-unit-key="cp-1:0:user"><p>cp-1-u</p></div>
  <div data-content-search-unit-key="cp-1:2:assistant">
    <div data-markdown-text-style="assistant-message"><p>prose-token</p></div>
    <div id="bar"><button aria-label="More actions">m</button></div>
  </div>
</article>
</main></body></html>`;
    const b = await loadUserscript(withoutNative, 'https://chatgpt.com/c/no-native-copy');
    let payload = null;
    b.reader.copyTextToClipboard = (text) => { payload = text; return Promise.resolve(true); };
    b.reader.showNotification = () => {};
    b.reader.CONFIG.COPY_BUTTON_ENABLED = true;
    b.reader.updateCopyButtons();

    const bar = b.document.getElementById('bar');
    const row = bar.nextElementSibling;
    assert.ok(row && row.classList.contains('tmx-copy-row'), 'row must be placed right after the action bar (fallback placement)');
    assert.strictEqual(b.document.querySelectorAll('.tmx-copy-row').length, 1, 'exactly one row for the one exchange');

    row.querySelector('.tmx-copy-button').click();
    await Promise.resolve();
    const markdownRoot = b.document.querySelector('[data-markdown-text-style="assistant-message"]');
    const expected = b.reader.formatSmartCopyEntries([{ role: 'assistant', text: b.reader.extractConversationTextFromNode(markdownRoot) }]);
    assert.ok(payload, 'click must copy');
    assert.strictEqual(payload, expected, 'copied content must equal the markdown-root extraction');
    assert.ok(payload.includes('prose-token'), 'payload carries the markdown-root prose token');
    assert.ok(!payload.includes('decoy-code-token'), 'payload must never carry code-editor content');
    assert.ok(!payload.includes('cp-1-u'), 'payload must not leak the user unit (content source is the assistant markdown root)');

    // (b2) Staleness: the markdown root is REPLACED while the action bar (and our
    // row) survives — the click must resolve the exchange's CURRENT markdown root,
    // not the element captured when the row was injected.
    const oldRoot = b.document.querySelector('[data-markdown-text-style="assistant-message"]');
    const newRoot = b.document.createElement('div');
    newRoot.setAttribute('data-markdown-text-style', 'assistant-message');
    newRoot.innerHTML = '<p>replacement-root-token</p>';
    oldRoot.parentElement.replaceChild(newRoot, oldRoot);
    payload = null;
    row.querySelector('.tmx-copy-button').click();
    await Promise.resolve();
    assert.ok(payload, 'click after root replacement must copy');
    assert.ok(payload.includes('replacement-root-token'), 'payload must equal the NEW markdown root content');
    assert.ok(!payload.includes('prose-token'), 'payload must not come from the detached pre-replacement root');

    // (c) Native Copy appears later (stream finished): the row is dropped again.
    bar.insertAdjacentHTML('beforeend', '<span><button aria-label="Copy">c2</button></span>');
    b.reader.resetResolutionMemo();
    b.reader.updateCopyButtons();
    assert.strictEqual(b.document.querySelectorAll('.tmx-copy-row').length, 0,
        'late-mounting native Copy must win back the exchange');
    ok('copy placement/content: suppressed with native Copy, bar placement, markdown-root payload');
}

// S5 fix check: init COMPLETED — the window capture keydown handler is installed
// and claims ACTIVATE (fresh boot, no session -> crosshair pick mode).
async function testBootInstallsWindowCaptureHotkeyHandler() {
    const { window, document } = await loadUserscript(SYNTHETIC_HTML, 'https://chatgpt.com/c/boot-hotkeys');
    assert.notStrictEqual(document.body.style.cursor, 'crosshair', 'sanity: pick mode not yet armed');
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', {
        key: 'U', shiftKey: true, bubbles: true, cancelable: true
    }));
    assert.strictEqual(document.body.style.cursor, 'crosshair',
        'init must complete far enough to install the window capture keydown handler');
}

// S5 fix check: an inserted WRAPPER carrying a whole new exchange must schedule
// auto-read — the ancestor-only exchange lookup misses it. Copy buttons are
// disabled first: their own row insertions land INSIDE the new exchange and
// would map through the ancestor path, masking the wrapper case.
async function testWrappedExchangeInsertionSchedulesAutoRead() {
    const { document, reader } = await loadUserscript(SYNTHETIC_HTML, 'https://chatgpt.com/c/wrapped');
    reader.CONFIG.AUTO_READ_NEW_MESSAGES = true;
    reader.CONFIG.COPY_BUTTON_ENABLED = false;
    reader.removeCopyButtons();
    let scheduled = 0;
    reader.scheduleAutoRead = () => { scheduled += 1; };

    const wrapper = document.createElement('div');
    wrapper.innerHTML = exchangeMarkup('sx-3');
    document.querySelector('main').appendChild(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.strictEqual(scheduled, 1, 'a wrapped exchange insertion must schedule auto-read exactly once');
}

// S5 fix check (STOP/Escape): with no reader session active, Escape must pass
// through to later page listeners unclaimed; during a session it stays claimed.
async function testEscapeHotkeyPassThrough() {
    const { window, document, reader } = await loadUserscript(SYNTHETIC_HTML, 'https://chatgpt.com/c/escape');
    let pageEscapeHits = 0;
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') pageEscapeHits += 1;
    });
    const dispatchEscape = () => {
        const event = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        return event;
    };

    let stopCalls = 0;
    reader.stopTTS = () => { stopCalls += 1; };

    // No session: reaches the later page listener, uncancelled, no stopTTS.
    let event = dispatchEscape();
    assert.strictEqual(pageEscapeHits, 1, 'Escape with no session must reach later page listeners');
    assert.strictEqual(event.defaultPrevented, false, 'Escape with no session must not be preventDefault-ed');
    assert.strictEqual(stopCalls, 0, 'Escape with no session must not stop TTS');

    // Session active: still claimed, page listener still blocked. Use
    // continuousReadingActive — a bare stale ttsActive is exactly what
    // clearStalePlaybackFlagsIfIdle() is meant to clear before the check.
    reader.continuousReadingActive = true;
    event = dispatchEscape();
    assert.strictEqual(pageEscapeHits, 1, 'Escape during a session must still be claimed (page listener blocked)');
    assert.strictEqual(event.defaultPrevented, true, 'Escape during a session must still be cancelled');
    assert.strictEqual(stopCalls, 1, 'Escape during a session must stop TTS');
}

// S5 fix check: saved/local pages (not chatgpt.com) keep the pre-port lookup —
// the LAST legacy assistant element — so auto-read can start there.
async function testSavedPageLegacyLatestAssistantLookup() {
    const { document, reader } = await loadUserscript(LEGACY_SAVED_HTML, 'https://example.test/saved/conversation', { expectChatGPTPage: false });
    const assistants = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    assert.ok(assistants.length >= 2, 'legacy fixture must carry >= 2 assistant elements');
    assert.strictEqual(reader.getLatestAssistantMessageElement(), assistants[assistants.length - 1],
        'saved pages must return the LAST legacy assistant element');
}

// S5 fix check: on saved pages the user-message exclusion by DOM role is NOT
// applied — with Saved HTML detection OFF a legacy user paragraph stays readable;
// with detection ON the text heuristic still governs.
async function testSavedPageUserParagraphReadableWithDetectionOff() {
    const { document, reader } = await loadUserscript(LEGACY_SAVED_HTML, 'https://example.test/saved/readable', { expectChatGPTPage: false });
    const userParagraph = document.getElementById('legacy-user-p');
    assert.ok(userParagraph, 'legacy fixture must carry the user paragraph');
    // jsdom has no layout: give the paragraph a real offsetParent so the
    // visibility precheck passes (a rendered element would always have one).
    Object.defineProperty(userParagraph, 'offsetParent', { value: document.body, configurable: true });

    reader.CONFIG.READ_USER_MESSAGES = false;
    reader.CONFIG.SAVED_HTML_USER_DETECTION = false;
    assert.strictEqual(reader.isVisiblyReadable(userParagraph), true,
        'saved page + detection OFF: legacy user paragraph must stay readable');

    reader.CONFIG.SAVED_HTML_USER_DETECTION = true;
    assert.strictEqual(reader.isVisiblyReadable(userParagraph), false,
        'saved page + detection ON: the user-pattern heuristic still excludes the paragraph');
}

(async () => {
    await testComposerAndSendButtonResolve();
    await testExchangeEnumerationOnSeptFixture();
    await testAutoReadPicksLastAssistantMarkdownRoot();
    await testCopyButtonPlacementAndContent();
    await testBootInstallsWindowCaptureHotkeyHandler();
    await testWrappedExchangeInsertionSchedulesAutoRead();
    await testEscapeHotkeyPassThrough();
    await testSavedPageLegacyLatestAssistantLookup();
    await testSavedPageUserParagraphReadableWithDetectionOff();
    console.log('OK all userscript driftwatch fixture flows passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
