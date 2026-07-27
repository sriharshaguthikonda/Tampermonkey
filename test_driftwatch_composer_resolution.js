const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const fixturePath = path.join(repoRoot, 'fixtures', 'chatgpt.com', '2026-07-10-composer', 'composer.html');
const driftwatchModulePath = path.join(repoRoot, 'edge-extension', 'modules', '22-driftwatch.js');

// ponytail: same minimal HTML/CSS engine as test_composer_fixture_oracle.js (no DOM
// library in this repo, no node_modules). Extended with hasAttribute()/isConnected —
// driftwatch's core.js needs both to evaluate the "action" anchors' requires: [...] checks
// (composer has none; sendButton requires connected+enabled).

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
        isConnected: true,
        getAttribute(name) {
            const v = this._attrs[name.toLowerCase()];
            return v === undefined ? null : v;
        },
        hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this._attrs, name.toLowerCase());
        },
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

function loadFixtureRoot() {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const root = parseHtml(html);
    root.querySelectorAll = (selector) => querySelectorAllFrom(root, selector);
    return root;
}

// driftwatch's own dist bundle also runs as a CommonJS module (see its README's
// "Node + jsdom" section), but this repo's other tests all load production files via
// vm.runInContext rather than a real require(), so this stays consistent with
// test_composer_fixture_oracle.js instead of taking the require() shortcut.
function loadDriftwatch() {
    const context = { console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(driftwatchModulePath, 'utf8'), context, { filename: driftwatchModulePath });
    return context.driftwatch;
}

function testDriftwatchResolvesComposerAgainstFixture() {
    const fixtureRoot = loadFixtureRoot();
    const dw = loadDriftwatch();
    const pack = dw.packs['chatgpt.com'];
    assert.ok(pack, 'chatgpt.com pack missing from vendored driftwatch bundle');

    const result = dw.resolve(pack, 'composer', fixtureRoot);
    assert.strictEqual(result.ok, true, `composer anchor did not resolve (reason=${result.reason})`);
    assert.strictEqual(result.el.getAttribute('data-oracle'), 'composer-input',
        `composer anchor matched wrong element (data-oracle=${result.el.getAttribute('data-oracle')})`);

    // The decoy textarea shares aria-label/data-virtualkeyboard with the real composer.
    // Confirm the winning element is not it, and that no composer strategy — not just the
    // winner — ever matches it either.
    assert.notStrictEqual(result.el.getAttribute('data-oracle-negative'), 'decoy-textarea',
        'composer anchor resolved to the decoy textarea');
    for (const strategy of pack.anchors.composer.strategies) {
        const matches = querySelectorAllFrom(fixtureRoot, dw.compile(strategy));
        for (const el of matches) {
            assert.notStrictEqual(el.getAttribute('data-oracle-negative'), 'decoy-textarea',
                `composer strategy "${strategy.id}" matched the decoy textarea`);
        }
    }
}

function testDriftwatchResolvesSendButtonAgainstFixture() {
    const fixtureRoot = loadFixtureRoot();
    const dw = loadDriftwatch();
    const pack = dw.packs['chatgpt.com'];

    const result = dw.resolve(pack, 'sendButton', fixtureRoot, { state: 'idle' });
    assert.strictEqual(result.ok, true, `sendButton anchor did not resolve (reason=${result.reason})`);
    assert.strictEqual(result.el.getAttribute('data-oracle'), 'send-button',
        `sendButton anchor matched wrong element (data-oracle=${result.el.getAttribute('data-oracle')})`);

    for (const strategy of pack.anchors.sendButton.strategies) {
        const matches = querySelectorAllFrom(fixtureRoot, dw.compile(strategy));
        for (const el of matches) {
            assert.ok(!el.getAttribute('data-oracle-negative'),
                `sendButton strategy "${strategy.id}" matched a negative-oracle element (${el.getAttribute('data-oracle-negative')})`);
        }
    }
}

testDriftwatchResolvesComposerAgainstFixture();
console.log('PASS testDriftwatchResolvesComposerAgainstFixture');
testDriftwatchResolvesSendButtonAgainstFixture();
console.log('PASS testDriftwatchResolvesSendButtonAgainstFixture');
