const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const fixturePath = path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-07-10-composer', 'composer.html');

// ponytail: no DOM library in this repo (no node_modules, Phase A forbids adding packages).
// Minimal HTML parser + CSS selector matcher scoped to exactly what
// PROMPT_SELECTORS/SEND_SELECTORS use: tag, #id, .class, [attr], [attr="v"],
// [attr*="v"], descendant combinator, :not(...). Upgrade to a real DOM lib
// if a future phase needs broader CSS support.

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function parseAttributes(attrStr) {
    const attrs = {};
    const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(attrStr))) {
        const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
        attrs[m[1].toLowerCase()] = value;
    }
    return attrs;
}

function makeNode(tagName, attrs) {
    return {
        nodeType: 1,
        tagName,
        _attrs: attrs,
        children: [],
        parentNode: null,
        getAttribute(name) {
            const v = this._attrs[name.toLowerCase()];
            return v === undefined ? null : v;
        },
        get disabled() { return this._attrs.disabled !== undefined; },
        get isContentEditable() { return this._attrs.contenteditable === 'true'; },
        matches(selectorString) {
            return chainMatches(this, parseSelector(selectorString));
        }
    };
}

function parseHtml(html) {
    const root = makeNode('#ROOT', {});
    const stack = [root];
    const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(html))) {
        if (m[0].startsWith('<!--')) continue;
        const [, closing, tagName, attrStr, selfClose] = m;
        if (closing) {
            for (let k = stack.length - 1; k >= 1; k--) {
                if (stack[k].tagName === tagName.toUpperCase()) { stack.length = k; break; }
            }
            continue;
        }
        const node = makeNode(tagName.toUpperCase(), parseAttributes(attrStr));
        node.parentNode = stack[stack.length - 1];
        stack[stack.length - 1].children.push(node);
        if (!selfClose && !VOID_TAGS.has(tagName.toLowerCase())) {
            stack.push(node);
        }
    }
    return root;
}

function parseCompound(str) {
    const compound = { tag: null, id: null, classes: [], attrs: [], nots: [] };
    let s = str.trim();
    let m = s.match(/^[a-zA-Z][\w-]*/);
    if (m) { compound.tag = m[0].toUpperCase(); s = s.slice(m[0].length); }
    while (s.length) {
        if ((m = s.match(/^#([\w-]+)/))) { compound.id = m[1]; s = s.slice(m[0].length); continue; }
        if ((m = s.match(/^\.([\w-]+)/))) { compound.classes.push(m[1]); s = s.slice(m[0].length); continue; }
        if ((m = s.match(/^\[([\w-]+)(?:([*^$]?=)"([^"]*)")?\]/))) {
            compound.attrs.push({ name: m[1], op: m[2] || null, value: m[3] !== undefined ? m[3] : null });
            s = s.slice(m[0].length); continue;
        }
        if ((m = s.match(/^:not\(([^)]*)\)/))) {
            compound.nots.push(parseCompound(m[1]));
            s = s.slice(m[0].length); continue;
        }
        throw new Error(`cannot parse selector fragment "${s}" (from "${str}")`);
    }
    return compound;
}

function splitCompounds(selectorString) {
    const parts = [];
    let current = '';
    let depth = 0;
    let inQuote = null;
    for (const ch of selectorString.trim()) {
        if (inQuote) {
            current += ch;
            if (ch === inQuote) inQuote = null;
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = ch; current += ch; continue; }
        if (ch === '[' || ch === '(') { depth++; current += ch; continue; }
        if (ch === ']' || ch === ')') { depth--; current += ch; continue; }
        if (/\s/.test(ch) && depth === 0) {
            if (current) parts.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current) parts.push(current);
    return parts;
}

function parseSelector(selectorString) {
    return splitCompounds(selectorString).map(parseCompound);
}

function compoundMatches(node, compound) {
    if (compound.tag && node.tagName !== compound.tag) return false;
    if (compound.id && node.getAttribute('id') !== compound.id) return false;
    if (compound.classes.length) {
        const classes = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        for (const c of compound.classes) if (!classes.includes(c)) return false;
    }
    for (const a of compound.attrs) {
        const val = node.getAttribute(a.name);
        if (val === null) return false;
        if (a.op === null) continue;
        if (a.op === '=' && val !== a.value) return false;
        if (a.op === '*=' && !val.includes(a.value)) return false;
        if (a.op === '^=' && !val.startsWith(a.value)) return false;
        if (a.op === '$=' && !val.endsWith(a.value)) return false;
    }
    for (const notCompound of compound.nots) {
        if (compoundMatches(node, notCompound)) return false;
    }
    return true;
}

function chainMatches(node, compounds) {
    const last = compounds[compounds.length - 1];
    if (!compoundMatches(node, last)) return false;
    if (compounds.length === 1) return true;
    const rest = compounds.slice(0, -1);
    let ancestor = node.parentNode;
    while (ancestor) {
        if (chainMatches(ancestor, rest)) return true;
        ancestor = ancestor.parentNode;
    }
    return false;
}

function querySelectorAllFrom(root, selectorString) {
    const compounds = parseSelector(selectorString);
    const results = [];
    (function walk(node) {
        if (node.nodeType === 1 && node !== root && chainMatches(node, compounds)) results.push(node);
        for (const child of node.children) walk(child);
    })(root);
    return results;
}

function getComputedStyleStub(node) {
    const style = node.getAttribute('style') || '';
    return {
        display: /display\s*:\s*none/.test(style) ? 'none' : 'block',
        visibility: /visibility\s*:\s*hidden/.test(style) ? 'hidden' : 'visible'
    };
}

function loadReaderAgainstFixture(fixtureRoot) {
    const fakeDocument = {
        activeElement: null,
        querySelector(sel) {
            const r = querySelectorAllFrom(fixtureRoot, sel);
            return r.length ? r[0] : null;
        },
        querySelectorAll(sel) {
            return querySelectorAllFrom(fixtureRoot, sel);
        }
    };
    const reader = {};
    const context = {
        console,
        document: fakeDocument,
        window: {
            __TTSNS: { TTSReader: reader, helpers: {} },
            document: fakeDocument,
            getComputedStyle: getComputedStyleStub,
            getSelection: () => null,
            addEventListener() {}
        }
    };
    context.window.document = fakeDocument;
    vm.createContext(context);
    const modulePath = path.join(repoRoot, 'edge-extension', 'modules', '25-prompt-send-part1.js');
    vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    return reader;
}

function testComposerFixtureOracle() {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const fixtureRoot = parseHtml(html);
    const reader = loadReaderAgainstFixture(fixtureRoot);

    const promptArea = reader.findPromptArea();
    assert.ok(promptArea, 'findPromptArea() found nothing against the fixture');
    assert.strictEqual(promptArea.getAttribute('data-oracle'), 'composer-input',
        `findPromptArea() matched wrong element (data-oracle=${promptArea.getAttribute('data-oracle')})`);

    const sendButton = reader.findSendButton();
    assert.ok(sendButton, 'findSendButton() found nothing against the fixture');
    assert.strictEqual(sendButton.getAttribute('data-oracle'), 'send-button',
        `findSendButton() matched wrong element (data-oracle=${sendButton.getAttribute('data-oracle')})`);

    for (const selector of reader.getSendButtonSelectors()) {
        const matches = querySelectorAllFrom(fixtureRoot, selector);
        for (const el of matches) {
            assert.strictEqual(el.getAttribute('data-oracle-negative'), null,
                `send selector "${selector}" matched a negative-oracle element (${el.getAttribute('data-oracle-negative')})`);
        }
    }
}

testComposerFixtureOracle();
console.log('PASS testComposerFixtureOracle');
