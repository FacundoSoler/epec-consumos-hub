import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { API_BASE_URLS, buildManifest } from './buildModes.js';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(extensionRoot, 'src');
const distDir = resolve(extensionRoot, 'dist');
const CONTENT_SCRIPTS = ['content-main', 'content-isolated'];

function sharedConfig(mode) {
    return {
        root: srcDir,
        configFile: false,
        logLevel: 'warn',
        mode,
        define: { __API_BASE_URL__: JSON.stringify(API_BASE_URLS[mode]) },
        build: { outDir: distDir, minify: false, sourcemap: mode === 'development' }
    };
}

function buildModuleEntries(mode) {
    const config = sharedConfig(mode);
    return build({
        ...config,
        base: './',
        build: {
            ...config.build,
            emptyOutDir: true,
            rollupOptions: {
                input: {
                    background: resolve(srcDir, 'background.js'),
                    popup: resolve(srcDir, 'popup.html')
                },
                output: {
                    entryFileNames: '[name].js',
                    chunkFileNames: 'chunks/[name].js',
                    assetFileNames: 'assets/[name][extname]'
                }
            }
        }
    });
}

// MV3 content scripts cannot be ES modules, so each one is bundled alone as a classic IIFE script.
function buildContentScript(mode, name) {
    const config = sharedConfig(mode);
    return build({
        ...config,
        build: {
            ...config.build,
            emptyOutDir: false,
            lib: {
                entry: resolve(srcDir, `${name}.js`),
                formats: ['iife'],
                name: name.replace('-', '_'),
                fileName: () => `${name}.js`
            }
        }
    });
}

function writeManifest(mode) {
    const sourceManifest = JSON.parse(readFileSync(resolve(extensionRoot, 'manifest.json'), 'utf8'));
    writeFileSync(resolve(distDir, 'manifest.json'), JSON.stringify(buildManifest(sourceManifest, mode), null, 4));
}

const mode = process.argv[2] === 'development' ? 'development' : 'production';
await buildModuleEntries(mode);
for (const name of CONTENT_SCRIPTS) {
    await buildContentScript(mode, name);
}
writeManifest(mode);
console.log(`Built ${mode} extension into dist/ (API: ${API_BASE_URLS[mode]})`);
