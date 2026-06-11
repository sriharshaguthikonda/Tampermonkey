const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

function makeRuntime(reader) {
    const listeners = {};
    const document = {
        activeElement: null,
        body: { style: {}, appendChild() {} },
        documentElement: { clientHeight: 1000 },
        addEventListener(type, handler) {
            listeners[type] = handler;
        },
        querySelector() {
            return null;
        },
        querySelectorAll(selector) {
            if (selector === '[data-message-author-role="assistant"]') {
                return reader.__assistantMessages || [];
            }
            return [];
        }
    };
    const context = {
        console,
        setTimeout,
        clearTimeout,
        performance: { now: () => 0 },
        Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
        NodeFilter: { SHOW_TEXT: 4 },
        document,
        window: {
            __TTSNS: {
                TTSReader: reader,
                helpers: {
                    getCurrentProfile: () => 'chatgpt',
                    persistProfileSetting: () => {}
                }
            },
            addEventListener() {},
            innerHeight: 1000
        }
    };
    context.window.document = document;
    context.window.getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
    vm.createContext(context);
    return { context, listeners };
}

function loadModule(reader, relativePath) {
    const runtime = makeRuntime(reader);
    const fullPath = path.join(repoRoot, relativePath);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), runtime.context, { filename: fullPath });
    return runtime;
}

function makeAutoReadReader(overrides = {}) {
    const calls = [];
    const message = {
        getAttribute(name) {
            if (name === 'data-message-author-role') return 'assistant';
            return '';
        },
        textContent: 'abcdef first paragraph second paragraph',
        contains(element) {
            return element && element.inMessage === true;
        }
    };
    const reader = {
        CONFIG: {
            AUTO_READ_NEW_MESSAGES: true,
            AUTO_READ_COOLDOWN_MS: 0,
            AUTO_READ_STABLE_MS: 0,
            AUTO_READ_MIN_PARAGRAPHS: 1,
            AUTO_READ_START_SKIP_CHARS: 6,
            AUTO_READ_LOOP_CURRENT_MESSAGE: false,
            WAIT_RETRY_MS: 1,
            LOOP_ON_END: true,
            LOOP_WAIT_MS: 0,
            WAIT_FOR_MORE_MS: 0,
            ...overrides.CONFIG
        },
        continuousReadingActive: false,
        ttsActive: false,
        isNavigating: false,
        navKeyHeld: false,
        lastAutoReadMessageElement: null,
        lastAutoReadTriggeredAt: 0,
        autoReadMessageActivity: new WeakMap(),
        paragraphsDirty: false,
        waitingForMoreContent: false,
        waitForMoreNextIndex: -1,
        waitForMoreTimeoutId: null,
        waitForMoreSince: 0,
        paragraphsList: [
            { element: { inMessage: true, id: 'p0' }, text: 'abcdef first paragraph' },
            { element: { inMessage: true, id: 'p1' }, text: 'second paragraph' },
            { element: { inMessage: false, id: 'p2' }, text: 'outside message' }
        ],
        refreshParagraphsIfNeeded() {},
        getLatestAssistantMessageElement() {
            return message;
        },
        readFromParagraph(index, options) {
            calls.push({ index, options: options || {} });
        },
        stopTTS() {},
        showNotification() {},
        ...overrides.reader
    };
    reader.__assistantMessages = [message];
    loadModule(reader, 'edge-extension/modules/50-text.js');
    loadModule(reader, 'edge-extension/modules/70-auto-read.js');
    return { reader, calls, message };
}

function makeEventReader(hotkeyOverrides = {}) {
    const navigateCalls = [];
    const reader = {
        CONFIG: {
            HOTKEYS: {
                ACTIVATE: 'U',
                PAUSE_RESUME: 'P',
                NAV_NEXT: 'ArrowRight',
                NAV_PREV: 'ArrowLeft',
                STOP: 'Escape',
                ...hotkeyOverrides
            },
            IDLE_ARROW_NAVIGATION: false,
            NAV_ARROW_JUMP_SEGMENTS: 4,
            NAV_CTRL_JUMP_SEGMENTS: 9,
            LOOP_ON_END: true,
            AUTO_SCROLL_ENABLED: true
        },
        settingsProfile: 'chatgpt',
        pendingNavIndex: -1,
        navKeyHeld: false,
        markUserInteraction() {},
        handleSmartCopyShortcut: () => false,
        capturePromptForNativeEnterSend() {},
        handleEnterToSend() {},
        handlePromptHistoryHotkeys: () => false,
        shouldHandleNavigationHotkeys: () => true,
        getNavigationJumpStep() {
            return this.CONFIG.NAV_CTRL_JUMP_SEGMENTS;
        },
        getArrowNavigationStep() {
            return this.CONFIG.NAV_ARROW_JUMP_SEGMENTS;
        },
        navigate(direction) {
            navigateCalls.push(direction);
            return true;
        },
        jumpToBoundary() {},
        pauseResumeTTS() {},
        adjustSpeechRateByStep() {},
        replayCurrentParagraph() {},
        setLoopEnabled(value) {
            this.CONFIG.LOOP_ON_END = value;
        },
        setAutoScrollEnabled(value) {
            this.CONFIG.AUTO_SCROLL_ENABLED = value;
        },
        stopTTS() {},
        clearStalePlaybackFlagsIfIdle() {},
        isPlaybackSessionActive: () => false,
        showNotification() {},
        startReadingFromPendingNav() {},
        handleSmartCopyCopyEvent() {},
        handleSelectionSeek() {},
        markUserInteraction() {},
        applyOverlayPanelPosition() {},
        resizeNavigationTrailLayer() {},
        renderNavigationTrail() {},
        handleVisibilityPlaybackGuard() {},
        logPlaybackGuardEvent() {}
    };
    const runtime = loadModule(reader, 'edge-extension/modules/85-events.js');
    reader.setupEventListeners();
    return { reader, navigateCalls, listeners: runtime.listeners };
}

function makeKeyEvent(key, overrides = {}) {
    return {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefaultCalled: false,
        preventDefault() {
            this.preventDefaultCalled = true;
        },
        ...overrides
    };
}

function testAutoReadStartsAfterConfiguredCharacters() {
    const { reader, calls } = makeAutoReadReader();
    reader.startAutoReadFromLatestAssistant();

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[0].options.startCharIndex, 6);
}

function testAutoReadStartsAfterConfiguredWords() {
    const { reader, calls } = makeAutoReadReader({
        CONFIG: {
            AUTO_READ_START_SKIP_CHARS: 0,
            AUTO_READ_START_SKIP_AMOUNT: 2,
            AUTO_READ_START_SKIP_UNIT: 'word'
        }
    });
    reader.startAutoReadFromLatestAssistant();

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[0].options.startCharIndex, 13);
}

function testAutoReadStartsAfterConfiguredSentences() {
    const { reader, calls } = makeAutoReadReader({
        CONFIG: {
            AUTO_READ_START_SKIP_CHARS: 0,
            AUTO_READ_START_SKIP_AMOUNT: 1,
            AUTO_READ_START_SKIP_UNIT: 'sentence'
        },
        reader: {
            paragraphsList: [
                { element: { inMessage: true, id: 'p0' }, text: 'First sentence. Second sentence. Third sentence.' }
            ]
        }
    });
    reader.startAutoReadFromLatestAssistant();

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[0].options.startCharIndex, 'First sentence. '.length);
}

function testAutoReadCanLoopOnlyCurrentMessage() {
    const { reader, calls, message } = makeAutoReadReader({
        CONFIG: {
            AUTO_READ_LOOP_CURRENT_MESSAGE: true,
            AUTO_READ_START_SKIP_CHARS: 4
        }
    });
    reader.activeAutoReadMessageElement = message;
    reader.activeAutoReadStartParagraphIndex = 1;
    reader.activeAutoReadStartCharIndex = 4;
    reader.continuousReadingActive = true;

    reader.loopToTop();

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 1);
    assert.strictEqual(calls[0].options.startCharIndex, 4);
}

function makeFlowReader(config = {}) {
    const calls = [];
    const makeElement = (id) => ({
        id,
        classList: { add() {}, remove() {} },
        getBoundingClientRect: () => ({ top: 10, bottom: 40 }),
        isConnected: true
    });
    const reader = {
        CONFIG: {
            AUTO_READ_START_SKIP_CHARS: 0,
            AUTO_READ_START_SKIP_AMOUNT: 0,
            AUTO_READ_START_SKIP_UNIT: 'character',
            APPLY_START_SKIP_TO_NAVIGATION_STARTS: false,
            NAV_KEYUP_READ_DELAY_MS: 0,
            NAV_FOCUS_HOLD_MS: 0,
            NAV_FOCUS_FADE_MS: 0,
            NAV_THROTTLE_MS: 0,
            NAV_ARROW_JUMP_SEGMENTS: 1,
            NAV_CTRL_JUMP_SEGMENTS: 5,
            WORD_HIGHLIGHT_ENABLED: true,
            ...config
        },
        continuousReadingActive: false,
        pendingNavIndex: 1,
        paragraphsDirty: false,
        paragraphsList: [
            { element: makeElement('p0'), text: 'zero paragraph' },
            { element: makeElement('p1'), text: 'alpha beta gamma delta' },
            { element: makeElement('p2'), text: 'epsilon zeta' }
        ],
        stopTTS() {},
        clearActiveAutoReadScope() {},
        refreshParagraphsIfNeeded() {},
        showNotification() {},
        clearHighlights() {},
        gentleScrollToElement() {},
        addNavigationTrailPoint() {},
        logPlaybackGuardEvent() {},
        requestPlaybackLock(_label, callback) { callback(true); },
        isServerVoiceSelected: () => false,
        shouldUseEmojiVoiceRoutingForParagraph: () => false,
        queueFromIndex() {},
        startServerPlaybackFromParagraph() {},
        revertParagraph() {}
    };
    loadModule(reader, 'edge-extension/modules/50-text.js');
    loadModule(reader, 'edge-extension/modules/70-auto-read.js');
    loadModule(reader, 'edge-extension/modules/80-flow.js');
    reader.readFromParagraph = (index, options) => {
        calls.push({ index, options: options || {} });
    };
    return { reader, calls };
}

async function testArrowPendingReadDoesNotApplySkipWhenDisabled() {
    const { reader, calls } = makeFlowReader({
        AUTO_READ_START_SKIP_AMOUNT: 2,
        AUTO_READ_START_SKIP_UNIT: 'word',
        APPLY_START_SKIP_TO_NAVIGATION_STARTS: false
    });

    reader.startReadingFromPendingNav();
    await new Promise(resolve => setTimeout(resolve, 5));

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 1);
    assert.strictEqual(calls[0].options.startCharIndex, undefined);
}

async function testArrowPendingReadAppliesConfiguredSkipWhenEnabled() {
    const { reader, calls } = makeFlowReader({
        AUTO_READ_START_SKIP_AMOUNT: 2,
        AUTO_READ_START_SKIP_UNIT: 'word',
        APPLY_START_SKIP_TO_NAVIGATION_STARTS: true
    });

    reader.startReadingFromPendingNav();
    await new Promise(resolve => setTimeout(resolve, 5));

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 1);
    assert.strictEqual(calls[0].options.startCharIndex, 'alpha beta '.length);
}

function testArrowKeysUseSeparateArrowJumpSegments() {
    const { navigateCalls, listeners } = makeEventReader();
    listeners.keydown(makeKeyEvent('ArrowRight'));
    listeners.keydown(makeKeyEvent('ArrowLeft'));

    assert.deepStrictEqual(navigateCalls, [4, -4]);
}

function testEmptyHotkeyDoesNotMatch() {
    const { navigateCalls, listeners } = makeEventReader({ NAV_NEXT: '' });
    listeners.keydown(makeKeyEvent(''));

    assert.deepStrictEqual(navigateCalls, []);
}

function makeSelectionSeekReader(config = {}) {
    const calls = [];
    const element = {
        contains: () => true,
        isConnected: true
    };
    const reader = {
        CONFIG: {
            CLICK_START_SKIP_WORDS: 0,
            AUTO_READ_START_SKIP_AMOUNT: 0,
            AUTO_READ_START_SKIP_UNIT: 'character',
            APPLY_START_SKIP_TO_NAVIGATION_STARTS: false,
            ...config
        },
        paragraphsList: [
            { element, text: 'alpha beta gamma delta' }
        ],
        stopTTS() {},
        logPlaybackGuardEvent() {},
        showNotification() {},
        readFromParagraph(index, options) {
            calls.push({ index, options: options || {} });
        }
    };
    loadModule(reader, 'edge-extension/modules/50-text.js');
    loadModule(reader, 'edge-extension/modules/70-auto-read.js');
    loadModule(reader, 'edge-extension/modules/55-selection.js');
    return { reader, calls };
}

function testDoubleClickSelectionSeekAppliesConfiguredSkipWhenEnabled() {
    const { reader, calls } = makeSelectionSeekReader({
        AUTO_READ_START_SKIP_AMOUNT: 1,
        AUTO_READ_START_SKIP_UNIT: 'word',
        APPLY_START_SKIP_TO_NAVIGATION_STARTS: true
    });

    const jumped = reader.jumpReadingToSelectionTarget({
        paragraphIndex: 0,
        charIndex: 'alpha '.length
    });

    assert.strictEqual(jumped, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[0].options.startCharIndex, 'alpha beta '.length);
}

function testOffscreenConnectedParagraphCanStillHighlightWords() {
    const { reader } = makeFlowReader();
    const element = {
        isConnected: true,
        getBoundingClientRect: () => ({ top: 2500, bottom: 2600 })
    };

    assert.strictEqual(reader.shouldHighlightWordsForElement(element), true);
}

function testDisconnectedParagraphDoesNotHighlightWords() {
    const { reader } = makeFlowReader();
    const element = {
        isConnected: false,
        getBoundingClientRect: () => ({ top: 10, bottom: 40 })
    };

    assert.strictEqual(reader.shouldHighlightWordsForElement(element), false);
}

const tests = [
    testAutoReadStartsAfterConfiguredCharacters,
    testAutoReadStartsAfterConfiguredWords,
    testAutoReadStartsAfterConfiguredSentences,
    testAutoReadCanLoopOnlyCurrentMessage,
    testArrowPendingReadDoesNotApplySkipWhenDisabled,
    testArrowPendingReadAppliesConfiguredSkipWhenEnabled,
    testArrowKeysUseSeparateArrowJumpSegments,
    testEmptyHotkeyDoesNotMatch,
    testDoubleClickSelectionSeekAppliesConfiguredSkipWhenEnabled,
    testOffscreenConnectedParagraphCanStillHighlightWords,
    testDisconnectedParagraphDoesNotHighlightWords
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
