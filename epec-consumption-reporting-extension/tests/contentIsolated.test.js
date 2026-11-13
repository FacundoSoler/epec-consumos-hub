import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import { installPageWindow, PAGE_ORIGIN } from './helpers/pageMock.js';

async function loadContentIsolated({ persistedSession = null } = {}) {
    const page = installPageWindow();
    const chromeMock = createChromeMock();
    vi.stubGlobal('chrome', chromeMock.chrome);
    vi.stubGlobal('document', { readyState: 'complete' });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => persistedSession) });
    vi.resetModules();
    await import('../src/content-isolated.js');

    const deliver = (event) => page.messageListeners.forEach((listener) => listener(event));
    return { ...page, sendMessage: chromeMock.chrome.runtime.sendMessage, deliver };
}

const loginData = { type: 'EPEC_NETWORK_LOGIN', data: { token: 'tok' } };

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('content-isolated message relay', () => {
    it('forwards a login message posted by the page itself', async () => {
        const { pageWindow, deliver, sendMessage } = await loadContentIsolated();

        deliver({ source: pageWindow, origin: PAGE_ORIGIN, data: loginData });

        expect(sendMessage).toHaveBeenCalledWith({ type: 'LOGIN_EPEC_SESSION', payload: { token: 'tok' } });
    });

    it('ignores a forged login posted by an embedded frame', async () => {
        const { deliver, sendMessage } = await loadContentIsolated();

        deliver({ source: { some: 'iframe' }, origin: PAGE_ORIGIN, data: loginData });

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('ignores a login message from another origin', async () => {
        const { pageWindow, deliver, sendMessage } = await loadContentIsolated();

        deliver({ source: pageWindow, origin: 'https://evil.example', data: loginData });

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it.each([
        ['no data', undefined],
        ['another message type', { type: 'SOMETHING_ELSE' }]
    ])('ignores same-page messages with %s', async (_label, data) => {
        const { pageWindow, deliver, sendMessage } = await loadContentIsolated();

        deliver({ source: pageWindow, origin: PAGE_ORIGIN, data });

        expect(sendMessage).not.toHaveBeenCalled();
    });
});

describe('content-isolated persisted session replay', () => {
    it('replays a session saved by the EPEC site', async () => {
        const { sendMessage } = await loadContentIsolated({ persistedSession: '{"token":"saved"}' });

        expect(sendMessage).toHaveBeenCalledWith({ type: 'LOGIN_EPEC_SESSION', payload: { token: 'saved' } });
    });

    it.each([null, '', '{}', '   '])('skips an empty persisted session (%j)', async (persistedSession) => {
        const { sendMessage } = await loadContentIsolated({ persistedSession });

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('survives a corrupt persisted session', async () => {
        const { sendMessage } = await loadContentIsolated({ persistedSession: '{broken' });

        expect(sendMessage).not.toHaveBeenCalled();
    });
});
