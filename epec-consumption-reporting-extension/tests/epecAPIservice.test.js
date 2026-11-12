import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpecApiError, classifyEpecFailure, getContratos, getContractCurrentPeriod, getEpecData } from '../src/services/epecAPIservice.js';
import { hashUser } from '../src/utils/logger.js';

function mockFetchJson(body, { ok = true, status = 200 } = {}) {
    const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const base64Url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const userToken = `${base64Url({ alg: 'HS256' })}.${base64Url({ documento: 30111222, email: 'ana@example.com' })}.sig`;

function captureErrorLogs() {
    return vi.spyOn(console, 'error').mockImplementation(() => {});
}

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
        captureErrorLogs();
        mockFetchJson({}, { ok: false, status: 401 });

        await expect(getContratos('expired')).rejects.toThrow('status 401');
    });
});

describe('classifyEpecFailure', () => {
    it.each([
        [401, 'session-expired'],
        [403, 'session-expired'],
        [500, 'epec-unavailable'],
        [503, 'epec-unavailable'],
        [undefined, 'epec-unavailable'],
        [400, 'request-error'],
        [404, 'request-error']
    ])('classifies status %s as %s', (status, kind) => {
        expect(classifyEpecFailure(status)).toBe(kind);
    });
});

describe('epecFetch classified errors', () => {
    it.each([
        [401, 'session-expired'],
        [403, 'session-expired'],
        [502, 'epec-unavailable'],
        [404, 'request-error']
    ])('throws an EpecApiError for status %s with kind %s and logs it with the hashed user', async (status, kind) => {
        const errorLog = captureErrorLogs();
        mockFetchJson({}, { ok: false, status });

        const error = await getContratos(userToken).catch((e) => e);

        expect(error).toBeInstanceOf(EpecApiError);
        expect(error).toMatchObject({ kind, status, path: '/usuarios/contratos' });
        const raw = errorLog.mock.calls[0][0];
        expect(JSON.parse(raw)).toMatchObject({ level: 'error', area: 'epec', kind, status, path: '/usuarios/contratos', user: await hashUser(30111222) });
        expect(raw).not.toContain('30111222');
        expect(raw).not.toContain('ana@example.com');
        expect(raw).not.toContain(userToken);
    });

    it('classifies a network failure as epec-unavailable and keeps the cause', async () => {
        const errorLog = captureErrorLogs();
        const networkError = new TypeError('Failed to fetch');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

        const error = await getContratos(userToken).catch((e) => e);

        expect(error).toMatchObject({ name: 'EpecApiError', kind: 'epec-unavailable', status: undefined, cause: networkError });
        expect(JSON.parse(errorLog.mock.calls[0][0])).toMatchObject({ kind: 'epec-unavailable', cause: 'Failed to fetch', user: await hashUser(30111222) });
    });

    it('logs the path without its query string and omits the user for an unreadable token', async () => {
        const errorLog = captureErrorLogs();
        mockFetchJson({}, { ok: false, status: 500 });

        await getEpecData('C-1', 'opaque-token', '01112026', '121120262359').catch(() => {});

        const entry = JSON.parse(errorLog.mock.calls[0][0]);
        expect(entry.path).toBe('/usuarios/contratos/C-1/consumos/con-telemedicion/MED_INTELIGENTE/CONSUMO_DIARIO');
        expect(entry.user).toBeUndefined();
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
