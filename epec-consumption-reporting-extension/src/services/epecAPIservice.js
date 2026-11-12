import { EPEC_API_BASE_URL, EPEC_API_KEY } from '../constants.js';

/**
 * @typedef {Object} ConsumptionDetails
 * @property {number} consumo      kWh for the day
 * @property {string} fechaHora    "dd/mm/yyyy" as returned by EPEC
 * @property {number} dateSorting  epoch ms, used to sort newest first
 */

async function epecFetch(path, bearerToken) {
    const response = await fetch(`${EPEC_API_BASE_URL}${path}`, {
        headers: {
            apikey: EPEC_API_KEY,
            Authorization: `Bearer ${bearerToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`EPEC API ${path} responded with status ${response.status}`);
    }

    return response.json();
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
