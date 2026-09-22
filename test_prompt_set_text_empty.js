const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const { JSDOM } = require(path.join(repoRoot, '..', 'driftwatch', 'node_modules', 'jsdom'));

const MODULES = [
    '00-namespace.js',
    '22-driftwatch.js',
    '23-resolution.js',
    '25-prompt-send-part1.js',
    '25-prompt-send-part2.js'
];

function loadReader() {
    const dom = new JSDOM(
        '<!doctype html><html><body><form data-chatgpt-composer>'
        + '<div data-composer-markdown contenteditable="true" role="textbox"><p>old</p></div>'
        + '</form></body></html>',
        { url: 'https://chatgpt.com/c/synthetic', runScripts: 'outside-only' }
    );
    const context = dom.getInternalVMContext();
    for (const name of MODULES) {
        const modulePath = path.join(repoRoot, 'edge-extension', 'modules', name);
        vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    }
    const reader = dom.window.__TTSNS.TTSReader;
    reader.isChatGPTPage = true;
    return { dom, document: dom.window.document, reader };
}

function chromeExecCommand(document) {
    document.execCommand = (command, _showUi, value) => {
        const prompt = document.querySelector('[data-composer-markdown]');
        if (command === 'insertText' && value === '') return true;
        if (command === 'insertText') {
            const paragraph = document.createElement('p');
            paragraph.textContent = value;
            prompt.replaceChildren(paragraph);
            return true;
        }
        if (command === 'delete') {
            const paragraph = document.createElement('p');
            paragraph.appendChild(document.createElement('br'));
            prompt.replaceChildren(paragraph);
            return true;
        }
        return false;
    };
}

function chromeExecCommandRecorder(document) {
    chromeExecCommand(document);
    const real = document.execCommand;
    const calls = [];
    document.execCommand = (command, showUi, value) => {
        calls.push({ command, value });
        return real(command, showUi, value);
    };
    return calls;
}

function historyKeyDown(key) {
    return { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key, preventDefault() {}, stopPropagation() {} };
}

function loadHistoryReader() {
    const loaded = loadReader();
    const composer = loaded.document.querySelector('[data-composer-markdown]');
    loaded.reader.isPromptFocused = () => true;
    loaded.reader.CONFIG.PROMPT_HISTORY_NAV_ENABLED = true;
    loaded.reader.promptHistory = ['first', 'second'];
    loaded.reader.promptHistoryCursor = -1;
    loaded.reader.promptHistoryDraft = '';
    loaded.reader.promptHistoryDraftTooLarge = false;
    loaded.reader.showNotification = () => {};
    return Object.assign(loaded, { composer });
}

function run(name, test) {
    try {
        test();
        console.log(`OK ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}: ${error.message}`);
        process.exitCode = 1;
    }
}

run('setPromptText deletes an empty draft', () => {
    const { dom, document, reader } = loadReader();
    chromeExecCommand(document);
    let inputEvent = null;
    document.querySelector('[data-composer-markdown]').addEventListener('input', (event) => { inputEvent = event; });
    assert.strictEqual(reader.setPromptText(''), true);
    assert.strictEqual(document.querySelector('[data-composer-markdown]').textContent, '');
    assert.strictEqual(inputEvent.inputType, 'deleteContentBackward');
    assert.strictEqual(inputEvent.data, null);
    dom.window.close();
});

run('setPromptText falls back when delete changes nothing', () => {
    const { dom, document, reader } = loadReader();
    document.execCommand = (command) => command === 'delete';
    assert.strictEqual(reader.setPromptText(''), true);
    assert.strictEqual(document.querySelector('[data-composer-markdown]').textContent, '');
    dom.window.close();
});

run('setPromptText inserts non-empty text', () => {
    const { dom, document, reader } = loadReader();
    chromeExecCommand(document);
    let inputEvent = null;
    document.querySelector('[data-composer-markdown]').addEventListener('input', (event) => { inputEvent = event; });
    assert.strictEqual(reader.setPromptText('abc'), true);
    assert.strictEqual(document.querySelector('[data-composer-markdown]').textContent, 'abc');
    assert.strictEqual(inputEvent.inputType, 'insertText');
    assert.strictEqual(inputEvent.data, 'abc');
    dom.window.close();
});

run('setPromptText clears a lone-newline draft without inserting it', () => {
    const { dom, document, reader } = loadReader();
    const calls = chromeExecCommandRecorder(document);
    assert.strictEqual(reader.setPromptText('\n'), true);
    assert.strictEqual(document.querySelector('[data-composer-markdown]').textContent, '');
    assert.ok(!calls.some((call) => call.command === 'insertText' && String(call.value).includes('\n')),
        `insertText saw a newline: ${JSON.stringify(calls)}`);
    dom.window.close();
});

run('setPromptText strips trailing newlines from text', () => {
    const { dom, document, reader } = loadReader();
    chromeExecCommand(document);
    assert.strictEqual(reader.setPromptText('abc\n\n'), true);
    assert.strictEqual(document.querySelector('[data-composer-markdown]').textContent, 'abc');
    dom.window.close();
});

run('Ctrl+Up then Ctrl+Down on an empty composer clears it without an Enter insert', () => {
    const { dom, document, reader, composer } = loadHistoryReader();
    const calls = chromeExecCommandRecorder(document);
    reader.getPromptText = () => '\n';
    assert.strictEqual(reader.handlePromptHistoryHotkeys(historyKeyDown('ArrowUp')), true);
    assert.strictEqual(composer.textContent, 'second');
    calls.length = 0;
    assert.strictEqual(reader.handlePromptHistoryHotkeys(historyKeyDown('ArrowDown')), true);
    assert.strictEqual(composer.textContent, '');
    assert.ok(!calls.some((call) => call.command === 'insertText' && String(call.value).includes('\n')),
        `insertText saw a newline: ${JSON.stringify(calls)}`);
    dom.window.close();
});

run('text typed at the draft slot survives the next Ctrl+Up/Down cycle', () => {
    const { dom, document, reader, composer } = loadHistoryReader();
    chromeExecCommand(document);
    reader.getPromptText = () => '\n';
    reader.handlePromptHistoryHotkeys(historyKeyDown('ArrowUp'));
    reader.handlePromptHistoryHotkeys(historyKeyDown('ArrowDown'));
    reader.getPromptText = () => 'typed later';
    reader.handlePromptHistoryHotkeys(historyKeyDown('ArrowUp'));
    assert.strictEqual(composer.textContent, 'second');
    reader.handlePromptHistoryHotkeys(historyKeyDown('ArrowDown'));
    assert.strictEqual(composer.textContent, 'typed later');
    dom.window.close();
});

run('re-sending the last prompt resets history navigation', () => {
    const { dom, reader } = loadHistoryReader();
    reader.promptHistoryCursor = 1;
    reader.promptHistoryDraft = 'stale';
    reader.addPromptToHistory('second');
    assert.strictEqual(reader.promptHistoryCursor, -1);
    assert.strictEqual(reader.promptHistoryDraft, '');
    assert.strictEqual(reader.promptHistoryDraftTooLarge, false);
    dom.window.close();
});
