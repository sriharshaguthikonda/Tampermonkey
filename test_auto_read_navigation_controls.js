const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

function makeRuntime(reader) {
    const listeners = {};
    const document = {
        activeElement: null,
        body: { style: {} },
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

const tests = [
    testAutoReadStartsAfterConfiguredCharacters,
    testAutoReadStartsAfterConfiguredWords,
    testAutoReadCanLoopOnlyCurrentMessage,
    testArrowKeysUseSeparateArrowJumpSegments,
    testEmptyHotkeyDoesNotMatch
];

for (const test of tests) {
    test();
    console.log(`PASS ${test.name}`);
}
