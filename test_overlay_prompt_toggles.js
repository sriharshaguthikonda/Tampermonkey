const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = __dirname;

const PROMPT_TOGGLES = [
    { id: 'tts-enter-to-send-toggle', key: 'ENTER_TO_SEND_ENABLED', setter: 'setEnterToSendEnabled', storageKey: 'enterToSendEnabled' },
    { id: 'tts-global-paste-toggle', key: 'GLOBAL_PASTE_ENABLED', setter: 'setGlobalPasteEnabled', storageKey: 'globalPasteEnabled' },
    { id: 'tts-regular-paste-toggle', key: 'REGULAR_PASTE_ENABLED', setter: 'setRegularPasteEnabled', storageKey: 'regularPasteEnabled' },
    { id: 'tts-regular-auto-send-toggle', key: 'REGULAR_AUTO_SEND', setter: 'setRegularAutoSendEnabled', storageKey: 'regularAutoSend' },
    { id: 'tts-regular-auto-send-in-input-toggle', key: 'REGULAR_AUTO_SEND_IN_INPUT', setter: 'setRegularAutoSendInInputEnabled', storageKey: 'regularAutoSendInInput' },
    { id: 'tts-double-click-edit-toggle', key: 'DOUBLE_CLICK_EDIT_ENABLED', setter: 'setDoubleClickEditEnabled', storageKey: 'doubleClickEditEnabled' },
    { id: 'tts-nice-auto-paste-toggle', key: 'NICE_AUTO_PASTE_ENABLED', setter: 'setNiceAutoPasteEnabled', storageKey: 'niceAutoPasteEnabled' },
    { id: 'tts-nice-auto-send-toggle', key: 'NICE_AUTO_SEND', setter: 'setNiceAutoSendEnabled', storageKey: 'niceAutoSend' }
];

function makeElementStub() {
    return {
        tagName: 'div',
        id: '',
        type: '',
        textContent: '',
        style: { setProperty() {}, cssText: '' },
        checked: false,
        listeners: {},
        setAttribute() {},
        appendChild() {},
        addEventListener(type, handler) {
            this.listeners[type] = handler;
        }
    };
}

function makePanelDocument() {
    const state = { panelHTML: '' };
    const registry = {};

    function parseCheckboxes(html) {
        const pattern = /<input type="checkbox" id="([^"]+)"([^>]*)>/g;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const el = makeElementStub();
            el.tagName = 'input';
            el.id = match[1];
            el.type = 'checkbox';
            el.checked = /\bchecked\b/.test(match[2]);
            registry[match[1]] = el;
        }
    }

    const document = {
        documentElement: { style: { setProperty() {} } },
        head: { appendChild() {} },
        body: {
            appendChild(el) {
                if (el && el.id === 'tts-control-panel') {
                    state.panelHTML = el.innerHTML;
                    parseCheckboxes(el.innerHTML);
                }
            }
        },
        createElement(tag) {
            return makeElementStub();
        },
        getElementById(id) {
            if (!registry[id]) registry[id] = makeElementStub();
            return registry[id];
        },
        querySelector() {
            return null;
        },
        addEventListener() {}
    };

    return { document, registry, state, getPanelHTML: () => state.panelHTML };
}

const NOOP_METHODS = [
    'applyOverlayPanelPosition',
    'makeDraggable',
    'applyOverlayVisibility',
    'ensureNavigationTrailLayer',
    'showNotification',
    'copyTranscriptFromOverlay',
    'copySelectionFromOverlay',
    'setWordHighlightEnabled',
    'setGapTrimEnabled',
    'setReadUserMessagesEnabled',
    'setReadReferencesEnabled',
    'setChatGPTTextStylingEnabled',
    'setLowGapMode',
    'setServerPrecacheMode',
    'setAutoReadEnabled',
    'setLoopEnabled',
    'setAutoScrollEnabled',
    'setSmartCopyEnabled',
    'setApplyStartSkipToNavigationStarts',
    'setClickStartSkipWords'
];

function makeUiRuntime(options = {}) {
    const persistCalls = [];
    const setterCalls = [];
    const { document, registry, getPanelHTML } = makePanelDocument();

    const reader = {
        CONFIG: {
            SPEECH_RATE: 1,
            NAV_FOCUS_FADE_MS: 500,
            WORD_HIGHLIGHT_ENABLED: true,
            GAP_TRIM_ENABLED: true,
            READ_USER_MESSAGES: false,
            READ_REFERENCES: false,
            CHATGPT_TEXT_STYLING: false,
            LOW_GAP_MODE: false,
            SERVER_PRECACHE_MODE: true,
            AUTO_READ_NEW_MESSAGES: false,
            LOOP_ON_END: true,
            AUTO_SCROLL_ENABLED: true,
            SMART_COPY_ENABLED: true,
            APPLY_START_SKIP_TO_NAVIGATION_STARTS: false,
            CLICK_START_SKIP_WORDS: 0,
            SHOW_DIAGNOSTICS_PANEL: false,
            OVERLAY_POSITION: null,
            ...options.config
        },
        settingsProfile: 'chatgpt',
        isChatGPTPage: options.isChatGPTPage !== false
    };
    for (const name of NOOP_METHODS) reader[name] = () => {};
    for (const toggle of PROMPT_TOGGLES) {
        reader[toggle.setter] = function (value) {
            setterCalls.push({ name: toggle.setter, value });
            this.CONFIG[toggle.key] = value;
            this.showNotification();
        };
    }

    const context = {
        console,
        URL,
        document,
        window: {
            __TTSNS: {
                TTSReader: reader,
                helpers: {
                    persistProfileSetting(profile, key, value) {
                        persistCalls.push({ profile, key, value });
                    }
                }
            }
        }
    };
    context.window.document = document;
    vm.createContext(context);

    const fullPath = path.join(repoRoot, 'edge-extension', 'modules', '87-ui.js');
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
    reader.createUI();

    return { reader, registry, persistCalls, setterCalls, getPanelHTML };
}

function testChatGPTOverlayRendersAllPromptTogglesMirroringConfig() {
    const config = {
        ENTER_TO_SEND_ENABLED: true,
        GLOBAL_PASTE_ENABLED: true,
        REGULAR_PASTE_ENABLED: false,
        REGULAR_AUTO_SEND: false,
        REGULAR_AUTO_SEND_IN_INPUT: true,
        DOUBLE_CLICK_EDIT_ENABLED: false,
        NICE_AUTO_PASTE_ENABLED: true,
        NICE_AUTO_SEND: false
    };
    const { registry, getPanelHTML } = makeUiRuntime({ config });

    for (const toggle of PROMPT_TOGGLES) {
        assert.ok(Object.prototype.hasOwnProperty.call(registry, toggle.id), `missing ${toggle.id}`);
        assert.strictEqual(
            registry[toggle.id].checked,
            config[toggle.key],
            `${toggle.id} should mirror CONFIG.${toggle.key}`
        );
    }
    assert.ok(getPanelHTML().includes('>Prompt<'), 'panel should contain the Prompt group header');
}

function testPromptToggleChangeFiresSetterAndPersistsProfileSetting() {
    const { reader, registry, persistCalls, setterCalls } = makeUiRuntime({
        config: {
            ENTER_TO_SEND_ENABLED: true,
            GLOBAL_PASTE_ENABLED: true,
            REGULAR_PASTE_ENABLED: false,
            REGULAR_AUTO_SEND: false,
            REGULAR_AUTO_SEND_IN_INPUT: true,
            DOUBLE_CLICK_EDIT_ENABLED: false,
            NICE_AUTO_PASTE_ENABLED: true,
            NICE_AUTO_SEND: false
        }
    });

    const niceAutoSend = registry['tts-nice-auto-send-toggle'];
    assert.strictEqual(niceAutoSend.checked, false);
    niceAutoSend.checked = true;
    niceAutoSend.listeners.change({ target: niceAutoSend });
    assert.deepStrictEqual(
        setterCalls.filter(c => c.name === 'setNiceAutoSendEnabled'),
        [{ name: 'setNiceAutoSendEnabled', value: true }]
    );
    assert.strictEqual(reader.CONFIG.NICE_AUTO_SEND, true);
    assert.ok(
        persistCalls.some(c => c.profile === 'chatgpt' && c.key === 'niceAutoSend' && c.value === true),
        'persistProfileSetting should record niceAutoSend=true'
    );

    const enterToSend = registry['tts-enter-to-send-toggle'];
    assert.strictEqual(enterToSend.checked, true);
    enterToSend.checked = false;
    enterToSend.listeners.change({ target: enterToSend });
    assert.deepStrictEqual(
        setterCalls.filter(c => c.name === 'setEnterToSendEnabled'),
        [{ name: 'setEnterToSendEnabled', value: false }]
    );
    assert.ok(
        persistCalls.some(c => c.profile === 'chatgpt' && c.key === 'enterToSendEnabled' && c.value === false),
        'persistProfileSetting should record enterToSendEnabled=false'
    );
}

function testSyncPromptTogglesReflectsExternalConfigChange() {
    const { reader, registry } = makeUiRuntime();

    reader.CONFIG.NICE_AUTO_SEND = true;
    reader.CONFIG.ENTER_TO_SEND_ENABLED = true;
    reader.syncPromptToggles();

    assert.strictEqual(registry['tts-nice-auto-send-toggle'].checked, true);
    assert.strictEqual(registry['tts-enter-to-send-toggle'].checked, true);
}

function testNonChatGPTOverlayOmitsPromptGroup() {
    const { reader, registry, getPanelHTML } = makeUiRuntime({ isChatGPTPage: false });

    assert.ok(reader.overlayPanel);
    const panelHTML = getPanelHTML();
    assert.ok(!panelHTML.includes('tts-nice-auto-send-toggle'));
    assert.ok(!panelHTML.includes('>Prompt<'));
    for (const toggle of PROMPT_TOGGLES) {
        assert.ok(
            !Object.prototype.hasOwnProperty.call(registry, toggle.id),
            `${toggle.id} must not be rendered on non-ChatGPT pages`
        );
    }
}

const BOOTSTRAP_SETTER_NAMES = [
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
    'setGlobalPasteEnabled',
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

async function testStorageChangeAppliesSettingsAndSyncsPromptToggles() {
    const state = { storageCallback: null, timers: [] };
    const { document, registry } = makePanelDocument();
    const chrome = {
        runtime: {},
        storage: {
            sync: {
                get(_query, callback) {
                    state.storageCallback = callback;
                }
            },
            onChanged: {
                addListener() {}
            }
        }
    };
    const context = {
        chrome,
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout(callback, delay) {
            const handle = { id: state.timers.length + 1 };
            state.timers.push({ callback, delay, handle });
            return handle;
        },
        clearTimeout() {},
        document,
        window: {
            location: { href: 'https://chatgpt.com/' },
            speechSynthesis: null
        }
    };
    vm.createContext(context);

    const loadModule = (name) => {
        const fullPath = path.join(repoRoot, 'edge-extension', 'modules', name);
        vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
    };

    loadModule('00-namespace.js');
    const reader = context.window.__TTSNS.TTSReader;
    for (const name of BOOTSTRAP_SETTER_NAMES) reader[name] = () => {};
    reader.normalizeServerBaseUrl = (value) => value;
    reader.init = () => {};
    reader.makeDraggable = reader.applyOverlayPanelPosition = reader.applyOverlayVisibility =
        reader.ensureNavigationTrailLayer = reader.showNotification = () => {};
    reader.isChatGPTPage = true;
    reader.CONFIG.SHOW_DIAGNOSTICS_PANEL = false;
    for (const toggle of PROMPT_TOGGLES) {
        reader[toggle.setter] = function (value) {
            this.CONFIG[toggle.key] = value;
        };
    }

    loadModule('87-ui.js');
    reader.createUI();
    assert.strictEqual(registry['tts-nice-auto-send-toggle'].checked, false);

    loadModule('99-bootstrap.js');
    assert.ok(state.storageCallback, 'storage.sync.get callback should be captured');
    assert.strictEqual(state.timers.length, 1);
    assert.strictEqual(state.timers[0].delay, 2000);

    state.storageCallback({
        settingsByProfile: {
            chatgpt: { niceAutoSend: true }
        }
    });

    assert.strictEqual(registry['tts-nice-auto-send-toggle'].checked, true);
}

const tests = [
    testChatGPTOverlayRendersAllPromptTogglesMirroringConfig,
    testPromptToggleChangeFiresSetterAndPersistsProfileSetting,
    testSyncPromptTogglesReflectsExternalConfigChange,
    testNonChatGPTOverlayOmitsPromptGroup,
    testStorageChangeAppliesSettingsAndSyncsPromptToggles
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
