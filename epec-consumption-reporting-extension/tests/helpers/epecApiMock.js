import { vi } from 'vitest';

export const sampleReadings = [
    { fechaHora: '10/11/2026', consumo: '10,5' },
    { fechaHora: '11/11/2026', consumo: '12' }
];

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

/** Routes fetch calls by URL to canned EPEC (and optional server) responses. */
export function mockEpecApi({
    contracts = [{ id: 'C1' }],
    period = { desde: '01112026' },
    readings = sampleReadings,
    serverStatus = 200
} = {}) {
    const fetchMock = vi.fn(async (url) => {
        if (url.includes('CONSUMO_DIARIO')) return jsonResponse(readings);
        if (url.includes('/consumos/tipo-medicion')) return jsonResponse(period);
        if (url.includes('/usuarios/contratos')) return jsonResponse(contracts);
        return jsonResponse({}, serverStatus);
    });

    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}
