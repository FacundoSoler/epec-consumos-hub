import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(extensionRoot, 'manifest.json'), 'utf8'));

function referencedFiles() {
    return [
        manifest.background?.service_worker,
        manifest.action?.default_popup,
        ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? [])
    ].filter(Boolean);
}

describe('manifest.json', () => {
    it('points the popup at src/popup.html', () => {
        expect(manifest.action.default_popup).toBe('src/popup.html');
    });

    it('requests only the storage permission (chrome.tabs.create needs no "tabs")', () => {
        expect(manifest.permissions).toEqual(['storage']);
    });

    it.each(referencedFiles())('references an existing file: %s', (path) => {
        expect(existsSync(resolve(extensionRoot, path))).toBe(true);
    });

    it('only references .js scripts, since Chrome cannot run TypeScript', () => {
        const scripts = referencedFiles().filter((path) => !path.endsWith('.html'));
        expect(scripts.every((path) => path.endsWith('.js'))).toBe(true);
    });
});
