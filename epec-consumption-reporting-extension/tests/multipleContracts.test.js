import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import { mockEpecApi } from './helpers/epecApiMock.js';

const storedUser = { documento: 1, nombre: 'Ana', email: 'ana@example.com', token: 'tok', contratos: [{ id: 'C1' }, { id: 'C2' }] };
const everyDayReports = { email_reports: { enabled: true, days: ['0', '1', '2', '3', '4', '5', '6'] } };
const readingsByContract = {
    C1: [{ fechaHora: '11/11/2026', consumo: '5' }],
    C2: [{ fechaHora: '11/11/2026', consumo: '40' }]
};

const consumptionUrls = (fetchMock) => fetchMock.mock.calls.map(([url]) => url).filter((url) => url.includes('CONSUMO_DIARIO'));

async function loadBackground(initialStorage) {
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

describe('contract selection', () => {
    it('refreshes the stored selected contract instead of the first one', async () => {
        const fetchMock = mockEpecApi({ readingsByContract });
        const mock = await loadBackground({ epecUser: storedUser, selectedContractId: 'C2' });

        await mock.dispatch({ action: 'refreshData' });

        expect(consumptionUrls(fetchMock).every((url) => url.includes('/contratos/C2/'))).toBe(true);
        expect(mock.storage.consumptionData.map((r) => r.consumo)).toEqual([40]);
    });

    it('falls back to the first contract when the stored selection is no longer the user’s', async () => {
        const fetchMock = mockEpecApi({ readingsByContract });
        const mock = await loadBackground({ epecUser: storedUser, selectedContractId: 'GONE' });

        await mock.dispatch({ action: 'refreshData' });

        expect(consumptionUrls(fetchMock).every((url) => url.includes('/contratos/C1/'))).toBe(true);
    });

    it('selectContract stores the choice, refreshes its data and reports on it', async () => {
        const fetchMock = mockEpecApi({ readingsByContract });
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: everyDayReports });

        const response = await mock.dispatch({ action: 'selectContract', payload: 'C2' });

        expect(response).toEqual({ success: true });
        expect(mock.storage.selectedContractId).toBe('C2');
        expect(mock.storage.consumptionData.map((r) => r.consumo)).toEqual([40]);
        const reportCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/email/sendEmailNotification'));
        expect(JSON.parse(reportCall[1].body).htmlContent).toContain('<b>40 kWh</b>');
    });

    it('a successful switch clears the update badge instead of comparing with the old contract’s readings', async () => {
        mockEpecApi({ readingsByContract });
        const storedC1Readings = [{ fechaHora: '10/11/2026', consumo: 5, dateSorting: 1 }];
        const mock = await loadBackground({ epecUser: storedUser, consumptionData: storedC1Readings });

        await mock.dispatch({ action: 'selectContract', payload: 'C2' });

        expect(mock.chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: '!' });
        expect(mock.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });

    it('the update badge follows the selected contract', async () => {
        mockEpecApi({ readingsByContract });
        const storedC2Readings = [{ fechaHora: '10/11/2026', consumo: 30, dateSorting: 1 }];
        const mock = await loadBackground({ epecUser: storedUser, selectedContractId: 'C2', consumptionData: storedC2Readings });

        await mock.dispatch({ action: 'refreshData' });

        expect(mock.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
    });

    it('selectContract rejects a contract the user does not have and keeps the selection', async () => {
        mockEpecApi({ readingsByContract });
        const mock = await loadBackground({ epecUser: storedUser, selectedContractId: 'C2' });

        const response = await mock.dispatch({ action: 'selectContract', payload: 'C9' });

        expect(response.success).toBe(false);
        expect(mock.storage.selectedContractId).toBe('C2');
    });

    it('selects a numeric EPEC contract id sent by the popup as a string', async () => {
        const fetchMock = mockEpecApi();
        const numericUser = { ...storedUser, contratos: [{ id: 1001 }, { id: 1002 }] };
        const mock = await loadBackground({ epecUser: numericUser });

        const response = await mock.dispatch({ action: 'selectContract', payload: '1002' });

        expect(response).toEqual({ success: true });
        expect(consumptionUrls(fetchMock).every((url) => url.includes('/contratos/1002/'))).toBe(true);
        expect(String(mock.storage.selectedContractId)).toBe('1002');
    });

    it('a failed switch keeps the old selection and data and answers success:false', async () => {
        const fetchMock = mockEpecApi({ readingsByContract });
        const oldData = [{ fechaHora: '10/11/2026', consumo: 5, dateSorting: 1 }];
        const mock = await loadBackground({ epecUser: storedUser, selectedContractId: 'C1', consumptionData: oldData, lastUpdated: 'ayer' });
        fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }));

        const response = await mock.dispatch({ action: 'selectContract', payload: 'C2' });

        expect(response.success).toBe(false);
        expect(response.error).toMatch(/status 500/);
        expect(mock.storage.selectedContractId).toBe('C1');
        expect(mock.storage.consumptionData).toEqual(oldData);
        expect(mock.storage.lastUpdated).toBe('ayer');
    });

    it('a switch with no readings for the new contract keeps the old selection', async () => {
        mockEpecApi({ readingsByContract: { ...readingsByContract, C2: [] } });
        const mock = await loadBackground({ epecUser: storedUser, selectedContractId: 'C1' });

        const response = await mock.dispatch({ action: 'selectContract', payload: 'C2' });

        expect(response.success).toBe(false);
        expect(mock.storage.selectedContractId).toBe('C1');
    });

    it('threshold alerts follow the selected contract', async () => {
        const fetchMock = mockEpecApi({ readingsByContract });
        const prefs = { email_alerts: { enabled: true, threshold: { kwh_limit_per_day: 10, rolling_days_window: 1 } } };
        const mock = await loadBackground({ epecUser: storedUser, notificationPrefs: prefs });

        await mock.dispatch({ action: 'selectContract', payload: 'C2' });

        const alertCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/email/sendEmailAlert'));
        expect(JSON.parse(alertCall[1].body).htmlContent).toContain('<b>40 kWh por día</b>');
    });
});
