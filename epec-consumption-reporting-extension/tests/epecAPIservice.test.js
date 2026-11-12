import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContratos, getContractCurrentPeriod, getEpecData } from '../src/services/epecAPIservice.js';

function mockFetchJson(body, { ok = true, status = 200 } = {}) {
    const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('epecFetch headers and errors', () => {
    it('sends the EPEC apikey and the Bearer token', async () => {
        const fetchMock = mockFetchJson([]);

        await getContratos('token-123');

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://www.epec.com.ar/api/usuarios/contratos');
        expect(options.headers).toEqual({ apikey: 'web-prod', Authorization: 'Bearer token-123' });
    });

    it('builds the current-period path from the contract id', async () => {
        const fetchMock = mockFetchJson({ desde: '01112026' });

        const period = await getContractCurrentPeriod('t', 'C-42');

        expect(fetchMock.mock.calls[0][0]).toBe('https://www.epec.com.ar/api/usuarios/contratos/C-42/consumos/tipo-medicion');
        expect(period).toEqual({ desde: '01112026' });
    });

    it('throws with the status instead of resolving to undefined', async () => {
        mockFetchJson({}, { ok: false, status: 401 });

        await expect(getContratos('expired')).rejects.toThrow('status 401');
    });
});

describe('getEpecData', () => {
    it('converts comma decimals to numbers', async () => {
        mockFetchJson([{ fechaHora: '10/11/2026', consumo: '12,4' }]);

        const [reading] = await getEpecData('C1', 't', '01112026', '121120260000');

        expect(reading.consumo).toBe(12.4);
        expect(reading.fechaHora).toBe('10/11/2026');
    });

    it('drops readings with empty, blank, null or missing consumo', async () => {
        mockFetchJson([
            { fechaHora: '01/11/2026', consumo: '' },
            { fechaHora: '02/11/2026', consumo: '   ' },
            { fechaHora: '03/11/2026', consumo: null },
            { fechaHora: '04/11/2026' },
            { fechaHora: '05/11/2026', consumo: '7' }
        ]);

        const readings = await getEpecData('C1', 't', 'a', 'b');

        expect(readings.map((r) => r.fechaHora)).toEqual(['05/11/2026']);
    });

    it('keeps a zero reading (a real day with no consumption)', async () => {
        mockFetchJson([{ fechaHora: '01/11/2026', consumo: 0 }]);

        const readings = await getEpecData('C1', 't', 'a', 'b');

        expect(readings).toHaveLength(1);
        expect(readings[0].consumo).toBe(0);
    });

    it('sorts newest first across month boundaries', async () => {
        mockFetchJson([
            { fechaHora: '30/10/2026', consumo: '1' },
            { fechaHora: '02/11/2026', consumo: '3' },
            { fechaHora: '31/10/2026', consumo: '2' }
        ]);

        const readings = await getEpecData('C1', 't', 'a', 'b');

        expect(readings.map((r) => r.fechaHora)).toEqual(['02/11/2026', '31/10/2026', '30/10/2026']);
    });

    it('requests the daily smart-meter endpoint with desde and hasta', async () => {
        const fetchMock = mockFetchJson([]);

        await getEpecData('C1', 't', '01112026', '121120260930');

        expect(fetchMock.mock.calls[0][0]).toBe(
            'https://www.epec.com.ar/api/usuarios/contratos/C1/consumos/con-telemedicion/MED_INTELIGENTE/CONSUMO_DIARIO?desde=01112026&hasta=121120260930'
        );
    });

    it('propagates EPEC errors', async () => {
        mockFetchJson({}, { ok: false, status: 500 });

        await expect(getEpecData('C1', 't', 'a', 'b')).rejects.toThrow('status 500');
    });
});
