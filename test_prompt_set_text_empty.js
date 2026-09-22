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
    '25-prompt-send-part1.js'
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
