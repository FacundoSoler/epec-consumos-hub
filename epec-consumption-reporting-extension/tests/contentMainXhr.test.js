import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPageWindow, PAGE_ORIGIN } from './helpers/pageMock.js';

async function loadContentMain() {
    const page = installPageWindow({ originalFetch: vi.fn() });
    vi.resetModules();
    await import('../src/content-main.js');
    return page;
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('content-main XMLHttpRequest interceptor', () => {
    it('keeps the original constructor, its statics and instanceof', async () => {
        const { pageWindow, FakeXhr } = await loadContentMain();

        const xhr = new XMLHttpRequest();

        expect(globalThis.XMLHttpRequest).toBe(FakeXhr);
        expect(pageWindow.XMLHttpRequest).toBe(FakeXhr);
        expect(XMLHttpRequest.DONE).toBe(4);
        expect(xhr).toBeInstanceOf(FakeXhr);
    });

    it('still calls the original open and send', async () => {
        await loadContentMain();
        const xhr = new XMLHttpRequest();

        xhr.open('GET', '/api/usuarios/servicios');
        xhr.send('body');

        expect(xhr.openedWith).toEqual({ method: 'GET', url: '/api/usuarios/servicios' });
        expect(xhr.sentBody).toBe('body');
    });

    it('posts the login payload to the page origin when the login request loads', async () => {
        const { pageWindow } = await loadContentMain();
        const xhr = new XMLHttpRequest();

        xhr.open('POST', 'https://www.epec.com.ar/api/login');
        xhr.send();
        xhr.responseText = JSON.stringify({ token: 'tok' });
        xhr.fire('load');

        expect(pageWindow.postMessage).toHaveBeenCalledWith({ type: 'EPEC_NETWORK_LOGIN', data: { token: 'tok' } }, PAGE_ORIGIN);
    });

    it('does not listen to non-login requests', async () => {
        const { pageWindow } = await loadContentMain();
        const xhr = new XMLHttpRequest();

        xhr.open('GET', '/api/usuarios/contratos');
        xhr.send();
        xhr.responseText = '{}';
        xhr.fire('load');

        expect(xhr.listeners.load).toBeUndefined();
        expect(pageWindow.postMessage).not.toHaveBeenCalled();
    });

    it('swallows an unparseable login body without throwing into the site', async () => {
        const { pageWindow } = await loadContentMain();
        const xhr = new XMLHttpRequest();

        xhr.open('POST', '/api/login');
        xhr.send();
        xhr.responseText = '<html>error</html>';

        expect(() => xhr.fire('load')).not.toThrow();
        expect(pageWindow.postMessage).not.toHaveBeenCalled();
    });

    it('tracks URLs per request, so concurrent requests do not mix up', async () => {
        const { pageWindow } = await loadContentMain();
        const login = new XMLHttpRequest();
        const other = new XMLHttpRequest();

        login.open('POST', '/api/login');
        other.open('GET', '/api/other');
        other.send();
        login.send();
        login.responseText = '{"token":"t"}';
        other.fire('load');
        login.fire('load');

        expect(pageWindow.postMessage).toHaveBeenCalledTimes(1);
    });
});
