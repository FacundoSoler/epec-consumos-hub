import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import { mockEpecApi } from './helpers/epecApiMock.js';

const loginPayload = { documento: 30111222, nombre: 'Ana', apellido: 'Paz', email: 'ana@example.com', token: 'tok' };
const storedUser = { ...loginPayload, contratos: [{ id: 'C1' }] };

async function loadBackground(initialStorage = {}) {
    const mock = createChromeMock(initialStorage);
    vi.stubGlobal('chrome', mock.chrome);
    vi.resetModules();
    await import('../src/background.js');
    return mock;
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('background service worker', () => {
    it('loads as a module and registers a message listener', async () => {
        mockEpecApi();
        const mock = await loadBackground();

        expect(mock.messageListeners.length).toBeGreaterThan(0);
    });

    it('stores the parsed contracts array on login, then fetches consumption', async () => {
        mockEpecApi({ contracts: [{ id: 'C1' }, { id: 'C2' }] });
        const mock = await loadBackground();

        mock.dispatch({ type: 'LOGIN_EPEC_SESSION', payload: loginPayload });

        await vi.waitFor(() => expect(mock.storage.consumptionData).toBeDefined());
        expect(mock.storage.epecUser.contratos).toEqual([{ id: 'C1' }, { id: 'C2' }]);
        expect(mock.storage.epecUser.email).toBe('ana@example.com');
    });

    it('keeps contratos null when EPEC returns no contract list', async () => {
        mockEpecApi({ contracts: {} });
        const mock = await loadBackground();

        mock.dispatch({ type: 'LOGIN_EPEC_SESSION', payload: loginPayload });

        await vi.waitFor(() => expect(mock.storage.epecUser).toBeDefined());
        expect(mock.storage.epecUser.contratos).toBeNull();
        expect(mock.storage.consumptionData).toBeUndefined();
    });

    it('refreshData reads EPEC directly, never the removed /api/epec routes', async () => {
        const fetchMock = mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response).toEqual({ success: true });
        const urls = fetchMock.mock.calls.map(([url]) => url);
        expect(urls.every((url) => url.startsWith('https://www.epec.com.ar/api/'))).toBe(true);
        expect(urls.some((url) => url.includes('/consumos/tipo-medicion'))).toBe(true);
        expect(urls.some((url) => url.includes('desde=01112026'))).toBe(true);
    });

    it('stores readings as numbers, newest first', async () => {
        mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser });

        await mock.dispatch({ action: 'refreshData' });

        expect(mock.storage.consumptionData.map((r) => r.consumo)).toEqual([12, 10.5]);
    });

    it('refreshData reports failure instead of throwing when no user is stored', async () => {
        mockEpecApi();
        const mock = await loadBackground();

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response).toEqual({ success: false });
    });
});
