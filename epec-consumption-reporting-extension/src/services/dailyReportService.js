import { localStorageKeys } from '../storage/localStorageKeys.js';
import { store } from '../storage/store.js';
import { getCordobaDateKey, getCordobaWeekday } from '../utils/utils.js';
import { summarizeConsumption, toKwh } from '../utils/consumptionMetrics.js';

/**
 * Sends today's consumption report through the server if the user enabled it for
 * this weekday and it has not gone out yet. Runs whenever Chrome starts or data
 * refreshes, which is what makes the design on-demand: no server-side schedule
 * and no stored user data.
 */
export async function sendDailyReportIfDue(apiBaseUrl) {
    const stored = await chrome.storage.local.get([
        localStorageKeys.NOTIFICATION_PREFERENCES,
        localStorageKeys.CONSUMPTION_DATA,
        localStorageKeys.LAST_REPORT_SENT_ON,
        localStorageKeys.SESSION_EXPIRED
    ]);

    const today = getCordobaDateKey();
    const reportPrefs = stored[localStorageKeys.NOTIFICATION_PREFERENCES]?.email_reports;
    const consumptionData = stored[localStorageKeys.CONSUMPTION_DATA];

    // The server would reject the expired token anyway; skipping avoids a pointless failing call.
    if (stored[localStorageKeys.SESSION_EXPIRED] === true) return;
    if (!reportPrefs?.enabled) return;
    if (!reportPrefs.days?.includes(getCordobaWeekday())) return;
    if (stored[localStorageKeys.LAST_REPORT_SENT_ON] === today) return;
    if (!Array.isArray(consumptionData) || consumptionData.length === 0) return;

    const epecUser = await store.getEpecUser();
    const response = await fetch(`${apiBaseUrl}/email/sendEmailNotification`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${epecUser.token}`
        },
        body: JSON.stringify({
            subject: `Consumo eléctrico - reporte diario - ${epecUser.nombre}`,
            htmlContent: buildDailyReportHtml(epecUser.nombre, consumptionData)
        })
    });

    // 429 means the server already sent today's report (e.g. from another device).
    if (response.ok || response.status === 429) {
        await chrome.storage.local.set({ [localStorageKeys.LAST_REPORT_SENT_ON]: today });
        return;
    }

    throw new Error(`Daily report request failed with status ${response.status}`);
}

export function buildDailyReportHtml(userName, consumptionData) {
    const { total, average, projected } = summarizeConsumption(consumptionData);
    const rows = consumptionData
        .map((item) => `${escapeHtml(item.fechaHora)}: <b>${Math.round(toKwh(item.consumo))} kWh</b>`)
        .join('<br>');

    return `<p>Hola, ${escapeHtml(userName)}.</p>`
        + `<p>A continuación, el detalle de consumos diario:</p><p>${rows}</p>`
        + `<p>Total acumulado: <b>${Math.round(total)} kWh</b><br>`
        + `Promedio diario: <b>${Math.round(average)} kWh</b><br>`
        + `Consumo mensual proyectado (28 días): <b>${Math.round(projected)} kWh</b></p>`;
}

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
