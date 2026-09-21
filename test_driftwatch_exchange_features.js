const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

// jsdom comes from the driftwatch repo (24.1.3, `:has()` verified — same convention
// as test_driftwatch_composer_resolution.js; this repo deliberately has no node_modules).
const { JSDOM } = require(path.join(repoRoot, '..', 'driftwatch', 'node_modules', 'jsdom'));

const FIXTURE = path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-09-21-idle', 'conversation.html');

// Feature modules exercised through the S3.3 helpers (23-resolution.js), loaded in
// manifest order into the fixture's own jsdom window so bare `window`/`document`
// references inside the modules resolve against the fixture document.
const MODULES = [
    '00-namespace.js',
    '08-observer-bus.js',
    '10-lifecycle.js',
    '22-driftwatch.js',
    '23-resolution.js',
    '20-smart-copy-part1.js',
    '40-voice.js',
    '50-text.js',
    '55-selection.js',
    '70-auto-read.js'
];

// The sanitized Sept fixture carries structure only (text stripped by the privacy
// sanitizer), so every TEXT-dependent assertion runs against this hand-written
// structure-only snippet instead — synthetic tokens, never page text.
const SYNTHETIC_EXCHANGE_HTML = `<!doctype html><html><body><main>
  <article data-turn-key="<uuid>-e1" data-oracle-collection="exchangeRoot">
    <div data-content-search-unit-key="<uuid>:0:user" data-oracle-exchange="userUnit">user-tokens-here</div>
    <div data-content-search-unit-key="<uuid>:2:assistant" data-oracle-exchange="assistantUnit">
      <div data-markdown-text-style="assistant-message" data-oracle-exchange="assistantMarkdownRoot">
        <p>alpha beta gamma delta</p>
        <a data-testid="chatgpt-citation">ref-pill-token</a>
        <span data-markdown-copy="exclude">toolbar-token</span>
      </div>
    </div>
  </article>
</main></body></html>`;

function loadReader(html, url) {
    const dom = new JSDOM(html || fs.readFileSync(FIXTURE, 'utf8'), {
        url: url || 'https://chatgpt.com/c/fixture',
        runScripts: 'outside-only'
    });
    const context = dom.getInternalVMContext();
    for (const name of MODULES) {
        const modulePath = path.join(repoRoot, 'edge-extension', 'modules', name);
        vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    }
    const ns = dom.window.__TTSNS;
    // 10-lifecycle.js (not loaded here) sets this during real boot via detectContext().
    ns.TTSReader.isChatGPTPage = true;
    return { dom, window: dom.window, document: dom.window.document, reader: ns.TTSReader, ns };
}

function makeElementsVisible(window) {
    Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() { return window.document.body; }
    });
}

function exchangeMarkup(key) {
    return `<article data-turn-key="${key}">
      <div data-content-search-unit-key="${key}:0:user"><p>${key}-u</p></div>
      <div data-content-search-unit-key="${key}:2:assistant">
        <div data-markdown-text-style="assistant-message"><p>${key}-a</p></div>
      </div>
    </article>`;
}

async function testResolutionMemoExpiresAfterMicrotask() {
    const { reader, document } = loadReader(SYNTHETIC_EXCHANGE_HTML);
    const first = reader.exchanges();
    assert.strictEqual(reader.exchanges(), first, 'same tick must reuse the exchange array');

    const main = document.querySelector('main');
    main.insertAdjacentHTML('beforeend', exchangeMarkup('memo-next'));
    assert.strictEqual(reader.exchanges(), first, 'same-tick DOM changes must not rebuild the memo');
    await Promise.resolve();
    assert.strictEqual(reader.exchanges().length, first.length + 1, 'next microtask must see DOM changes');
    console.log('PASS testResolutionMemoExpiresAfterMicrotask');
}

function testExchangesAndScopedPerExchangeResolution() {
    const { reader, document } = loadReader();

    // Resolution model rule 1: exchangeRoot is the only document-wide enumeration.
    const exchangeList = reader.exchanges();
    const markedExchanges = document.querySelectorAll('[data-oracle-collection="exchangeRoot"]');
    assert.ok(exchangeList.length >= 2, 'fixture must expose >= 2 exchanges');
    assert.strictEqual(exchangeList.length, markedExchanges.length, 'exchanges() must equal the collection oracle');

    const assistantUnits = new Set();
    for (const exchangeEl of exchangeList) {
        const userUnit = reader.resolveInExchange('userUnit', exchangeEl);
        const assistantUnit = reader.resolveInExchange('assistantUnit', exchangeEl);
        const markdownRoot = reader.resolveInExchange('assistantMarkdownRoot', exchangeEl);
        assert.ok(userUnit, 'userUnit must resolve in every exchange');
        assert.ok(assistantUnit, 'assistantUnit must resolve in every exchange');
        assert.ok(markdownRoot, 'assistantMarkdownRoot must resolve in every exchange');
        assert.ok(exchangeEl.contains(userUnit) && exchangeEl.contains(assistantUnit),
            'units must be scoped inside their own exchange');
        assert.ok(assistantUnit.contains(markdownRoot), 'markdown root must sit inside the assistant unit');
        assert.strictEqual(userUnit.getAttribute('data-oracle-exchange'), 'userUnit');
        assert.strictEqual(assistantUnit.getAttribute('data-oracle-exchange'), 'assistantUnit');
        assert.strictEqual(markdownRoot.getAttribute('data-oracle-exchange'), 'assistantMarkdownRoot');
        assistantUnits.add(assistantUnit);
    }

    // Scoped resolution: distinct exchanges yield distinct units — a document-wide
    // resolve would collapse them (Resolution model rule 4).
    assert.strictEqual(assistantUnits.size, exchangeList.length);
    console.log(`PASS testExchangesAndScopedPerExchangeResolution (${exchangeList.length} exchanges)`);
}

function testSmartCopyRolesAndBoundariesFromExchangeOrder() {
    const { reader } = loadReader();
    const exchangeList = reader.exchanges();
    const units = reader.getConversationMessageElements();

    assert.strictEqual(units.length, exchangeList.length * 2, 'one user + one assistant unit per exchange');
    assert.deepStrictEqual(
        units.map((el) => reader.getMessageRoleFromElement(el)),
        exchangeList.flatMap(() => ['user', 'assistant']),
        'roles must come from per-exchange unit anchors in DOM order (user first, S0.2)'
    );
    assert.deepStrictEqual(
        units.map((el) => reader.getConversationTurnIndex(el)),
        exchangeList.flatMap(() => [null, null]),
        'ChatGPT viewport exchange indices must not become persistent turn indices'
    );
    assert.deepStrictEqual(
        units.map((el) => reader.getMessageOrderInsideTurn(el)),
        exchangeList.flatMap(() => [0, 1]),
        'inside-turn order must be unit DOM order within the exchange'
    );
    assert.strictEqual(reader.isConversationSurfaceAvailable(), true);

    for (let i = 0; i < exchangeList.length; i += 1) {
        const userUnit = units[i * 2];
        const assistantUnit = units[i * 2 + 1];
        const markdownRoot = reader.resolveInExchange('assistantMarkdownRoot', exchangeList[i]);
        // Content source: assistant unit -> its exchange's markdown root; user unit reads itself.
        assert.strictEqual(reader.getPreferredMessageContentNode(assistantUnit), markdownRoot);
        assert.strictEqual(reader.getPreferredMessageContentNode(userUnit), userUnit);
        // Role by containment, not attribute: a deep node inside the assistant unit.
        assert.strictEqual(reader.getMessageRoleFromElement(markdownRoot), 'assistant');
        assert.strictEqual(reader.getMessageRoleFromElement(userUnit), 'user');
    }
    console.log('PASS testSmartCopyRolesAndBoundariesFromExchangeOrder');
}

function testParagraphExtractionExcludesCodeAndToolbarSentinels() {
    const html = `<!doctype html><html><body><main>
      <article data-turn-key="structure-only">
        <div data-content-search-unit-key="structure-only:2:assistant">
          <div data-markdown-text-style="assistant-message">
            <div data-markdown-copy="code-block"><p id="code-sentinel">x</p></div>
            <p id="toolbar-sentinel" data-markdown-copy="exclude">x</p>
            <p id="normal-paragraph">x</p>
          </div>
        </div>
      </article>
    </main></body></html>`;
    const { reader, document, window } = loadReader(html);
    makeElementsVisible(window);

    const result = reader.findAllParagraphs();
    assert.strictEqual(result.length, 1, 'only the normal paragraph must be extracted');
    assert.strictEqual(result[0].element, document.getElementById('normal-paragraph'));
    assert.ok(!result.some((entry) => entry.element === document.getElementById('code-sentinel')));
    assert.ok(!result.some((entry) => entry.element === document.getElementById('toolbar-sentinel')));
    console.log('PASS testParagraphExtractionExcludesCodeAndToolbarSentinels');
}

function testSmartCopyKeysSurviveViewportReplacement() {
    const html = `<!doctype html><html><body><main>${exchangeMarkup('A')}${exchangeMarkup('B')}</main></body></html>`;
    const { reader, document } = loadReader(html);
    const orderedKeys = [];
    const entriesByKey = new Map();
    let seenCounter = 0;
    const recordVisibleEntries = () => {
        reader.collectSmartCopyEntriesFromMessages(reader.getConversationMessageElements()).forEach((entry) => {
            if (entriesByKey.has(entry.key)) return;
            entry.firstSeenOrder = seenCounter++;
            entriesByKey.set(entry.key, entry);
            orderedKeys.push(entry.key);
        });
    };

    recordVisibleEntries();
    document.querySelector('main').innerHTML = `${exchangeMarkup('C')}${exchangeMarkup('D')}`;
    reader.resetResolutionMemo();
    recordVisibleEntries();

    const entries = reader.sortSmartCopyEntries(orderedKeys.map((key) => entriesByKey.get(key)));
    assert.strictEqual(entries.length, 8, 'four exchanges must retain both units across viewports');
    assert.deepStrictEqual(Array.from(entries, (entry) => entry.key), [
        'id:A:user', 'id:A:assistant', 'id:B:user', 'id:B:assistant',
        'id:C:user', 'id:C:assistant', 'id:D:user', 'id:D:assistant'
    ]);
    console.log('PASS testSmartCopyKeysSurviveViewportReplacement');
}

function testLegacyDiscoveryAndUserFilteringOffChatGPT() {
    const html = `<!doctype html><html><body><main>
      <div data-message-author-role="user"><p id="legacy-user">x</p></div>
      <div data-message-author-role="assistant"><p id="legacy-assistant">x</p></div>
    </main></body></html>`;

    for (const url of ['http://localhost/saved', 'file:///saved.html']) {
        const { reader, document, window } = loadReader(html, url);
        makeElementsVisible(window);
        reader.detectContext();
        reader.CONFIG.READ_USER_MESSAGES = false;

        const messages = reader.getConversationMessageElements();
        assert.strictEqual(messages.length, 2, `${url} must retain legacy discovery`);
        assert.deepStrictEqual(Array.from(messages, (element) => reader.getMessageRoleFromElement(element)), ['user', 'assistant']);
        const paragraphs = reader.findAllParagraphs();
        assert.strictEqual(paragraphs.length, 1, `${url} must exclude the legacy user paragraph`);
        assert.strictEqual(paragraphs[0].element, document.getElementById('legacy-assistant'));
        assert.ok(!paragraphs.some((entry) => entry.element === document.getElementById('legacy-user')));
    }
    console.log('PASS testLegacyDiscoveryAndUserFilteringOffChatGPT');
}

function testCitationExclusionAndAutoReadEligibilityOnSyntheticExchange() {
    const { reader, document } = loadReader(SYNTHETIC_EXCHANGE_HTML, 'https://chatgpt.com/c/synthetic');

    // Citation exclusion comes from pack data (citationExclusions): the pill element
    // itself extracts to '', and its token never appears in the markdown-root text
    // (length/content asserts against synthetic tokens only).
    const markdownRoot = document.querySelector('[data-markdown-text-style="assistant-message"]');
    const citation = document.querySelector('[data-testid="chatgpt-citation"]');
    assert.ok(markdownRoot && citation);
    assert.strictEqual(reader.getRawTextFromElement(citation), '');
    const extracted = reader.getRawTextFromElement(markdownRoot);
    assert.ok(extracted.includes('alpha beta gamma delta'), 'prose token must survive extraction');
    assert.ok(!extracted.includes('ref-pill-token'), 'citation token must be excluded');
    assert.ok(extracted.length < markdownRoot.textContent.length, 'extraction must be shorter than raw subtree');

    // S3.4: eligibility carries no role-attribute guard — the resolved assistant unit
    // (no data-message-author-role on the Sept DOM) with text is eligible.
    const exchangeEl = reader.exchanges()[0];
    const assistantUnit = reader.resolveInExchange('assistantUnit', exchangeEl);
    assert.ok(assistantUnit);
    assert.strictEqual(assistantUnit.hasAttribute('data-message-author-role'), false);
    assert.strictEqual(reader.isAutoReadEligibleMessage(assistantUnit), true);
    assert.strictEqual(reader.isAutoReadEligibleMessage(null), false);
    assert.strictEqual(reader.getLatestAssistantMessageElement(), assistantUnit);
    console.log('PASS testCitationExclusionAndAutoReadEligibilityOnSyntheticExchange');
}

function testPackDataKeysNonEmpty() {
    const { reader } = loadReader();
    const keys = ['citationExclusions', 'ignoreSelectors', 'nativeSelectionAllowlist', 'styleTargetSelectors'];
    for (const key of keys) {
        const value = reader.packData(key);
        assert.ok(Array.isArray(value) && value.length > 0, `packData('${key}') must be a non-empty array`);
        assert.ok(value.every((item) => typeof item === 'string' && item), `packData('${key}') entries must be strings`);
    }
    // Fail-soft on unknown keys (D7). (Length check, not deepStrictEqual — the array
    // is created inside the jsdom realm, so its prototype differs from Node's.)
    assert.strictEqual(reader.packData('no-such-key').length, 0);
    console.log(`PASS testPackDataKeysNonEmpty (${keys.length} keys)`);
}

function testIgnoreSelectorComposition() {
    const { reader } = loadReader();
    const effective = reader.getIgnoreSelectors();

    // Generic/own entries stay in code; site entries append from pack data on chatgpt.com.
    assert.ok(effective.startsWith('nav, script'), 'generic code entries must lead');
    assert.ok(effective.includes('[data-tts-ui]'), 'own-UI entry must stay in code');
    assert.ok(effective.includes('.sr-only') && effective.includes('.settings-header'),
        'site entries must come from pack data');
    assert.ok(effective.includes('#content-root'), 'live site entry must be present via the pack');
    assert.ok(!effective.includes('#thread-bottom-container'), 'dead selector must be gone');

    // 10-lifecycle.js:63 non-ChatGPT override parity: off chatgpt.com the effective
    // selector is exactly CONFIG.IGNORE_SELECTORS (whatever lifecycle last set).
    reader.isChatGPTPage = false;
    assert.strictEqual(reader.getIgnoreSelectors(), reader.CONFIG.IGNORE_SELECTORS);
    console.log('PASS testIgnoreSelectorComposition');
}

async function testObserverBusDeliversExchangeScopedBatches() {
    const { ns, reader, document } = loadReader();
    const batches = [];
    ns.observerBus.subscribeExchanges({
        name: 'test-bus',
        debounceMs: 5,
        maxWaitMs: 40,
        onExchangeChange: (batch) => batches.push(batch)
    });

    // A deep node appended inside an exchange maps to THAT exchange.
    const exchangeEl = reader.exchanges()[0];
    const assistantUnit = reader.resolveInExchange('assistantUnit', exchangeEl);
    const deep = document.createElement('p');
    assistantUnit.appendChild(deep);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(batches.length, 1, 'one batch for the in-exchange mutation');
    assert.strictEqual(batches[0].exchanges.length, 1, 'batch must carry exactly one exchange');
    assert.strictEqual(batches[0].exchanges[0], exchangeEl, 'batch must carry the touched exchange');

    // A single added wrapper can contain a newly rendered exchange.
    const wrapper = document.createElement('div');
    wrapper.innerHTML = exchangeMarkup('wrapped');
    const wrappedExchange = wrapper.firstElementChild;
    document.body.appendChild(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(batches.length, 2, 'one batch for the wrapper-contained exchange');
    assert.strictEqual(batches[1].exchanges.length, 1);
    assert.strictEqual(batches[1].exchanges[0], wrappedExchange);

    // Own-UI node outside every exchange: filtered (own-UI noise + no exchange membership).
    const own = document.createElement('div');
    own.setAttribute('data-tts-ui', 'true');
    document.body.appendChild(own);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(batches.length, 2, 'own-UI node outside exchanges must not wake the bus');

    // Plain node outside every exchange: still no batch — relevance IS exchange membership.
    const plain = document.createElement('div');
    document.body.appendChild(plain);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(batches.length, 2, 'out-of-exchange mutation must not wake the bus');
    console.log('PASS testObserverBusDeliversExchangeScopedBatches');
}

(async () => {
    await testResolutionMemoExpiresAfterMicrotask();
    testExchangesAndScopedPerExchangeResolution();
    testSmartCopyRolesAndBoundariesFromExchangeOrder();
    testSmartCopyKeysSurviveViewportReplacement();
    testParagraphExtractionExcludesCodeAndToolbarSentinels();
    testLegacyDiscoveryAndUserFilteringOffChatGPT();
    testCitationExclusionAndAutoReadEligibilityOnSyntheticExchange();
    testPackDataKeysNonEmpty();
    testIgnoreSelectorComposition();
    await testObserverBusDeliversExchangeScopedBatches();
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
