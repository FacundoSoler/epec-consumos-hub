import { decrypt } from '../db/encryption';
import { consumptionDetails } from "../models/consumptionDetails";
import { getToDate } from "../utils/utils";
import { getContractCurrentPeriod, getEpecData } from "./epecAPIservice";
import { sendEmail } from './emailService';
import { getNotificationsPreferences } from '../db/repository'

export const processNotifications = async () => {
    try {
        const notificationsUsers = await getNotificationsPreferences();
        if (notificationsUsers.rows.length === 0) {
            console.warn('⚠️ [Worker] Ejecución terminada: No se encontraron usuarios con notificaciones activas.');
            return;
        }

        const contractsSet = new Set(notificationsUsers.rows.map(row => row.contract_id));
        for (const contractId of contractsSet) {
            // process each contract by querying EPEC's API once per contract (we'll query EPEC data once) then send respective 
            // notifications to each user sharing the contract. This way we efficientizise the processing from the DB / APIs.

            const usersSharingContract = notificationsUsers.rows.filter(x => x.contract_id === contractId);
            const firstUser = usersSharingContract.slice(0, 1)[0];
            const decryptedToken = decrypt(firstUser.token);
            const response = await getContractCurrentPeriod(decryptedToken, contractId);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

            const dataContractCurrentPeriod = await response.json();
            if (!dataContractCurrentPeriod || dataContractCurrentPeriod.length <= 0) throw new Error('No data found for Contracts');

            const desde = dataContractCurrentPeriod.desde;
            const hasta = getToDate();
            const data = await getEpecData(contractId, decryptedToken, desde, hasta);

            if (!data || data.length === 0) {
                console.warn("⚠️ EPEC returned an empty dataset for this timeframe.");
                throw new Error('No EPEC data available for the requested date range.');
            }

            const { detalleConsumo, finalTotal, finalAvg, finalProjected } = getConsumptionMetrics(data);
            const lastConsumption = data.at(-1);

            const fechaActual = new Date();
            const diaDeLaSemana = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(fechaActual);
            const diaDeLaSemanaCapitalizado = diaDeLaSemana.toUpperCase();
            console.log(diaDeLaSemanaCapitalizado);

            for (const user of usersSharingContract) {
                if (user.preferences.email_reports.enabled) {

                    const daysSelected = user.preferences.email_reports.days.map((x: string) => x.toUpperCase());
                    const isDaySelectedToday = daysSelected.includes(diaDeLaSemanaCapitalizado);

                    if (isDaySelectedToday) {
                        const detailsList = data.map((item: consumptionDetails) => {
                            return `${item.fechaHora}: <b>${Math.round(item.consumo)} kWh</b>`;
                        });

                        const jointDetailsList = detailsList.join('<br>');
                        const nombreUsuario = user.app_user_name;
                        const emailBody = `<p>Hola, ${nombreUsuario}.</p><p>A continuación, 
                            el detalle de consumos diario:</p><p>${jointDetailsList}</p>`;

                        await sendEmail(`Consumo electrico reporte diario - ${nombreUsuario}`, emailBody, user.email_address);
                    }
                }

                if (user.preferences.email_alerts.enable) {
                    const CONSUMPTION_THRESHOLD_METRIC = user.preferences.threshold.kwh_limit_per_day;
                    const CONSUMPTION_DAYS_METRIC = user.preferences.threshold.rolling_days_window;

                    if (!CONSUMPTION_DAYS_METRIC || !CONSUMPTION_DAYS_METRIC) 
                        console.warn('threshold and days metric values not found.');

                    if (isNaN(CONSUMPTION_THRESHOLD_METRIC) || isNaN(CONSUMPTION_DAYS_METRIC)) 
                        console.warn('threshold and days metric values NaN');

                    const numberofDaysToMeasure = data.length - CONSUMPTION_DAYS_METRIC;
                    const lastConsumptionMetrics = data.slice(numberofDaysToMeasure);

                    const lastDaysAccumulatedConsumption = lastConsumptionMetrics.reduce((total: number, x: any) => {
                        const consumo = Number.parseFloat(String(x.consumo ?? 0));
                        return total + (Number.isFinite(consumo) ? consumo : 0);
                    }, 0);
                    
                    const averageConsumption = Math.round(lastDaysAccumulatedConsumption / CONSUMPTION_DAYS_METRIC);

                    if (averageConsumption > CONSUMPTION_THRESHOLD_METRIC) {
                        console.log('THRESHOLD exceeded:', averageConsumption);
                        //await sendWhatsAppAlert(user.phone_Number, desde, hasta, detalleConsumo);
                    }
                }
            }
        };

    } catch (error) {
        console.error('Failed to send notifications.', error);
        throw error;
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