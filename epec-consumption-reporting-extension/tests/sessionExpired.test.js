import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import { mockEpecApi } from './helpers/epecApiMock.js';

const loginPayload = { documento: 30111222, nombre: 'Ana', apellido: 'Paz', email: 'ana@example.com', token: 'new-tok' };
const storedUser = { ...loginPayload, token: 'old-tok', contratos: [{ id: 'C1' }] };
const reportPrefs = { email_reports: { enabled: true, days: ['0', '1', '2', '3', '4', '5', '6'] } };

const isServerCall = ([url]) => !url.startsWith('https://www.epec.com.ar/');

async function loadBackground(initialStorage) {
    const mock = createChromeMock(initialStorage);
    vi.stubGlobal('chrome', mock.chrome);
    vi.resetModules();
    await import('../src/background.js');
    return mock;
}

/** EPEC rejects the token on every call, the way it does once a session expires. */
function mockExpiredEpec(status = 401) {
    const fetchMock = vi.fn(async () => ({ ok: false, status, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('EPEC session expired state', () => {
    it.each([401, 403])('a %i from EPEC stores the expired flag and shows a badge', async (status) => {
        mockExpiredEpec(status);
        const mock = await loadBackground({ epecUser: storedUser });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response).toEqual({ success: false, emailStatus: null });
        expect(mock.storage.sessionExpired).toBe(true);
        expect(mock.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
    });

    it.each([500, 404])('a %i from EPEC does not mark the session expired', async (status) => {
        mockExpiredEpec(status);
        const mock = await loadBackground({ epecUser: storedUser });

        await mock.dispatch({ action: 'refreshData' });

        expect(mock.storage.sessionExpired).toBeUndefined();
    });

    it('sends no report request when EPEC rejects the token', async () => {
        const fetchMock = mockExpiredEpec(401);
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: reportPrefs });

        await mock.dispatch({ action: 'refreshData' });

        expect(mock.storage.sessionExpired).toBe(true);
        expect(fetchMock.mock.calls.some(isServerCall)).toBe(false);
    });

    it('a successful refresh clears a stale flag and its badge, then sends the report', async () => {
        const fetchMock = mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: reportPrefs, sessionExpired: true });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response).toMatchObject({ success: true });
        expect(mock.storage.sessionExpired).toBe(false);
        expect(mock.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
        expect(fetchMock.mock.calls.some(isServerCall)).toBe(true);
    });

    it('a new login clears the flag, refreshes data and resumes reports', async () => {
        const fetchMock = mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: reportPrefs, sessionExpired: true });

        const response = await mock.dispatch({ type: 'LOGIN_EPEC_SESSION', payload: loginPayload });

        expect(response).toMatchObject({ success: true });
        expect(mock.storage.sessionExpired).toBe(false);
        expect(mock.storage.consumptionData).toHaveLength(2);
        expect(fetchMock.mock.calls.some(isServerCall)).toBe(true);
        expect(fetchMock.mock.calls.every(([, options]) => options.headers.Authorization === 'Bearer new-tok')).toBe(true);
    });
});

describe('sessionService', () => {

    async function withStorage(initialStorage) {
        const mock = createChromeMock(initialStorage);
        vi.stubGlobal('chrome', mock.chrome);
        vi.resetModules();
        return { mock, service: await import('../src/services/sessionService.js'), errors: await import('../src/services/epecAPIservice.js') };
    }

    it('does not flag the session when a login replaced the rejected token meanwhile', async () => {
        const { mock, service, errors } = await withStorage({ epecUser: { token: 'new-tok' } });

        const marked = await service.markSessionExpiredIfRejected(
            new errors.EpecApiError('rejected', { kind: 'session-expired', status: 401, path: '/x' }), 'old-tok');

        expect(marked).toBe(false);
        expect(mock.storage.sessionExpired).toBeUndefined();
        expect(mock.chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('flags the session when the stored token is the rejected one', async () => {
        const { mock, service, errors } = await withStorage({ epecUser: { token: 'old-tok' } });

        await service.markSessionExpiredIfRejected(
            new errors.EpecApiError('rejected', { kind: 'session-expired', status: 401, path: '/x' }), 'old-tok');

        expect(mock.storage.sessionExpired).toBe(true);
    });

    it('clearSessionExpired clears the flag and the badge', async () => {
        const { mock, service } = await withStorage({ sessionExpired: true });

        await service.clearSessionExpired();

        expect(mock.storage.sessionExpired).toBe(false);
        expect(mock.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('clearSessionExpired leaves a new-readings badge alone when the session was not expired', async () => {
        const { mock, service } = await withStorage({});

        await service.clearSessionExpired();

        expect(mock.chrome.action.setBadgeText).not.toHaveBeenCalled();
    });
});
