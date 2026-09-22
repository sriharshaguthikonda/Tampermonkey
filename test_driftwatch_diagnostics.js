const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const driftwatchRoot = path.join(repoRoot, '..', 'driftwatch');
const { JSDOM } = require(path.join(driftwatchRoot, 'node_modules', 'jsdom'));

const MODULES = [
    '00-namespace.js',
    '08-observer-bus.js',
    '22-driftwatch.js',
    '23-resolution.js',
    '25-prompt-send-part1.js',
    '65-prewrap.js'
];

const FIXTURES = [
    ['idle', path.join(driftwatchRoot, 'fixtures', 'chatgpt.com', 'current', 'desktop', 'conversation.html')],
    ['composing', path.join(driftwatchRoot, 'fixtures', 'chatgpt.com', 'current', 'composing', 'conversation.html')],
    ['streaming', path.join(driftwatchRoot, 'fixtures', 'chatgpt.com', 'current', 'streaming', 'conversation.html')]
];

function loadReader(html, url = 'https://chatgpt.com/c/fixture') {
    const dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only'
    });
    const context = dom.getInternalVMContext();
    for (const name of MODULES) {
        const modulePath = path.join(repoRoot, 'edge-extension', 'modules', name);
        vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    }
    const reader = dom.window.__TTSNS.TTSReader;
    reader.isChatGPTPage = true;
    const panel = dom.window.document.createElement('div');
    panel.id = 'tts-diagnostics-panel';
    panel.setAttribute('data-tts-ui', 'true');
    dom.window.document.body.appendChild(panel);
    reader.diagnosticsPanel = panel;
    return { dom, document: dom.window.document, reader };
}

function assertDriftingBadge(reader, document, anchor) {
    reader.auditDriftwatchOnce();
    const badge = document.getElementById('tts-drift-badge');
    assert.ok(badge, 'canary must render the diagnostics badge');
    assert.match(badge.textContent, /^drift: [1-9]\d*$/);
    assert.ok(badge.title.split(', ').includes(anchor), `tooltip must name ${anchor}`);
    return badge;
}

function assertBadge(reader, document, expected) {
    reader.auditDriftwatchOnce();
    const badge = document.getElementById('tts-drift-badge');
    assert.ok(badge, 'canary must render the diagnostics badge');
    assert.strictEqual(badge.parentElement, document.getElementById('tts-diagnostics-panel'));
    assert.strictEqual(badge.textContent, `drift: ${expected}`);
    reader.updateDiagnosticsPanel();
    assert.strictEqual(document.getElementById('tts-drift-badge'), badge, 'timing updates must preserve the badge');
    return badge;
}

for (const [state, fixture] of FIXTURES) {
    const { dom, document, reader } = loadReader(fs.readFileSync(fixture, 'utf8'));
    if (state === 'composing') {
        const composer = reader.resolveSingleton('composer');
        assert.ok(composer, 'composing fixture must contain the composer anchor');
        composer.textContent = 'fixture-input';
    }
    assert.strictEqual(reader.getAuditState(), state, `${state} fixture must classify as ${state}`);
    assertBadge(reader, document, 0);
    dom.window.close();
}

{
    const { dom, document, reader } = loadReader(
        '<!doctype html><html><body><textarea id="pending-home-input"></textarea></body></html>',
        'https://chatgpt.com/'
    );
    assert.strictEqual(reader.getAuditState(), 'idle');
    assertBadge(reader, document, 0);
    dom.window.close();
}

const COMPOSER_ONLY = '<!doctype html><html><body><form data-chatgpt-composer>'
    + '<div data-composer-markdown contenteditable="true" role="textbox"><p><br></p></div>'
    + '</form></body></html>';

{
    const { dom, document, reader } = loadReader(COMPOSER_ONLY, 'https://chatgpt.com/');
    assertBadge(reader, document, 0);
    dom.window.close();
}

{
    const { dom, document, reader } = loadReader(COMPOSER_ONLY, 'https://chatgpt.com/c/test-id');
    assertDriftingBadge(reader, document, 'exchangeRoot');
    dom.window.close();
}

{
    const idleFixture = FIXTURES.find(([state]) => state === 'idle')[1];
    const { dom, document, reader } = loadReader(fs.readFileSync(idleFixture, 'utf8'), 'https://chatgpt.com/');
    document.querySelectorAll('[data-turn-key]').forEach((exchange) => exchange.removeAttribute('data-turn-key'));
    reader.resetResolutionMemo();
    assertDriftingBadge(reader, document, 'exchangeRoot');
    dom.window.close();
}

{
    const idleFixture = FIXTURES.find(([state]) => state === 'idle')[1];
    const { dom, document, reader } = loadReader(fs.readFileSync(idleFixture, 'utf8'));
    const composer = reader.resolveSingleton('composer');
    assert.ok(composer, 'idle fixture must contain the required composer anchor');
    composer.remove();
    reader.resetResolutionMemo();
    const badge = assertBadge(reader, document, 1);
    assert.ok(badge.title.split(', ').includes('composer'), 'tooltip must name the removed anchor');
    dom.window.close();
}

{
    // A chat whose replies carry no code: codeBlock is content-optional (pack min 0),
    // so zero matches audit as 'absent' and must not count as drift.
    const idleFixture = FIXTURES.find(([state]) => state === 'idle')[1];
    const { dom, document, reader } = loadReader(fs.readFileSync(idleFixture, 'utf8'));
    let removed = 0;
    for (const exchangeEl of reader.exchanges()) {
        for (const codeEl of reader.resolveAllInExchange('codeBlock', exchangeEl)) {
            codeEl.remove();
            removed += 1;
        }
    }
    assert.ok(removed > 0, 'idle fixture must contain code blocks to remove');
    reader.resetResolutionMemo();
    const badge = assertBadge(reader, document, 0);
    assert.ok(!badge.title.split(', ').includes('codeBlock'), 'tooltip must not name codeBlock');
    dom.window.close();
}

console.log('PASS test_driftwatch_diagnostics');
