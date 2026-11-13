import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { API_BASE_URLS, buildManifest } from '../build/buildModes.js';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(readFileSync(resolve(extensionRoot, 'manifest.json'), 'utf8'));

describe('buildManifest', () => {
    it('drops every localhost reference from the production manifest', () => {
        const manifest = buildManifest(sourceManifest, 'production');
        expect(JSON.stringify(manifest)).not.toContain('localhost');
        expect(manifest.host_permissions).toEqual(['https://www.epec.com.ar/*']);
    });

    it('keeps the local server permission in the development manifest', () => {
        expect(buildManifest(sourceManifest, 'development').host_permissions).toContain('http://localhost:3000/*');
    });

    it('points every entry at the root of dist/', () => {
        const manifest = buildManifest(sourceManifest, 'production');
        expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
        expect(manifest.action.default_popup).toBe('popup.html');
        expect(manifest.content_scripts.map((script) => script.js)).toEqual([['content-main.js'], ['content-isolated.js']]);
    });

    it('keeps content-main.js in the MAIN world at document_start', () => {
        const [main] = buildManifest(sourceManifest, 'production').content_scripts;
        expect(main).toMatchObject({ world: 'MAIN', run_at: 'document_start' });
    });

    it('does not mutate the source manifest', () => {
        const copy = structuredClone(sourceManifest);
        buildManifest(sourceManifest, 'production');
        expect(sourceManifest).toEqual(copy);
    });
});

describe('API_BASE_URLS', () => {
    it('uses Railway in production and the local server in development', () => {
        expect(API_BASE_URLS.production).toBe('https://epec-consumos-hub-production.up.railway.app/api');
        expect(API_BASE_URLS.development).toBe('http://localhost:3000/api');
    });
});
