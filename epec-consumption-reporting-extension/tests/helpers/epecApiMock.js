import { vi } from 'vitest';

export const sampleReadings = [
    { fechaHora: '10/11/2026', consumo: '10,5' },
    { fechaHora: '11/11/2026', consumo: '12' }
];

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const readingsFor = (url, readingsByContract) => {
    const contractId = url.match(/\/contratos\/([^/]+)\//)?.[1];
    return readingsByContract[contractId];
};

/**
 * Routes fetch calls by URL to canned EPEC (and optional server) responses.
 * `readingsByContract` overrides `readings` for the contract ids it lists.
 */
export function mockEpecApi({
    contracts = [{ id: 'C1' }],
    period = { desde: '01112026' },
    readings = sampleReadings,
    readingsByContract = {},
    serverStatus = 200
} = {}) {
    const fetchMock = vi.fn(async (url) => {
        if (url.includes('CONSUMO_DIARIO')) return jsonResponse(readingsFor(url, readingsByContract) ?? readings);
        if (url.includes('/consumos/tipo-medicion')) return jsonResponse(period);
        if (url.includes('/usuarios/contratos')) return jsonResponse(contracts);
        // The real server answers {status:'sent'} on success, which the extension requires before recording the day.
        return jsonResponse(serverStatus === 200 ? { status: 'sent' } : {}, serverStatus);
    });

    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}
