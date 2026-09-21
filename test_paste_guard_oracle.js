const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

function matchesSimpleSelector(element, selector) {
    const trimmed = selector.trim();
    const attribute = trimmed.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
        const actual = element.getAttribute(attribute[1]);
        return attribute[2] === undefined ? actual !== null : actual === attribute[2];
    }

    const className = trimmed.match(/^\.([\w-]+)$/);
    if (className) return element.classList.contains(className[1]);
    return element.tagName === trimmed.toUpperCase();
}

function matchesSelector(element, selector) {
    return selector.split(',').some((part) => matchesSimpleSelector(element, part));
}

function makeElement(options = {}) {
    const attrs = { ...(options.attrs || {}) };
    if (options.className) attrs.class = options.className;
    const classes = new Set(String(attrs.class || '').split(/\s+/).filter(Boolean));
    const rect = {
        width: 100,
        height: 40,
        top: 10,
        right: 110,
        bottom: 50,
        left: 10,
        ...(options.rect || {})
    };
    const element = {
        tagName: String(options.tagName || 'div').toUpperCase(),
        parentNode: options.parentNode || null,
        isConnected: options.isConnected !== false,
        _style: { display: 'block', visibility: 'visible', opacity: '1', ...(options.style || {}) },
        _clientRects: options.clientRects === undefined ? [{}] : options.clientRects,
        classList: {
            contains(name) {
                return classes.has(name);
            }
        },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        matches(selector) {
            return matchesSelector(this, selector);
        },
        closest(selector) {
            let current = this;
            while (current) {
                if (matchesSelector(current, selector)) return current;
                current = current.parentNode;
            }
            return null;
        },
        getBoundingClientRect() {
            return rect;
        },
        getClientRects() {
            return this._clientRects;
        }
    };
    return element;
}

let currentNodes = [];
const fakeDocument = {
    activeElement: null,
    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
        return currentNodes.filter((node) => node.matches(selector));
    }
};

const context = {
    console,
    document: fakeDocument,
    URL,
    window: {
        document: fakeDocument,
        location: { href: 'https://chatgpt.com/' },
        speechSynthesis: null,
        innerWidth: 1280,
        innerHeight: 720,
        getComputedStyle(element) {
            return element._style;
        },
        getSelection() {
            return null;
        },
        addEventListener() {}
    }
};
context.window.document = fakeDocument;
vm.createContext(context);

for (const relativePath of [
    'edge-extension/modules/00-namespace.js',
    'edge-extension/modules/25-prompt-send-part1.js',
    'edge-extension/modules/25-prompt-send-part2.js'
]) {
    const modulePath = path.join(repoRoot, relativePath);
    vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
}

const reader = context.window.__TTSNS.TTSReader;
let failures = 0;

function runCase(name, nodes, expected) {
    currentNodes = nodes;
    fakeDocument.activeElement = null;
    try {
        assert.strictEqual(reader.hasBlockingOpenElements(null), expected);
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.log(`FAIL ${name}: ${error.message}`);
    }
}

runCase(
    'Radix idle data-state open chrome is not blocking',
    [makeElement({ attrs: { 'data-state': 'open' }, className: 'bg-token-sidebar-surface-primary' })],
    false
);
runCase('visible dialog blocks paste', [makeElement({ attrs: { role: 'dialog' } })], true);
runCase('visible menu blocks paste', [makeElement({ attrs: { role: 'menu' } })], true);
runCase('visible listbox blocks paste', [makeElement({ attrs: { role: 'listbox' } })], true);
runCase(
    'display-none dialog is ignored',
    [makeElement({ attrs: { role: 'dialog' }, style: { display: 'none' } })],
    false
);
runCase(
    'menu with no client rects is ignored',
    [makeElement({ attrs: { role: 'menu' }, clientRects: [] })],
    false
);

// S3.10: an open inline edit form is found per exchange (driftwatch editSurfaceForm).
const exchangeEl = makeElement();
const editForm = makeElement({ tagName: 'form' });
reader.exchanges = () => [exchangeEl];
reader.resolveInExchange = (name, scope) => (name === 'editSurfaceForm' && scope === exchangeEl ? editForm : null);
runCase('visible edit-surface form blocks paste', [], true);
const hiddenEditForm = makeElement({ tagName: 'form', clientRects: [] });
reader.resolveInExchange = (name) => (name === 'editSurfaceForm' ? hiddenEditForm : null);
runCase('edit-surface form with no client rects is ignored', [], false);
reader.resolveInExchange = () => null;
runCase('no edit-surface form does not block paste', [], false);

if (failures > 0) process.exitCode = 1;
