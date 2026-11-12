import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPageWindow, PAGE_ORIGIN } from './helpers/pageMock.js';

function fakeResponse(body, { isJson = true } = {}) {
    const response = {
        clone: () => ({ json: async () => (isJson ? body : JSON.parse('not json')) })
    };
    return response;
}

async function loadContentMain(originalFetch) {
    const page = installPageWindow({ originalFetch });
    vi.resetModules();
    await import('../src/content-main.js');
    return page;
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('content-main fetch interceptor', () => {
    it('returns the original response for non-login calls', async () => {
        const response = fakeResponse({});
        const { pageWindow } = await loadContentMain(vi.fn().mockResolvedValue(response));

        await expect(pageWindow.fetch('https://www.epec.com.ar/api/usuarios/servicios')).resolves.toBe(response);
        expect(pageWindow.postMessage).not.toHaveBeenCalled();
    });

    it('forwards every argument to the original fetch', async () => {
        const originalFetch = vi.fn().mockResolvedValue(fakeResponse({}));
        const { pageWindow } = await loadContentMain(originalFetch);
        const init = { method: 'POST', body: '{}' };

        await pageWindow.fetch('/api/anything', init);

        expect(originalFetch).toHaveBeenCalledWith('/api/anything', init);
    });

    it('posts the login payload to the page origin and still returns the response', async () => {
        const loginBody = { token: 'tok', email: 'ana@example.com' };
        const response = fakeResponse(loginBody);
        const { pageWindow } = await loadContentMain(vi.fn().mockResolvedValue(response));

        await expect(pageWindow.fetch('https://www.epec.com.ar/api/login')).resolves.toBe(response);

        expect(pageWindow.postMessage).toHaveBeenCalledWith({ type: 'EPEC_NETWORK_LOGIN', data: loginBody }, PAGE_ORIGIN);
    });

    it('never posts to the "*" wildcard target', async () => {
        const { pageWindow } = await loadContentMain(vi.fn().mockResolvedValue(fakeResponse({})));

        await pageWindow.fetch('/api/login');

        expect(pageWindow.postMessage.mock.calls.every(([, target]) => target !== '*')).toBe(true);
    });

    it('detects the login call when fetch receives a Request object', async () => {
        const { pageWindow } = await loadContentMain(vi.fn().mockResolvedValue(fakeResponse({ token: 't' })));

        await pageWindow.fetch(new Request('https://www.epec.com.ar/api/login', { method: 'POST' }));

        expect(pageWindow.postMessage).toHaveBeenCalledTimes(1);
    });

    it('returns the response even if the login body is not JSON', async () => {
        const response = fakeResponse(null, { isJson: false });
        const { pageWindow } = await loadContentMain(vi.fn().mockResolvedValue(response));

        await expect(pageWindow.fetch('/api/login')).resolves.toBe(response);
        expect(pageWindow.postMessage).not.toHaveBeenCalled();
    });
});
