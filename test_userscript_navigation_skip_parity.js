const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const scriptPath = path.join(repoRoot, 'Tampermonkey_scripts', 'ChatGPT Universal TTS Reader with Precision Navigation & Highlighting.js');

function loadUserscriptForTest() {
    const source = fs.readFileSync(scriptPath, 'utf8')
        .replace('    TTSReader.init();\n\n})();', '    window.__TTSReaderForTest = TTSReader;\n\n})();');
    const document = {
        body: { appendChild() {} },
        documentElement: { clientHeight: 1000 },
        addEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    const context = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame() {},
        performance: { now: () => 0 },
        Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
        NodeFilter: { SHOW_TEXT: 4 },
        MutationObserver: class {
            observe() {}
            disconnect() {}
        },
        SpeechSynthesisUtterance: class {
            constructor(text) {
                this.text = text;
            }
        },
        document,
        window: {
            speechSynthesis: {
                speaking: false,
                pending: false,
                getVoices: () => []
            },
            innerHeight: 1000,
            innerWidth: 1200,
            addEventListener() {},
            getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
            localStorage: {
                getItem: () => null,
                setItem() {},
                removeItem() {}
            }
        },
        localStorage: {
            getItem: () => null,
            setItem() {},
            removeItem() {}
        }
    };
    context.window.document = document;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: scriptPath });
    return context.window.__TTSReaderForTest;
}

function testUserscriptResolvesNavigationSkipLikeEdge() {
    const reader = loadUserscriptForTest();
    reader.CONFIG.AUTO_READ_START_SKIP_AMOUNT = 2;
    reader.CONFIG.AUTO_READ_START_SKIP_UNIT = 'word';
    reader.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS = true;
    reader.paragraphsList = [
        { text: 'alpha beta gamma delta', element: { isConnected: true } }
    ];

    const resolved = reader.resolveStartPositionWithUnitSkip(0, 0);

    assert.strictEqual(resolved.paragraphIndex, 0);
    assert.strictEqual(resolved.startCharIndex, 'alpha beta '.length);
}

function testUserscriptSelectionSeekAppliesNavigationSkip() {
    const reader = loadUserscriptForTest();
    const calls = [];
    reader.CONFIG.AUTO_READ_START_SKIP_AMOUNT = 1;
    reader.CONFIG.AUTO_READ_START_SKIP_UNIT = 'word';
    reader.CONFIG.APPLY_START_SKIP_TO_NAVIGATION_STARTS = true;
    reader.paragraphsList = [
        {
            text: 'alpha beta gamma delta',
            element: {
                isConnected: true,
                contains: () => true
            }
        }
    ];
    reader.stopTTS = () => {};
    reader.readFromParagraph = (index, options) => {
        calls.push({ index, options: options || {} });
    };

    const jumped = reader.jumpReadingToSelectionTarget({
        paragraphIndex: 0,
        charIndex: 'alpha '.length
    });

    assert.strictEqual(jumped, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[0].options.startCharIndex, 'alpha beta '.length);
}

function testUserscriptServerPlaybackScrollsBeforePreparingWordSpans() {
    const reader = loadUserscriptForTest();
    const calls = [];
    const element = {
        isConnected: true,
        classList: {
            add() {
                calls.push('class-add');
            }
        }
    };
    reader.CONFIG.WORD_HIGHLIGHT_ENABLED = true;
    reader.CONFIG.SERVER_PRECACHE_ENABLED = false;
    reader.serverVoiceEnabled = true;
    reader.paragraphsList = [
        { text: 'alpha beta gamma', element }
    ];
    reader.shouldHighlightWordsForElement = () => true;
    reader.startAutoScroll = function startAutoScroll() {
        calls.push('start-scroll');
        assert.strictEqual(this.lastSpokenElement, element);
    };
    reader.maybeAutoScrollOnStart = function maybeAutoScrollOnStart() {
        calls.push('center-target');
        assert.strictEqual(this.lastSpokenElement, element);
    };
    reader.prepareParagraphForReading = function prepareParagraphForReading(targetElement) {
        calls.push('prepare');
        assert.strictEqual(targetElement, element);
        assert.strictEqual(this.lastSpokenElement, element);
        return 'alpha beta gamma';
    };
    reader.clearHighlights = () => {};
    reader.updatePointerArrow = () => {};
    reader.prefetchParagraphSentences = (_text, _index, onComplete) => onComplete();
    reader.playFirstSentenceFromCache = () => {};

    reader.startServerPlaybackFromParagraph(0);

    assert.deepStrictEqual(calls.slice(0, 3), ['start-scroll', 'center-target', 'prepare']);
}

function testUserscriptDetachedWordSpanIsIgnoredDuringHighlight() {
    const reader = loadUserscriptForTest();
    let added = false;
    const span = {
        textContent: 'alpha',
        isConnected: false,
        classList: {
            add() { added = true; },
            remove() {}
        }
    };
    reader.wordHighlightActiveForCurrent = true;
    reader.processedParagraph = {
        element: { isConnected: true, contains: () => false },
        originalHTML: '',
        wordSpans: [span],
        wordOffsets: [0]
    };

    reader.highlightWordByCharIndex(0);

    assert.strictEqual(added, false);
    assert.strictEqual(reader.currentWordSpan, null);
}

function testUserscriptCssHighlightRangeCanTrackWordWithoutSpanMutation() {
    const reader = loadUserscriptForTest();
    const firstRange = { startContainer: { isConnected: true }, endContainer: { isConnected: true } };
    const secondRange = { startContainer: { isConnected: true }, endContainer: { isConnected: true } };
    const applied = [];
    reader.wordHighlightActiveForCurrent = true;
    reader.setCssWordHighlightRange = (range) => applied.push(range);
    reader.processedParagraph = {
        element: { isConnected: true },
        originalHTML: '',
        wordSpans: [],
        wordRanges: [firstRange, secondRange],
        wordOffsets: [0, 6],
        wordLengths: [5, 4],
        usesCssHighlights: true
    };

    reader.highlightWordByCharIndex(6);

    assert.deepStrictEqual(applied, [secondRange]);
    assert.strictEqual(reader.currentWordSpan, null);
}

function testUserscriptAutoScrollSkipsDetachedElement() {
    const reader = loadUserscriptForTest();
    let scrolled = false;
    reader.scrollElementToCenter({
        isConnected: false,
        scrollIntoView() {
            scrolled = true;
        }
    });

    assert.strictEqual(scrolled, false);
}

function testUserscriptGentleScrollUsesNearestAlignment() {
    const reader = loadUserscriptForTest();
    reader.CONFIG.SCROLL_THROTTLE_MS = 0;
    reader.CONFIG.SCROLL_EDGE_PADDING = 20;
    reader.lastScrollTime = 0;
    let options = null;
    reader.gentleScrollToElement({
        isConnected: true,
        getBoundingClientRect: () => ({ top: 2000, bottom: 2050 }),
        scrollIntoView(nextOptions) {
            options = nextOptions;
        }
    });

    assert.strictEqual(options && options.block, 'nearest');
    assert.strictEqual(options && options.inline, 'nearest');
}

testUserscriptResolvesNavigationSkipLikeEdge();
console.log('PASS testUserscriptResolvesNavigationSkipLikeEdge');
testUserscriptSelectionSeekAppliesNavigationSkip();
console.log('PASS testUserscriptSelectionSeekAppliesNavigationSkip');
testUserscriptServerPlaybackScrollsBeforePreparingWordSpans();
console.log('PASS testUserscriptServerPlaybackScrollsBeforePreparingWordSpans');
testUserscriptDetachedWordSpanIsIgnoredDuringHighlight();
console.log('PASS testUserscriptDetachedWordSpanIsIgnoredDuringHighlight');
testUserscriptCssHighlightRangeCanTrackWordWithoutSpanMutation();
console.log('PASS testUserscriptCssHighlightRangeCanTrackWordWithoutSpanMutation');
testUserscriptAutoScrollSkipsDetachedElement();
console.log('PASS testUserscriptAutoScrollSkipsDetachedElement');
testUserscriptGentleScrollUsesNearestAlignment();
console.log('PASS testUserscriptGentleScrollUsesNearestAlignment');
