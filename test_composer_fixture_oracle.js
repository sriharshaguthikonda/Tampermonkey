const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

// jsdom from the driftwatch repo (24.1.3, `:has()` verified — PLAN S0.9); this repo has
// no node_modules by design. The old hand-rolled DOM matcher could not parse `:has()`,
// which pack v2 needs, and it could not run the driftwatch engine's inside: containment
// (no .contains), so the extension modules now load into a real DOM instead.
const { JSDOM } = require(path.join(repoRoot, '..', 'driftwatch', 'node_modules', 'jsdom'));

// S3.13: the oracle runs against BOTH frontiers. July = legacy vocabulary
// (#prompt-textarea composer, testid Send — state 'composing' since its Send is
// present+enabled). Sept 2026-09-21 = idle-empty (Send absent is CORRECT) and
// composing (enabled submit Send).
const FIXTURES = [
    {
        name: 'july-composer',
        html: path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-07-10-composer', 'composer.html'),
        composerOracle: 'composer-input',
        sendOracle: 'send-button'
    },
    {
        name: 'sept-idle',
        html: path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-09-21-idle', 'conversation.html'),
        composerOracle: 'composer',
        sendOracle: null
    },
    {
        name: 'sept-composing',
        html: path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-09-21-composing', 'conversation.html'),
        composerOracle: 'composer',
        sendOracle: 'sendButton'
    }
];

const MODULES = [
    '00-namespace.js',
    '22-driftwatch.js',
    '23-resolution.js',
    '25-prompt-send-part1.js'
];

function loadReader(html) {
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/', runScripts: 'dangerously' });
    const context = dom.getInternalVMContext();
    for (const name of MODULES) {
        const modulePath = path.join(repoRoot, 'edge-extension', 'modules', name);
        vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    }
    return { dom, reader: dom.window.__TTSNS.TTSReader };
}

function testComposerFixtureOracle() {
    for (const fixture of FIXTURES) {
        const html = fs.readFileSync(fixture.html, 'utf8');
        const { dom, reader } = loadReader(html);
        const doc = dom.window.document;

        const promptArea = reader.findPromptArea();
        assert.ok(promptArea, `${fixture.name}: findPromptArea() found nothing against the fixture`);
        assert.strictEqual(promptArea.getAttribute('data-oracle'), fixture.composerOracle,
            `${fixture.name}: findPromptArea() matched wrong element`);
        assert.ok(!promptArea.hasAttribute('data-oracle-negative'),
            `${fixture.name}: findPromptArea() returned a negative-oracle element`);

        // The composer must be the form-scoped one, never the code-block editor that
        // shares contenteditable+role=textbox inside an exchange.
        const composerForm = reader.findComposerForm();
        assert.ok(composerForm, `${fixture.name}: findComposerForm() found nothing`);
        assert.ok(composerForm.contains(promptArea),
            `${fixture.name}: composer resolved outside the composer form`);
        const codeEditor = doc.querySelector('[aria-label="Edit code"]');
        if (codeEditor) {
            assert.notStrictEqual(promptArea, codeEditor, `${fixture.name}: composer is the code-block editor`);
            assert.ok(!composerForm.contains(codeEditor), `${fixture.name}: code editor inside the composer form`);
        }

        const sendButton = reader.findSendButton();
        if (fixture.sendOracle === null) {
            assert.strictEqual(sendButton, null,
                `${fixture.name}: findSendButton() must return null while idle-empty`);
        } else {
            assert.ok(sendButton, `${fixture.name}: findSendButton() found nothing`);
            assert.strictEqual(sendButton.getAttribute('data-oracle'), fixture.sendOracle,
                `${fixture.name}: findSendButton() matched wrong element`);
        }

        // Mic exclusion is a CODE invariant (00-DESIGN #19): Dictate is a sibling button
        // inside the same composer form, enabled, and must never be a send target.
        const dictate = doc.querySelector('button[aria-label="Dictate"], button[aria-label="Start dictation"]');
        if (dictate) {
            assert.strictEqual(reader.isSendButtonElement(dictate), false,
                `${fixture.name}: Dictate mic classified as a send button`);
            assert.notStrictEqual(sendButton, dictate, `${fixture.name}: send target is the Dictate mic`);
        }
    }
    console.log('PASS testComposerFixtureOracle (july-composer + sept-idle + sept-composing)');
}

function testResolutionHelpers() {
    const html = fs.readFileSync(FIXTURES[2].html, 'utf8');
    const { reader } = loadReader(html);

    // S3.3 helpers: exchanges() enumerates document-wide (the ONLY anchor allowed to),
    // resolveInExchange scopes per exchange, resolveSingleton carries state.
    const exchanges = reader.exchanges();
    assert.ok(Array.isArray(exchanges) && exchanges.length >= 3,
        'exchanges() returned fewer than 3 exchanges against sept-composing');

    const userUnit = reader.resolveInExchange('userUnit', exchanges[0]);
    assert.ok(userUnit, 'resolveInExchange(userUnit) failed in exchange 0');
    assert.strictEqual(userUnit.getAttribute('data-oracle-exchange'), 'userUnit',
        'resolveInExchange(userUnit) matched wrong element in exchange 0');

    const assistantUnit = reader.resolveInExchange('assistantUnit', exchanges[exchanges.length - 1]);
    assert.ok(assistantUnit, 'resolveInExchange(assistantUnit) failed in the last exchange');
    assert.strictEqual(assistantUnit.getAttribute('data-oracle-exchange'), 'assistantUnit',
        'resolveInExchange(assistantUnit) matched wrong element in the last exchange');

    // Per-exchange resolution must stay INSIDE its exchange (never another exchange's unit).
    const foreign = reader.resolveInExchange('userUnit', exchanges[exchanges.length - 1]);
    if (foreign) {
        assert.ok(exchanges[exchanges.length - 1].contains(foreign),
            'resolveInExchange returned an element outside its own exchange');
    }

    // resolveSingleton with state: idle page must NOT yield a send button.
    const idleHtml = fs.readFileSync(FIXTURES[1].html, 'utf8');
    const { reader: idleReader } = loadReader(idleHtml);
    assert.strictEqual(idleReader.resolveSingleton('sendButton', 'composing'), null,
        'idle-empty page resolved a send button');
    assert.ok(idleReader.resolveSingleton('composerForm'),
        'idle page must still resolve the composer form');

    // Missing engine fails soft: helpers on a bare reader (no driftwatch) return
    // null/[], never throw (D7 pattern).
    const bareDom = new JSDOM('<html><body></body></html>', { url: 'https://chatgpt.com/', runScripts: 'dangerously' });
    const bareCtx = bareDom.getInternalVMContext();
    const nsPath = path.join(repoRoot, 'edge-extension', 'modules', '00-namespace.js');
    const resPath = path.join(repoRoot, 'edge-extension', 'modules', '23-resolution.js');
    vm.runInContext(fs.readFileSync(nsPath, 'utf8'), bareCtx, { filename: nsPath });
    vm.runInContext(fs.readFileSync(resPath, 'utf8'), bareCtx, { filename: resPath });
    const bareReader = bareDom.window.__TTSNS.TTSReader;
    // (length check, not deepStrictEqual — the array comes from the jsdom realm)
    assert.strictEqual(bareReader.exchanges().length, 0, 'exchanges() must fail soft to []');
    assert.strictEqual(bareReader.resolveSingleton('composer'), null, 'resolveSingleton must fail soft to null');
    assert.strictEqual(bareReader.resolveInExchange('userUnit', bareDom.window.document.body), null,
        'resolveInExchange must fail soft to null');
    console.log('PASS testResolutionHelpers');
}

// S3.8 lazy new-chat page: before the first interaction there is NO form and NO
// contenteditable — only the pre-hydration textarea stub and a disabled type=button
// Send decoy that lives outside any form. Hand-written HTML, no page text.
const LAZY_HTML = `<!doctype html>
<html>
<body>
<main>
<textarea id="pending-home-input" data-pending-input-initialized=""></textarea>
<button type="button" aria-label="Send" disabled="" data-oracle-negative="1"></button>
</main>
</body>
</html>`;

async function testLazyComposerPasteFlow() {
    // Case A: the real composer never mounts — the stub write happens, nothing is
    // clicked, and the bounded wait fails soft.
    const caseA = loadReader(LAZY_HTML);
    const caseADoc = caseA.dom.window.document;
    const stub = caseADoc.querySelector('textarea#pending-home-input');
    const decoySend = caseADoc.querySelector('button[aria-label="Send"]');
    assert.ok(stub && decoySend, 'lazy fixture missing stub or decoy send');
    const clicks = [];
    decoySend.click = () => clicks.push(1);

    assert.strictEqual(caseA.reader.findComposerForm(), null, 'lazy page must have no composer form');
    assert.strictEqual(caseA.reader.findPromptArea(), null, 'lazy page must have no composer');
    assert.strictEqual(caseA.reader.findPendingComposerInput(), stub, 'pendingComposerInput must resolve the stub');
    assert.strictEqual(caseA.reader.findSendButton(), null,
        'disabled type=button Send outside any form must never be the send target');

    const applied = await caseA.reader.applyPromptText('synthetic prompt text', { waitMs: 300 });
    assert.strictEqual(applied, false, 'applyPromptText must fail when the composer never mounts');
    assert.strictEqual(stub.value, 'synthetic prompt text',
        'applyPromptText must write the stub via the native textarea setter');
    assert.strictEqual(clicks.length, 0, 'the disabled decoy Send was clicked');

    // Case B: the page mounts the real composer shortly after the stub write (as the
    // live page does ~1.5-3 s). The wait picks it up; jsdom does not carry the text
    // over, so the extension must land it on the real composer itself.
    const caseB = loadReader(LAZY_HTML);
    const caseBDoc = caseB.dom.window.document;
    const caseBClicks = [];
    caseBDoc.querySelector('button[aria-label="Send"]').click = () => caseBClicks.push(1);

    const mountTimer = caseB.dom.window.setTimeout(() => {
        caseBDoc.body.insertAdjacentHTML('beforeend',
            '<form data-chatgpt-composer=""><div data-composer-markdown="" contenteditable="true" role="textbox" data-oracle="composer"></div></form>');
    }, 100);

    const ok = await caseB.reader.applyPromptText('synthetic prompt text', { waitMs: 3000 });
    clearTimeout(mountTimer);
    assert.strictEqual(ok, true, 'applyPromptText must succeed once the composer mounts');
    const composer = caseB.reader.findPromptArea();
    assert.ok(composer, 'mounted composer not found after applyPromptText');
    assert.ok(String(composer.textContent || '').includes('synthetic prompt text'),
        'text was not landed on the real composer');
    assert.strictEqual(caseBClicks.length, 0, 'the disabled decoy Send was clicked');
    console.log('PASS testLazyComposerPasteFlow (stub write, bounded wait, no decoy click)');
}

(async () => {
    testComposerFixtureOracle();
    testResolutionHelpers();
    await testLazyComposerPasteFlow();
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
