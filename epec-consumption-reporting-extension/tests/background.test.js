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

        expect(response).toMatchObject({ success: true });
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

        expect(response).toEqual({ success: false, emailStatus: null });
    });
});

describe('background message router', () => {
    it('registers exactly one onMessage listener', async () => {
        mockEpecApi();
        const mock = await loadBackground();

        expect(mock.messageListeners).toHaveLength(1);
    });

    it('ignores unknown messages and does not keep the channel open', async () => {
        mockEpecApi();
        const mock = await loadBackground();
        const sendResponse = vi.fn();

        const keepOpen = mock.messageListeners[0]({ action: 'nope' }, {}, sendResponse);

        expect(keepOpen).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });

    it('save_notifications stores preferences and answers exactly once', async () => {
        mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser });
        const sendResponse = vi.fn();
        const preferences = { email_reports: { enabled: true, days: ['1'] } };

        mock.messageListeners[0]({ action: 'save_notifications', payload: preferences }, {}, sendResponse);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
        expect(mock.storage.notificationPrefs).toEqual(preferences);
    });

    it('save_notifications without a stored user answers with an error', async () => {
        mockEpecApi();
        const mock = await loadBackground();

        const response = await mock.dispatch({ action: 'save_notifications', payload: {} });

        expect(response.success).toBe(false);
        expect(response.error).toMatch(/No User data found/);
    });

    it('logOff clears local storage', async () => {
        mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser, consumptionData: [] });

        const response = await mock.dispatch({ action: 'logOff' });

        expect(response).toEqual({ success: true });
        expect(mock.storage).toEqual({});
    });

    it('logOff without a session fails and keeps storage untouched', async () => {
        mockEpecApi();
        const mock = await loadBackground({ lastUpdated: 'x' });

        const response = await mock.dispatch({ action: 'logOff' });

        expect(response.success).toBe(false);
        expect(mock.storage).toEqual({ lastUpdated: 'x' });
    });

    it('LOGIN_EPEC_SESSION now answers through sendResponse', async () => {
        mockEpecApi();
        const mock = await loadBackground();

        const response = await mock.dispatch({ type: 'LOGIN_EPEC_SESSION', payload: loginPayload });

        expect(response).toMatchObject({ success: true });
    });
});

describe('on-demand trigger', () => {
    it('refreshes data when Chrome starts', async () => {
        const fetchMock = mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser });

        expect(mock.startupListeners).toHaveLength(1);
        mock.startupListeners[0]();

        await vi.waitFor(() => expect(mock.storage.consumptionData).toBeDefined());
        expect(fetchMock.mock.calls.some(([url]) => url.includes('CONSUMO_DIARIO'))).toBe(true);
    });
});

describe('refresh edge cases', () => {
    it('refreshData reports failure when EPEC returns no readings', async () => {
        mockEpecApi({ readings: [] });
        const mock = await loadBackground({ epecUser: storedUser });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response).toEqual({ success: false, emailStatus: null });
        expect(mock.storage.consumptionData).toBeUndefined();
    });

    it('refreshData reports failure instead of throwing when no user is stored (router)', async () => {
        mockEpecApi();
        const mock = await loadBackground();

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response).toEqual({ success: false, emailStatus: null });
    });
});

describe('threshold alert trigger', () => {
    it('asks the server for an alert after a refresh that exceeds the limit', async () => {
        const fetchMock = mockEpecApi();
        const prefs = { email_alerts: { enabled: true, threshold: { kwh_limit_per_day: 5, rolling_days_window: 2 } } };
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: prefs });

        await mock.dispatch({ action: 'refreshData' });

        expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/email/sendEmailAlert'))).toBe(true);
        expect(mock.storage.lastAlertSentOn).toBeDefined();
    });
});

describe('email status', () => {
    const reportPrefs = { email_reports: { enabled: true, days: ['0', '1', '2', '3', '4', '5', '6'] } };
    const bothPrefs = {
        ...reportPrefs,
        email_alerts: { enabled: true, threshold: { kwh_limit_per_day: 5, rolling_days_window: 2 } }
    };

    function failEmailRoute(fetchMock, path, failure) {
        const route = fetchMock.getMockImplementation();
        fetchMock.mockImplementation(async (url, options) => (url.endsWith(path) ? failure() : route(url, options)));
    }

    it('refreshData answers with both outcomes and saves them as lastEmailStatus', async () => {
        mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: bothPrefs });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response.success).toBe(true);
        expect(response.emailStatus.report).toMatchObject({ kind: 'report', result: 'sent', recipient: 'an*@example.com' });
        expect(response.emailStatus.alert).toMatchObject({ kind: 'alert', result: 'sent' });
        expect(mock.storage.lastEmailStatus).toEqual(response.emailStatus);
    });

    it('records skipped outcomes when no email is due', async () => {
        mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response.emailStatus.report).toMatchObject({ result: 'skipped', reason: 'disabled' });
        expect(response.emailStatus.alert).toMatchObject({ result: 'skipped', reason: 'disabled' });
    });

    it('a failing report does not stop the alert or the data refresh', async () => {
        const fetchMock = mockEpecApi();
        failEmailRoute(fetchMock, '/email/sendEmailNotification', () => { throw new TypeError('Failed to fetch'); });
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: bothPrefs });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response.success).toBe(true);
        expect(mock.storage.consumptionData).toBeDefined();
        expect(response.emailStatus.report).toMatchObject({ result: 'failed', reason: 'server-unreachable', server: 'http://localhost:3000' });
        expect(response.emailStatus.alert).toMatchObject({ result: 'sent' });
        expect(mock.storage.lastReportSentOn).toBeUndefined();
        expect(mock.storage.lastAlertSentOn).toBeDefined();
    });

    it('turns an unexpected sender error into a failed outcome instead of failing the refresh', async () => {
        mockEpecApi();
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: reportPrefs });
        const originalGet = mock.chrome.storage.local.get.getMockImplementation();
        mock.chrome.storage.local.get.mockImplementation((keys, callback) => {
            if ([].concat(keys).includes('lastReportSentOn')) return Promise.reject(new Error('storage broke'));
            return originalGet(keys, callback);
        });

        const response = await mock.dispatch({ action: 'refreshData' });

        expect(response.success).toBe(true);
        expect(response.emailStatus.report).toMatchObject({ result: 'failed', reason: 'unexpected-error' });
        expect(response.emailStatus.alert).toMatchObject({ result: 'skipped' });
    });

    it('logs a failure with kind, reason and status but never the token or email', async () => {
        const fetchMock = mockEpecApi();
        failEmailRoute(fetchMock, '/email/sendEmailNotification', () => ({ ok: false, status: 503, json: async () => ({}) }));
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: reportPrefs });

        await mock.dispatch({ action: 'refreshData' });

        const lines = console.error.mock.calls.map(([line]) => String(line));
        const failure = lines.map((line) => JSON.parse(line)).find((entry) => entry.message === 'Email not sent');
        expect(failure).toMatchObject({ level: 'error', area: 'email', kind: 'report', result: 'failed', reason: 'server-error', status: 503 });
        expect(lines.join('\n')).not.toContain('ana@example.com');
        expect(lines.join('\n')).not.toContain('an*@');
        expect(lines.join('\n')).not.toContain('tok"');
    });

    it('selectContract and login answers include the email status', async () => {
        mockEpecApi({ contracts: [{ id: 'C1' }] });
        const mock = await loadBackground();

        const loginResponse = await mock.dispatch({ type: 'LOGIN_EPEC_SESSION', payload: loginPayload });
        const selectResponse = await mock.dispatch({ action: 'selectContract', payload: 'C1' });

        expect(loginResponse.emailStatus).toMatchObject({ report: { kind: 'report' }, alert: { kind: 'alert' } });
        expect(selectResponse.emailStatus).toMatchObject({ report: { kind: 'report' }, alert: { kind: 'alert' } });
    });
});
