import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import { mockEpecApi } from './helpers/epecApiMock.js';

const storedUser = { documento: 1, nombre: 'Ana', email: 'ana@example.com', token: 'tok', contratos: [{ id: 'C1' }] };

// What a previous refresh stored: numbers, newest first.
const previousReadings = [
    { fechaHora: '11/11/2026', consumo: 12, dateSorting: 2 },
    { fechaHora: '10/11/2026', consumo: 10.5, dateSorting: 1 }
];

async function refreshWith(readingsFromEpec, storedReadings) {
    mockEpecApi({ readings: readingsFromEpec });
    const mock = createChromeMock({ epecUser: storedUser, ...(storedReadings && { consumptionData: storedReadings }) });
    vi.stubGlobal('chrome', mock.chrome);
    vi.resetModules();
    await import('../src/background.js');
    await mock.dispatch({ action: 'refreshData' });
    return mock.chrome.action;
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('update badge', () => {
    it('shows "!" when EPEC returns a new newest day', async () => {
        const action = await refreshWith([
            { fechaHora: '10/11/2026', consumo: '10,5' },
            { fechaHora: '11/11/2026', consumo: '12' },
            { fechaHora: '12/11/2026', consumo: '9' }
        ], previousReadings);

        expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
        expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF0000' });
    });

    it('shows "!" when the newest day was revised', async () => {
        const action = await refreshWith([
            { fechaHora: '10/11/2026', consumo: '10,5' },
            { fechaHora: '11/11/2026', consumo: '13' }
        ], previousReadings);

        expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
    });

    it('stays quiet when nothing changed', async () => {
        const action = await refreshWith([
            { fechaHora: '10/11/2026', consumo: '10,5' },
            { fechaHora: '11/11/2026', consumo: '12' }
        ], previousReadings);

        expect(action.setBadgeText).not.toHaveBeenCalled();
    });

    it('stays quiet on the first refresh, when nothing was stored yet', async () => {
        const action = await refreshWith([{ fechaHora: '11/11/2026', consumo: '12' }]);

        expect(action.setBadgeText).not.toHaveBeenCalled();
    });
});
