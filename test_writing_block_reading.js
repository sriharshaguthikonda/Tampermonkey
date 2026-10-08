const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const { JSDOM } = require(path.join(repoRoot, '..', 'driftwatch', 'node_modules', 'jsdom'));
const MODULES = [
    '00-namespace.js', '22-driftwatch.js', '23-resolution.js', '40-voice.js', '50-text.js',
    '55-selection.js', '60-highlight.js', '65-prewrap.js'
];

function loadReader(html) {
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/', runScripts: 'dangerously' });
    Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() { return dom.window.document.body; }
    });
    const context = dom.getInternalVMContext();
    for (const name of MODULES) {
        const modulePath = path.join(repoRoot, 'edge-extension', 'modules', name);
        vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    }
    const reader = dom.window.__TTSNS.TTSReader;
    reader.isChatGPTPage = true;
    return { dom, reader };
}

function testWritingBlockReading() {
    const fixturePath = path.join(repoRoot, 'fixtures', 'chatgpt.com', 'writing-block', 'email-card.html');
    const { dom, reader } = loadReader(fs.readFileSync(fixturePath, 'utf8'));
    const paragraphs = reader.findAllParagraphs();
    const text = Array.from(paragraphs, (paragraph) => paragraph.text);

    assert.deepStrictEqual(text, [
        'Subject: Lorem subject',
        'Lorem first paragraph',
        'Lorem second paragraph',
        'Lorem third paragraph',
        'Lorem first item',
        'Lorem second item'
    ], 'writing block must expose only its subject and body paragraphs');
    assert.ok(!text.some((value) => /title|From|account|Recipients|Copy|Open in email|Send/.test(value)),
        'writing block chrome must stay unreadable');

    const editableParagraph = dom.window.document.querySelector('[contenteditable="true"] p');
    const originalHTML = editableParagraph.innerHTML;
    reader.wordHighlightActiveForCurrent = true;
    reader.supportsCssTextHighlights = () => false;
    assert.strictEqual(reader.prepareParagraphForReading(editableParagraph), 'Lorem first paragraph',
        'editable text remains readable if CSS highlights are unavailable');
    assert.strictEqual(editableParagraph.innerHTML, originalHTML,
        'editable text must never receive word spans when CSS highlights are unavailable');

    reader.supportsCssTextHighlights = () => true;
    const cssData = reader.prewrapParagraph(editableParagraph);
    assert.ok(cssData && cssData.usesCssHighlights, 'editable text must use CSS highlights when available');
    assert.strictEqual(editableParagraph.innerHTML, originalHTML,
        'CSS highlight preparation must not rewrite editable markup');

    const subject = dom.window.document.querySelector('textarea[aria-label="Subject"]');
    const subjectValue = subject.value;
    reader.processedParagraph = reader.createEmptyProcessedParagraph();
    assert.strictEqual(reader.prepareParagraphForReading(subject), 'Subject: Lorem subject',
        'subject textarea must remain readable when CSS highlights are available');
    assert.strictEqual(subject.value, subjectValue, 'subject textarea value must not be mutated for highlighting');
    assert.strictEqual(reader.prewrapParagraph(subject), null,
        'subject textarea must never receive word-highlight prewrap data');
    console.log('PASS testWritingBlockReading');
}

function testBlankSubjectSkipped() {
    const fixturePath = path.join(repoRoot, 'fixtures', 'chatgpt.com', 'writing-block', 'email-card.html');
    const html = fs.readFileSync(fixturePath, 'utf8').replace('>Lorem subject</textarea>', '>  </textarea>');
    const { reader } = loadReader(html);
    const text = Array.from(reader.findAllParagraphs(), (paragraph) => paragraph.text);
    assert.ok(!text.some((value) => /^Subject:/.test(value)), 'blank subject must not be spoken');
    assert.strictEqual(text[0], 'Lorem first paragraph', 'body still reads when subject is blank');
    console.log('PASS testBlankSubjectSkipped');
}

testWritingBlockReading();
testBlankSubjectSkipped();
