const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const driftwatchModulePath = path.join(repoRoot, 'edge-extension', 'modules', '22-driftwatch.js');

// jsdom comes from the driftwatch repo (24.1.3 — `:has()` incl. `:has(> ...)` verified
// against it, PLAN S0.9). This repo deliberately has no node_modules (Phase A), and the
// hand-rolled CSS matcher the old version of this test used cannot parse `:has()` —
// pack v2 needs it for composerForm strategy 2 and responseActionBar, so the fixtures
// are parsed with the real engine now.
const { JSDOM } = require(path.join(repoRoot, '..', 'driftwatch', 'node_modules', 'jsdom'));

// S3.13: the July frontier (legacy composer vocabulary — #prompt-textarea,
// unified-composer form, testid send button) AND the Sept 2026-09-21 frontier
// (data-composer-markdown composer, state-conditioned submit Send). The July fixture's
// Send is present+enabled → that fixture runs under state 'composing'; the Sept idle
// fixture is idle-EMPTY (Send present but disabled → sendButton legitimately absent);
// the Sept composing fixture has the enabled submit Send.
const FIXTURES = [
    {
        name: 'july-composer',
        html: path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-07-10-composer', 'composer.html'),
        state: 'composing',
        composerOracle: 'composer-input',
        sendOracle: 'send-button'
    },
    {
        name: 'sept-idle',
        html: path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-09-21-idle', 'conversation.html'),
        state: 'idle',
        composerOracle: 'composer',
        sendOracle: null
    },
    {
        name: 'sept-composing',
        html: path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-09-21-composing', 'conversation.html'),
        state: 'composing',
        composerOracle: 'composer',
        sendOracle: 'sendButton'
    }
];

const PER_EXCHANGE_ANCHORS = [
    'userUnit',
    'assistantUnit',
    'assistantMarkdownRoot',
    'responseActionBar',
    'copyResponseButton',
    'editMessageButton'
];

function loadDriftwatch() {
    // Same convention as the other repo tests: production file loaded via vm, not require().
    const context = { console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(driftwatchModulePath, 'utf8'), context, { filename: driftwatchModulePath });
    return context.driftwatch;
}

function loadDoc(htmlPath) {
    const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), { url: 'https://chatgpt.com/' });
    return dom.window.document;
}

// Same enabled semantics as driftwatch's core (isEnabled): strategies whose requires
// include "enabled" are swept with that filter applied, so a legitimately-disabled Send
// (the idle fixture's data-oracle-negative submit button) is judged as excluded, not as
// a strategy hit on a negative element.
function rawStrategyMatches(doc, dw, strategy) {
    let raw;
    try {
        raw = Array.from(doc.querySelectorAll(dw.compile(strategy)));
    } catch (_error) {
        return null; // selector unsupported in this DOM — not a negative-oracle failure
    }
    if ((strategy.requires || []).includes('enabled')) {
        raw = raw.filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
    }
    return raw;
}

function testComposerAndSendOraclesWithState() {
    const dw = loadDriftwatch();
    const pack = dw.packs['chatgpt.com'];
    assert.ok(pack, 'chatgpt.com pack missing from vendored driftwatch bundle');
    assert.strictEqual(pack.version, 2, 'vendored pack must be v2');

    for (const fixture of FIXTURES) {
        const doc = loadDoc(fixture.html);

        const composer = dw.resolve(pack, 'composer', doc);
        assert.strictEqual(composer.ok, true, `${fixture.name}: composer did not resolve (${composer.reason})`);
        assert.strictEqual(composer.el.getAttribute('data-oracle'), fixture.composerOracle,
            `${fixture.name}: composer matched wrong element`);

        const send = dw.resolve(pack, 'sendButton', doc, { state: fixture.state });
        if (fixture.sendOracle === null) {
            // R3: idle-empty — Send absent is the CORRECT answer, never an error.
            assert.strictEqual(send.ok, false, `${fixture.name}: sendButton unexpectedly resolved while ${fixture.state}`);
            assert.strictEqual(send.reason, 'absent', `${fixture.name}: sendButton reason=${send.reason}, expected absent`);
        } else {
            assert.strictEqual(send.ok, true, `${fixture.name}: sendButton did not resolve (${send.reason})`);
            assert.strictEqual(send.el.getAttribute('data-oracle'), fixture.sendOracle,
                `${fixture.name}: sendButton matched wrong element`);
        }

        // Negatives: no composer/sendButton strategy — not just the winner — may match a
        // data-oracle-negative element (Dictate/Start-Voice mics, the code-block editor,
        // the decoy textarea, the idle-disabled Send, model pickers).
        for (const anchorName of ['composer', 'sendButton']) {
            for (const strategy of pack.anchors[anchorName].strategies) {
                const matches = rawStrategyMatches(doc, dw, strategy);
                if (matches === null) continue;
                for (const el of matches) {
                    assert.ok(!el.hasAttribute('data-oracle-negative'),
                        `${fixture.name}: ${anchorName} strategy "${strategy.id}" matched a negative-oracle element`);
                }
            }
            const result = anchorName === 'sendButton' ? send : composer;
            for (const el of result.els) {
                assert.ok(!el.hasAttribute('data-oracle-negative'),
                    `${fixture.name}: ${anchorName} result set contains a negative-oracle element`);
            }
        }
    }
    console.log('PASS testComposerAndSendOraclesWithState (july-composer + sept-idle + sept-composing)');
}

function testSendButtonStateDiscipline() {
    const dw = loadDriftwatch();
    const pack = dw.packs['chatgpt.com'];

    // sendButton declares `expected` — a stateless resolve must refuse (unknown-state),
    // never silently fall back and click something.
    const doc = loadDoc(FIXTURES[2].html);
    const stateless = dw.resolve(pack, 'sendButton', doc);
    assert.strictEqual(stateless.ok, false);
    assert.strictEqual(stateless.reason, 'unknown-state');

    // The composing fixture's Send must be the form submit button, enabled.
    const composing = dw.resolve(pack, 'sendButton', doc, { state: 'composing' });
    assert.strictEqual(composing.ok, true);
    assert.strictEqual(composing.el.getAttribute('type'), 'submit');
    assert.strictEqual(composing.el.getAttribute('aria-label'), 'Send');
    assert.ok(!composing.el.hasAttribute('disabled'));
    console.log('PASS testSendButtonStateDiscipline');
}

function testDictateAndCodeEditorNegatives() {
    const dw = loadDriftwatch();
    const pack = dw.packs['chatgpt.com'];

    const doc = loadDoc(FIXTURES[2].html);

    // Dictate mic (composer-form sibling of Send): never a send target, in resolve
    // results or in any strategy's match set — the exclusion lives in the pack's
    // strategies AND in code (isSendButtonReady), this pins the pack side.
    const dictate = doc.querySelector('button[aria-label="Dictate"]');
    assert.ok(dictate, 'sept-composing: Dictate button not found in fixture');
    const send = dw.resolve(pack, 'sendButton', doc, { state: 'composing' });
    assert.notStrictEqual(send.el, dictate, 'sendButton resolved to the Dictate mic');
    for (const strategy of pack.anchors.sendButton.strategies) {
        const matches = rawStrategyMatches(doc, dw, strategy);
        if (matches === null) continue;
        assert.ok(!matches.includes(dictate), `sendButton strategy "${strategy.id}" matches the Dictate mic`);
    }

    // Code-block editor (contenteditable textbox inside an exchange): never the composer.
    // The composer anchor must win inside composerForm, never inside a code block.
    const codeEditor = doc.querySelector('[aria-label="Edit code"]');
    assert.ok(codeEditor, 'sept-composing: code-block editor not found in fixture');
    assert.ok(codeEditor.hasAttribute('data-oracle-negative'), 'code-block editor is not negative-marked');
    const composer = dw.resolve(pack, 'composer', doc);
    assert.notStrictEqual(composer.el, codeEditor, 'composer resolved to the code-block editor');
    const composerForm = dw.resolve(pack, 'composerForm', doc);
    assert.ok(composerForm.ok && composerForm.el.contains(composer.el),
        'composer must resolve inside the composer form');
    assert.ok(!composerForm.el.contains(codeEditor), 'code editor must live outside the composer form');
    console.log('PASS testDictateAndCodeEditorNegatives');
}

function testScopedPerExchangeResolution() {
    const dw = loadDriftwatch();
    const pack = dw.packs['chatgpt.com'];

    for (const fixture of [FIXTURES[1], FIXTURES[2]]) {
        const doc = loadDoc(fixture.html);

        // Resolution model rule 1: exchangeRoot is the ONLY document-wide enumeration;
        // its els must equal the fixture's collection oracle set.
        const exchangeRoot = dw.resolve(pack, 'exchangeRoot', doc);
        assert.strictEqual(exchangeRoot.ok, true, `${fixture.name}: exchangeRoot did not resolve`);
        const markedExchanges = Array.from(doc.querySelectorAll('[data-oracle-collection="exchangeRoot"]'));
        assert.strictEqual(exchangeRoot.els.length, markedExchanges.length,
            `${fixture.name}: exchangeRoot count !== collection oracle count`);
        for (const el of markedExchanges) {
            assert.ok(exchangeRoot.els.includes(el), `${fixture.name}: marked exchange missing from resolve().els`);
        }

        // Per-exchange anchors resolve with EACH exchange element as scope — every
        // exchange in the fixture, and each must land on that exchange's own oracle
        // marker (this is what document-wide enumeration would silently get wrong).
        assert.ok(exchangeRoot.els.length >= 2, `${fixture.name}: fixture needs >= 2 exchanges`);
        for (let i = 0; i < exchangeRoot.els.length; i++) {
            const exchangeEl = exchangeRoot.els[i];
            for (const anchorName of PER_EXCHANGE_ANCHORS) {
                const r = dw.resolve(pack, anchorName, exchangeEl, { state: fixture.state });
                assert.strictEqual(r.ok, true,
                    `${fixture.name}: ${anchorName} failed in exchange ${i} (${r.reason})`);
                assert.strictEqual(r.el.getAttribute('data-oracle-exchange'), anchorName,
                    `${fixture.name}: ${anchorName} in exchange ${i} matched wrong element`);
            }
        }
    }
    console.log('PASS testScopedPerExchangeResolution (sept-idle + sept-composing, all exchanges)');
}

testComposerAndSendOraclesWithState();
testSendButtonStateDiscipline();
testDictateAndCodeEditorNegatives();
testScopedPerExchangeResolution();
