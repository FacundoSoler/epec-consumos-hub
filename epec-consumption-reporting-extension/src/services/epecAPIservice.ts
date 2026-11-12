import { consumptionDetails } from "../models/consumptionDetails.js";
import { RawEpecConsumptionItem } from "../models/rawEpecConsumptionItem.js";
import { EPEC_API_BASE_URL, EPEC_API_KEY } from "../constants.js";

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

function getConsumptionMetrics(data: any) {
    let finalTotal = 0;
    data.forEach((element: any) => {
        finalTotal += parseFloat(element.consumo) || 0;
    });

    let finalAvg = finalTotal / data.length;
    let finalProjected = Math.round(finalAvg * 28);
    finalTotal = Math.round(finalTotal);
    finalAvg = Math.round(finalAvg);

    let detalleConsumo = '';
    for (let i = 0; i < data.length; i++) {
        detalleConsumo = detalleConsumo + `${data[i].fechaHora}: ${Math.round(data[i].consumo)} kWh \n`;
    }

    return { detalleConsumo, finalTotal, finalAvg, finalProjected };
}

function getFullEPECReport(detalleConsumo: string, finalTotal: number, finalAvg: number, finalProjected: number) {
    const globalEpecReport = `📊 *Reporte EPEC Consumo Completo*\n\n` +
        `${detalleConsumo} \n` +
        `• Total consumo acumulado: ${finalTotal} kWh\n` +
        `• Promedio consumo diario: ${finalAvg} kWh\n` +
        `• Consumo mensual proyectado (28 días): ${finalProjected} kWh`;
    return globalEpecReport;
}