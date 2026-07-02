const fs = require('fs');
const path = require('path');

const repoRoot = __dirname;
const sourceDir = path.join(repoRoot, 'edge-extension');
const distDir = path.join(repoRoot, 'dist');
const validChannels = new Set(['dev', 'prod']);

function countFiles(dir) {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            count += countFiles(fullPath);
        } else if (entry.isFile()) {
            count += 1;
        }
    }
    return count;
}

function createBuildInfo(channel, builtAt) {
    return `(function () {
    'use strict';

    if (window.__TTSNS) {
        window.__TTSNS.BUILD = Object.freeze({ channel: '${channel}', builtAt: '${builtAt}' });
    }
})();
`;
}

function addBuildInfoToManifest(manifest) {
    const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
    for (const script of contentScripts) {
        if (!script || !Array.isArray(script.js)) continue;
        const js = script.js.filter(item => item !== 'modules/01-build-info.js');
        const namespaceIndex = js.indexOf('modules/00-namespace.js');
        if (namespaceIndex === -1) {
            js.unshift('modules/01-build-info.js');
        } else {
            js.splice(namespaceIndex + 1, 0, 'modules/01-build-info.js');
        }
        script.js = js;
    }
}

function buildChannel(channel) {
    if (!validChannels.has(channel)) {
        throw new Error(`Unknown build channel: ${channel}`);
    }

    const outputDir = path.join(distDir, channel);
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(outputDir), { recursive: true });
    fs.cpSync(sourceDir, outputDir, { recursive: true });

    const builtAt = new Date().toISOString();
    const modulesDir = path.join(outputDir, 'modules');
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.writeFileSync(path.join(modulesDir, '01-build-info.js'), createBuildInfo(channel, builtAt), 'utf8');

    const manifestPath = path.join(outputDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const originalName = manifest.name;
    if (channel === 'dev') {
        manifest.name = originalName.endsWith(' (DEV)') ? originalName : `${originalName} (DEV)`;
    }
    addBuildInfoToManifest(manifest);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');

    console.log(`${channel}: ${outputDir} (${countFiles(outputDir)} files, manifest name: ${manifest.name})`);
}

function main() {
    const requested = process.argv.slice(2);
    const channels = requested.length === 0 ? ['dev', 'prod'] : requested;
    for (const channel of channels) {
        buildChannel(channel);
    }
}

main();
