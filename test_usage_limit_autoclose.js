const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

// jsdom comes from the driftwatch repo (same convention as test_driftwatch_exchange_features.js).
const { JSDOM } = require(path.join(repoRoot, '..', 'driftwatch', 'node_modules', 'jsdom'));

const MODULES = ['00-namespace.js', '22-driftwatch.js', '23-resolution.js', '35-server-tts.js'];

// S3.11 (R8): structure-only markup with synthetic tokens, never page text.
function loadReader(bodyHtml) {
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
        url: 'https://chatgpt.com/c/fixture',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    // jsdom has no layout: mirror Element.checkVisibility() from display:none and [hidden].
    window.Element.prototype.checkVisibility = function () {
        for (let el = this; el; el = el.parentElement) {
            if (el.hidden || window.getComputedStyle(el).display === 'none') return false;
        }
        return true;
    };
    const context = dom.getInternalVMContext();
    for (const name of MODULES) {
        const modulePath = path.join(repoRoot, 'edge-extension', 'modules', name);
        vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    }
    const reader = window.__TTSNS.TTSReader;
    reader.isChatGPTPage = true;
    reader.CONFIG.AUTO_CLOSE_LIMIT_WARNING = true;
    reader.CONFIG.LIMIT_WARNING_DELAY_MS = 0;
    return { window, document: window.document, reader };
}

function recordClicks(document) {
    const clicked = [];
    document.addEventListener('click', (event) => clicked.push(event.target.id || '(no id)'), true);
    return clicked;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function testNoDialogIsNoop() {
    const { reader, document } = loadReader('<main><button id="plain">x</button></main>');
    reader.packData = () => ['button'];
    const clicked = recordClicks(document);
    assert.doesNotThrow(() => reader.checkAndCloseLimitWarnings());
    await settle();
    assert.deepStrictEqual(clicked, [], 'no dialog: nothing is clicked');
}

async function testCloseShapedDecoyOutsideDialogIsNeverClicked() {
    const { reader, document } = loadReader(
        '<main><p>limit-token</p><button id="decoy" aria-label="Close">x</button></main>');
    reader.packData = () => ['button[aria-label="Close"]'];
    const clicked = recordClicks(document);
    reader.checkAndCloseLimitWarnings();
    await settle();
    assert.deepStrictEqual(clicked, [], 'a Close-shaped button outside any dialog must never be clicked');
}

async function testPackedSelectorClicksOnlyInsideVisibleLimitDialog() {
    const { reader, document } = loadReader(`
        <button id="outside" class="stub-close">x</button>
        <div role="dialog"><p>limit-token</p>
            <button id="target" class="stub-close">x</button>
            <button id="other" aria-label="Close">x</button>
        </div>
        <div role="dialog" style="display:none"><p>limit-token</p><button id="hidden-target" class="stub-close">x</button></div>
        <div role="dialog"><p>unrelated-token</p><button id="unrelated-target" class="stub-close">x</button></div>`);
    reader.packData = (key) => (key === 'usageLimitClose' ? ['button.stub-close'] : []);
    const clicked = recordClicks(document);
    reader.checkAndCloseLimitWarnings();
    await settle();
    assert.deepStrictEqual(clicked, ['target'], 'only the packed control inside the visible limit dialog is clicked');
}

async function testRealPackHasNoCloseListSoNothingIsClicked() {
    const { reader, document } = loadReader(
        '<div role="dialog"><p>limit-token</p><button id="close" aria-label="Close">x</button></div>');
    assert.deepStrictEqual(Array.from(reader.packData('usageLimitClose')), [], 'pack v2 carries no usageLimitClose list');
    const clicked = recordClicks(document);
    reader.checkAndCloseLimitWarnings();
    await settle();
    assert.deepStrictEqual(clicked, [], 'today the feature is a no-op');
}

const tests = [
    testNoDialogIsNoop,
    testCloseShapedDecoyOutsideDialogIsNeverClicked,
    testPackedSelectorClicksOnlyInsideVisibleLimitDialog,
    testRealPackHasNoCloseListSoNothingIsClicked
];

(async () => {
    for (const test of tests) {
        await test();
        console.log(`PASS ${test.name}`);
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
