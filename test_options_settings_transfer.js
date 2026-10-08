const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../driftwatch/node_modules/jsdom');

const repoRoot = __dirname;
const html = fs.readFileSync(path.join(repoRoot, 'edge-extension', 'options.html'), 'utf8');
const profileSource = fs.readFileSync(path.join(repoRoot, 'edge-extension', 'profile.js'), 'utf8');
const optionsSource = fs.readFileSync(path.join(repoRoot, 'edge-extension', 'options.js'), 'utf8');

function getWithDefaults(store, query) {
    if (query === null) return { ...store };
    const result = { ...query };
    Object.keys(query || {}).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
    });
    return result;
}

function makeRuntime(initialSync = {}) {
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        url: 'chrome-extension://test/options.html'
    });
    const { window } = dom;
    const syncStore = { ...initialSync };
    const localStore = {};
    const syncSets = [];
    let exportedBlob = null;
    let exportedFilename = '';

    window.Blob = Blob;
    window.URL.createObjectURL = (blob) => {
        exportedBlob = blob;
        return 'blob:test';
    };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {
        exportedFilename = this.download;
    };
    window.chrome = {
        storage: {
            sync: {
                get(query, callback) {
                    callback(getWithDefaults(syncStore, query));
                },
                set(items, callback) {
                    Object.assign(syncStore, items);
                    syncSets.push(items);
                    if (callback) callback();
                }
            },
            local: {
                get(query, callback) {
                    callback(getWithDefaults(localStore, query));
                },
                set(items, callback) {
                    Object.assign(localStore, items);
                    if (callback) callback();
                }
            }
        }
    };

    window.eval(profileSource);
    window.eval(optionsSource);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    return {
        dom,
        window,
        syncStore,
        syncSets,
        getExportedBlob: () => exportedBlob,
        getExportedFilename: () => exportedFilename
    };
}

function importText(runtime, text) {
    const input = runtime.window.document.getElementById('importSettingsFile');
    Object.defineProperty(input, 'files', {
        configurable: true,
        value: [{ text: async () => text }]
    });
    input.dispatchEvent(new runtime.window.Event('change'));
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function testExportPayloadShape() {
    const settingsByProfile = {
        chatgpt: { autoRead: true, speechRate: 2, ignored: () => true },
        local: { hotkeys: { activate: 'G' } }
    };
    const runtime = makeRuntime({ settingsByProfile });
    runtime.window.document.getElementById('exportSettingsBtn').click();

    const exported = JSON.parse(await runtime.getExportedBlob().text());
    assert.strictEqual(exported.format, 'tts-settings');
    assert.strictEqual(exported.version, 1);
    assert.strictEqual(exported.settingsByProfile.chatgpt.autoRead, true);
    assert.strictEqual(exported.settingsByProfile.chatgpt.speechRate, 2);
    assert.ok(!Object.prototype.hasOwnProperty.call(exported.settingsByProfile.chatgpt, 'ignored'));
    assert.match(runtime.getExportedFilename(), /^tts-settings-.*\.json$/);
    runtime.dom.window.close();
}

async function testImportFiltersAndMerges() {
    const runtime = makeRuntime({
        settingsByProfile: {
            chatgpt: {
                speechRate: 2,
                loopOnEnd: false,
                voiceUri: 'existing-voice',
                hotkeys: { activate: 'Q', pauseResume: 'X' }
            }
        }
    });
    await importText(runtime, JSON.stringify({
        format: 'tts-settings',
        version: 1,
        settingsByProfile: {
            chatgpt: {
                autoRead: true,
                speechRate: 'fast',
                bogusKey: 'discard me',
                hotkeys: { activate: 'Z', pauseResume: 12, bogus: 'B' }
            },
            unknown: { autoRead: false }
        }
    }));

    const profiles = runtime.syncStore.settingsByProfile;
    assert.strictEqual(profiles.chatgpt.autoRead, true);
    assert.strictEqual(profiles.chatgpt.speechRate, 2);
    assert.strictEqual(profiles.chatgpt.loopOnEnd, false);
    assert.strictEqual(profiles.chatgpt.voiceUri, 'existing-voice');
    assert.ok(!Object.prototype.hasOwnProperty.call(profiles.chatgpt, 'bogusKey'));
    assert.strictEqual(profiles.chatgpt.hotkeys.activate, 'Z');
    assert.strictEqual(profiles.chatgpt.hotkeys.pauseResume, 'X');
    assert.strictEqual(profiles.chatgpt.hotkeys.navNext, 'ArrowRight');
    assert.ok(!Object.prototype.hasOwnProperty.call(profiles.chatgpt.hotkeys, 'bogus'));
    assert.ok(!Object.prototype.hasOwnProperty.call(profiles, 'unknown'));
    assert.strictEqual(runtime.syncSets.length, 1);
    assert.strictEqual(runtime.window.document.getElementById('saveBtn').textContent, 'Imported');
    assert.strictEqual(runtime.window.document.getElementById('importSettingsFile').value, '');
    runtime.dom.window.close();
}

async function testMalformedImportLeavesStorageUntouched() {
    const initial = { chatgpt: { autoRead: false, speechRate: 3 } };
    const runtime = makeRuntime({ settingsByProfile: initial });
    await importText(runtime, '{bad json');

    assert.deepStrictEqual(runtime.syncStore.settingsByProfile, initial);
    assert.strictEqual(runtime.syncSets.length, 0);
    assert.strictEqual(runtime.window.document.getElementById('saveBtn').textContent, 'Import failed');
    assert.strictEqual(runtime.window.document.getElementById('importSettingsFile').value, '');
    runtime.dom.window.close();
}

(async () => {
    await testExportPayloadShape();
    await testImportFiltersAndMerges();
    await testMalformedImportLeavesStorageUntouched();
    console.log('options settings transfer tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
