const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;
const setterNames = [
    'setSpeechRate',
    'setVoiceUri',
    'setEmojiVoiceMappings',
    'setWordHighlightEnabled',
    'setGapTrimEnabled',
    'setAutoReadEnabled',
    'setReadUserMessagesEnabled',
    'setReadReferencesEnabled',
    'setChatGPTTextStylingEnabled',
    'setLowGapMode',
    'setServerPrecacheMode',
    'setServerTextNormalizationEnabled',
    'setServerQuotePolicy',
    'setServerCustomRemovalMode',
    'setLoopEnabled',
    'setAutoScrollEnabled',
    'setIdleArrowNavigationEnabled',
    'setPromptHistoryNavigationEnabled',
    'setPageOverlayEnabled',
    'setOverlayPosition',
    'setVolumeBoostEnabled',
    'setVolumeBoostLevel',
    'setEnterToSendEnabled',
    'setRegularPasteEnabled',
    'setRegularAutoSendEnabled',
    'setRegularAutoSendInInputEnabled',
    'setNiceAutoPasteEnabled',
    'setNiceAutoSendEnabled',
    'setCopyButtonEnabled',
    'setSmartCopyEnabled',
    'setSmartCopyMode',
    'setCopyFormat',
    'setClickStartSkipWords',
    'setDoubleClickEditEnabled',
    'setAutoCloseLimitWarningEnabled',
    'setLimitWarningDelay',
    'setHiddenTabPolicy',
    'setAutoPauseHiddenDelayMs',
    'setAutoReadStartSkipChars',
    'setAutoReadStartSkipAmount',
    'setAutoReadStartSkipUnit',
    'setAutoReadLoopCurrentMessage',
    'setApplyStartSkipToNavigationStarts',
    'setHotkeys'
];

function loadSandbox(options = {}) {
    const state = {
        clearTimeoutCalls: [],
        errorLogs: [],
        globalPasteCalls: [],
        initCalls: 0,
        storageCallback: null,
        timers: [],
        warnLogs: []
    };
    const runtime = { lastError: null };
    const chrome = {
        runtime,
        storage: {
            sync: {
                get(_query, callback) {
                    state.storageCallback = callback;
                }
            },
            onChanged: {
                addListener(listener) {
                    state.storageChangeListener = listener;
                }
            }
        }
    };
    const fakeConsole = {
        log() {},
        warn(...args) {
            state.warnLogs.push(args);
        },
        error(...args) {
            state.errorLogs.push(args);
        }
    };
    const context = {
        chrome,
        console: fakeConsole,
        document: {},
        URL,
        clearTimeout(handle) {
            state.clearTimeoutCalls.push(handle);
        },
        setTimeout(callback, delay) {
            const handle = { id: state.timers.length + 1 };
            state.timers.push({ callback, delay, handle });
            return handle;
        },
        window: {
            location: { href: 'https://chatgpt.com/' },
            speechSynthesis: null
        }
    };
    vm.createContext(context);

    const namespacePath = path.join(repoRoot, 'edge-extension', 'modules', '00-namespace.js');
    vm.runInContext(fs.readFileSync(namespacePath, 'utf8'), context, { filename: namespacePath });

    const reader = context.window.__TTSNS.TTSReader;
    for (const name of setterNames) reader[name] = () => {};
    reader.normalizeServerBaseUrl = (value) => value;
    reader.setGlobalPasteEnabled = (value) => {
        state.globalPasteCalls.push(value);
        if (options.throwGlobalPasteSetter) throw new Error('setGlobalPasteEnabled failed');
    };
    reader.init = () => {
        state.initCalls += 1;
    };

    const bootstrapPath = path.join(repoRoot, 'edge-extension', 'modules', '99-bootstrap.js');
    vm.runInContext(fs.readFileSync(bootstrapPath, 'utf8'), context, { filename: bootstrapPath });

    return { chrome, reader, state };
}

let failures = 0;
function runCase(name, body) {
    try {
        body();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.log(`FAIL ${name}: ${error.message}`);
    }
}

const lateCallbackSandbox = loadSandbox();
runCase('timeout initializes when storage callback never fires', () => {
    assert.strictEqual(lateCallbackSandbox.state.timers.length, 1);
    assert.strictEqual(lateCallbackSandbox.state.timers[0].delay, 2000);
    lateCallbackSandbox.state.timers[0].callback();
    assert.strictEqual(lateCallbackSandbox.state.initCalls, 1);
});

runCase('late storage callback reapplies settings without reinitializing', () => {
    const callsBeforeCallback = lateCallbackSandbox.state.globalPasteCalls.length;
    lateCallbackSandbox.state.storageCallback({
        settingsByProfile: {
            chatgpt: { globalPasteEnabled: false }
        }
    });
    assert.strictEqual(lateCallbackSandbox.state.initCalls, 1);
    assert.ok(lateCallbackSandbox.state.globalPasteCalls.length > callsBeforeCallback);
    assert.strictEqual(lateCallbackSandbox.state.globalPasteCalls.at(-1), false);
});

runCase('runtime lastError initializes with profile defaults', () => {
    const sandbox = loadSandbox();
    sandbox.chrome.runtime.lastError = { message: 'storage unavailable' };
    sandbox.state.storageCallback({ globalPasteEnabled: false });
    assert.strictEqual(sandbox.state.initCalls, 1);
    assert.strictEqual(sandbox.state.globalPasteCalls.at(-1), true);
    assert.deepStrictEqual(sandbox.state.clearTimeoutCalls, [sandbox.state.timers[0].handle]);
});

runCase('applySettings setter failure does not block init', () => {
    const sandbox = loadSandbox({ throwGlobalPasteSetter: true });
    sandbox.state.storageCallback({});
    assert.strictEqual(sandbox.state.initCalls, 1);
    assert.ok(sandbox.state.errorLogs.length > 0);
});

if (failures > 0) process.exitCode = 1;
