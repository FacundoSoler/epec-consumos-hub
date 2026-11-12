import { EPEC_API_BASE_URL, EPEC_API_KEY } from '../constants.js';
import { createLogger, documentoFromToken, hashUser } from '../utils/logger.js';

const log = createLogger('epec');

/** @typedef {'session-expired' | 'epec-unavailable' | 'request-error'} EpecErrorKind */

/** Carries its classification so callers (e.g. a "session expired" UI) can branch on `kind`. */
export class EpecApiError extends Error {
    /**
     * @param {string} message
     * @param {{ kind: EpecErrorKind, status?: number, path: string, cause?: unknown }} details
     */
    constructor(message, { kind, status, path, cause }) {
        super(message, { cause });
        this.name = 'EpecApiError';
        this.kind = kind;
        this.status = status;
        this.path = path;
    }
}

/**
 * Single source of truth for how an EPEC failure is interpreted; a missing status means the network call failed.
 * @param {number} [status]
 * @returns {EpecErrorKind}
 */
export function classifyEpecFailure(status) {
    if (status === 401 || status === 403) return 'session-expired';
    if (status === undefined || status >= 500) return 'epec-unavailable';
    return 'request-error';
}

/**
 * @typedef {Object} ConsumptionDetails
 * @property {number} consumo      kWh for the day
 * @property {string} fechaHora    "dd/mm/yyyy" as returned by EPEC
 * @property {number} dateSorting  epoch ms, used to sort newest first
 */

async function epecFetch(path, bearerToken) {
    let response;
    try {
        response = await fetch(`${EPEC_API_BASE_URL}${path}`, {
            headers: {
                apikey: EPEC_API_KEY,
                Authorization: `Bearer ${bearerToken}`
            }
        });
    } catch (cause) {
        throw await logAndBuildEpecError(`EPEC API ${path} could not be reached`, { path, bearerToken, cause });
    }

    if (!response.ok) {
        throw await logAndBuildEpecError(`EPEC API ${path} responded with status ${response.status}`, { path, bearerToken, status: response.status });
    }

    return response.json();
}

async function logAndBuildEpecError(message, { path, bearerToken, status, cause }) {
    const error = new EpecApiError(message, { kind: classifyEpecFailure(status), status, path: stripQuery(path), cause });
    log.error('EPEC request failed', {
        kind: error.kind,
        status,
        path: error.path,
        cause: cause instanceof Error ? cause.message : undefined,
        user: await hashUser(documentoFromToken(bearerToken))
    });
    return error;
}

// Query strings only hold dates today, but logging the bare path keeps that guarantee if they change.
function stripQuery(path) {
    return path.split('?')[0];
}

export function getContratos(bearerToken) {
    return epecFetch('/usuarios/contratos', bearerToken);
}

export function getContractCurrentPeriod(bearerToken, contractId) {
    return epecFetch(`/usuarios/contratos/${contractId}/consumos/tipo-medicion`, bearerToken);
}

/** @returns {Promise<ConsumptionDetails[]>} sorted newest first */
export async function getEpecData(contractId, bearerToken, desde, hasta) {
    const path = `/usuarios/contratos/${contractId}/consumos/con-telemedicion/MED_INTELIGENTE/CONSUMO_DIARIO?desde=${desde}&hasta=${hasta}`;
    const rawItems = await epecFetch(path, bearerToken);

    return rawItems
        .filter((item) => item.consumo !== null && item.consumo !== undefined && String(item.consumo).trim() !== '')
        .map(toConsumptionDetails)
        .sort((a, b) => b.dateSorting - a.dateSorting);
}

function toConsumptionDetails(item) {
    const [day, month, year] = item.fechaHora.split('/');

    return {
        // EPEC returns decimals with a comma ("12,4")
        consumo: Number(String(item.consumo).replace(/,/g, '.')),
        fechaHora: item.fechaHora,
        dateSorting: new Date(Number(year), Number(month) - 1, Number(day)).getTime()
    };
}
