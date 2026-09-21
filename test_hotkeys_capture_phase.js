const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

function makeRuntime() {
    const composer = {
        tagName: 'DIV',
        isContentEditable: true,
        focus() {}
    };
    const body = { style: {}, tagName: 'BODY' };
    const documentListeners = {};
    const windowListeners = {};
    const document = {
        activeElement: body,
        body,
        addEventListener(type, handler, options) {
            documentListeners[type] = { handler, options };
        }
    };
    const window = {
        __TTSNS: {
            TTSReader: null,
            helpers: {
                persistProfileSetting: () => {}
            }
        },
        addEventListener(type, handler, options) {
            windowListeners[type] = { handler, options };
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
        window
    };
    context.window.document = document;
    vm.createContext(context);
    return { context, document, window, composer, body, documentListeners, windowListeners };
}

function makeHotkeyReader() {
    const counts = { clearStalePlaybackFlagsIfIdle: 0 };
    const reader = {
        CONFIG: {
            HOTKEYS: {
                ACTIVATE: 'U',
                PAUSE_RESUME: 'P',
                NAV_NEXT: 'ArrowRight',
                NAV_PREV: 'ArrowLeft',
                STOP: 'Escape',
                REPLAY: 'R',
                LOOP_TOGGLE: 'L',
                AUTOSCROLL_TOGGLE: 'S',
                SESSION_PAUSE: 'K',
                BOUNDARY_START: 'Home',
                BOUNDARY_END: 'End',
                SPEED_DOWN: '[',
                SPEED_UP: ']'
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
        navigate() {
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
        clearStalePlaybackFlagsIfIdle() {
            counts.clearStalePlaybackFlagsIfIdle += 1;
        },
        isPlaybackSessionActive: () => false,
        showNotification() {},
        startReadingFromPendingNav() {},
        handleSmartCopyCopyEvent() {},
        handleSelectionSeek() {},
        applyOverlayPanelPosition() {},
        resizeNavigationTrailLayer() {},
        renderNavigationTrail() {},
        handleVisibilityPlaybackGuard() {},
        logPlaybackGuardEvent() {}
    };
    return { reader, counts };
}

function loadModule(runtime, relativePath) {
    const fullPath = path.join(repoRoot, relativePath);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), runtime.context, { filename: fullPath });
}

function makeTestRuntime() {
    const runtime = makeRuntime();
    const { reader, counts } = makeHotkeyReader();
    runtime.context.window.__TTSNS.TTSReader = reader;

    let pageListenerCalls = 0;
    runtime.document.addEventListener('keydown', () => {
        pageListenerCalls += 1;
        runtime.document.activeElement = runtime.composer;
    });
    const pageListener = runtime.documentListeners.keydown.handler;

    loadModule(runtime, 'edge-extension/modules/85-events.js');
    reader.setupEventListeners();

    const windowKeydown = runtime.windowListeners.keydown;
    const documentKeydown = runtime.documentListeners.keydown;

    function dispatchKey(key, overrides = {}) {
        const e = {
            key,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefaultCalled: false,
            stopImmediatePropagationCalled: false,
            preventDefault() {
                this.preventDefaultCalled = true;
            },
            stopImmediatePropagation() {
                this.stopImmediatePropagationCalled = true;
            },
            ...overrides
        };
        windowKeydown.handler(e);
        if (!e.stopImmediatePropagationCalled) pageListener(e);
        if (!e.stopImmediatePropagationCalled) documentKeydown.handler(e);
        return e;
    }

    return {
        reader,
        counts,
        document: runtime.document,
        composer: runtime.composer,
        body: runtime.body,
        windowKeydown,
        documentKeydown,
        pageListenerCallsGetter: () => pageListenerCalls,
        dispatchKey
    };
}

function testWindowKeydownListenerIsCapturePhase() {
    const rt = makeTestRuntime();

    assert.strictEqual(typeof rt.windowKeydown.handler, 'function');
    assert.strictEqual(rt.windowKeydown.options, true);
    assert.strictEqual(rt.documentKeydown.options, undefined);
}

function testShiftUHandledInCaptureBeforeTypeAnywhere() {
    const rt = makeTestRuntime();
    rt.document.activeElement = rt.body;

    const e = rt.dispatchKey('U', { shiftKey: true });

    assert.strictEqual(rt.counts.clearStalePlaybackFlagsIfIdle, 1);
    assert.strictEqual(rt.pageListenerCallsGetter(), 0);
    assert.strictEqual(e.preventDefaultCalled, true);
    assert.strictEqual(e.stopImmediatePropagationCalled, true);
    assert.strictEqual(rt.document.activeElement, rt.body);
}

function testPlainKeyPropagatesToPageListener() {
    const rt = makeTestRuntime();
    rt.document.activeElement = rt.body;

    const e = rt.dispatchKey('a');

    assert.strictEqual(rt.pageListenerCallsGetter(), 1);
    assert.strictEqual(e.preventDefaultCalled, false);
    assert.strictEqual(e.stopImmediatePropagationCalled, false);
    assert.strictEqual(rt.counts.clearStalePlaybackFlagsIfIdle, 0);
}

function testShiftUIgnoredInsideComposer() {
    const rt = makeTestRuntime();
    rt.document.activeElement = rt.composer;

    const e = rt.dispatchKey('U', { shiftKey: true });

    assert.strictEqual(rt.counts.clearStalePlaybackFlagsIfIdle, 0);
    assert.strictEqual(e.preventDefaultCalled, false);
    assert.ok(rt.pageListenerCallsGetter() >= 1);
}

function testShiftUHandledWhenPageMovedFocusFirst() {
    // a page capture listener that ran first already focused the composer,
    // but the key was pressed on the body (e.target)
    const rt = makeTestRuntime();
    rt.document.activeElement = rt.composer;

    const e = rt.dispatchKey('U', { shiftKey: true, target: { nodeType: 1, tagName: 'BODY', isContentEditable: false } });

    assert.strictEqual(rt.counts.clearStalePlaybackFlagsIfIdle, 1);
    assert.strictEqual(e.preventDefaultCalled, true);
}

function testEarlyShimReceivesHandler() {
    // 00-early-keydown.js ran at document_start: 85-events.js must hand its
    // handler to the shim instead of adding a late window listener
    const runtime = makeRuntime();
    const { reader, counts } = makeHotkeyReader();
    runtime.context.window.__TTSNS.TTSReader = reader;
    loadModule(runtime, 'edge-extension/modules/00-early-keydown.js');
    const shim = runtime.windowListeners.keydown;
    loadModule(runtime, 'edge-extension/modules/85-events.js');
    reader.setupEventListeners();

    assert.strictEqual(shim.options, true);
    assert.strictEqual(runtime.windowListeners.keydown, shim);
    assert.strictEqual(typeof runtime.window.__TTSEarlyKeydown, 'function');
    shim.handler({
        key: 'U', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false,
        target: runtime.body,
        preventDefault() {},
        stopImmediatePropagation() {}
    });
    assert.strictEqual(counts.clearStalePlaybackFlagsIfIdle, 1);
}

const tests = [
    testWindowKeydownListenerIsCapturePhase,
    testShiftUHandledInCaptureBeforeTypeAnywhere,
    testPlainKeyPropagatesToPageListener,
    testShiftUIgnoredInsideComposer,
    testShiftUHandledWhenPageMovedFocusFirst,
    testEarlyShimReceivesHandler
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
