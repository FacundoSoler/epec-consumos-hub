import { consumptionDetails } from "../models/consumptionDetails.js";
import { RawEpecConsumptionItem } from "../models/rawEpecConsumptionItem.js";

const EPEC_API_KEY = process.env.EPEC_API_KEY;
const EPEC_API_BASE_URL = process.env.EPEC_API_BASE_URL;

if (!EPEC_API_BASE_URL || !EPEC_API_KEY) throw new Error('No API BASE Url or API Key defined');

export const getContratos = async (bearerToken: string) => {
    const url = `${EPEC_API_BASE_URL}/usuarios/contratos`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            apikey: EPEC_API_KEY
        }
    });

    return response;
}

export const contratos = async (bearerToken: string) => {
    const url = `${EPEC_API_BASE_URL}/usuarios/contratos`;
    const response = await fetch(url, {
        headers: {
            apikey: EPEC_API_KEY,
            Authorization: `Bearer ${bearerToken}`
        }
    });

    return response;
}

export const getContractCurrentPeriod = async (bearerToken: string, contractId: string) => {
    const url = `${EPEC_API_BASE_URL}/usuarios/contratos/${contractId}/consumos/tipo-medicion`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            apikey: EPEC_API_KEY
        }
    });

    return response;
}

export const getEpecData = async (contractId: string, bearerToken: string, desde: string, hasta: string) => {
    const url = `${EPEC_API_BASE_URL}/usuarios/contratos/${contractId}/consumos/con-telemedicion/MED_INTELIGENTE/CONSUMO_DIARIO?desde=${desde}&hasta=${hasta}`;

    try {
        const response = await fetch(url, {
            headers: {
                "apiKey": EPEC_API_KEY,
                "Authorization": `Bearer ${bearerToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`EPEC API responded with status ${response.status}`);
        }

        const data = await response.json();

        const sanitizedData: consumptionDetails[] = data
            .filter((item: RawEpecConsumptionItem) => Boolean(item.consumo && item.consumo.toString().trim() !== ''))
            .map((item: RawEpecConsumptionItem): consumptionDetails => {
                const [day, month, year] = item.fechaHora.split('/');
                const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));

                return {
                    consumo: Number(String(item.consumo).replace(/,/g, '.')),
                    fechaHora: item.fechaHora,
                    dateSorting: parsedDate.getTime()
                };
            });

        sanitizedData.sort((a, b) => b.dateSorting - a.dateSorting);
        return sanitizedData;
    } catch (error: any) {

    }
}