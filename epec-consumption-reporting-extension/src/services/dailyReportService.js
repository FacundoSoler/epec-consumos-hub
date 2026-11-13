import { localStorageKeys } from '../storage/localStorageKeys.js';
import { store } from '../storage/store.js';
import { getCordobaDateKey, getCordobaWeekday } from '../utils/utils.js';
import { summarizeConsumption, toKwh } from '../utils/consumptionMetrics.js';
import { escapeHtml } from '../utils/html.js';
import { maskEmail } from '../utils/maskEmail.js';
import { createEmailOutcome, postEmailRequest } from './emailApi.js';

const KIND = 'report';

/**
 * Sends today's consumption report through the server if the user enabled it for
 * this weekday and it has not gone out yet. Runs whenever Chrome starts or data
 * refreshes, which is what makes the design on-demand: no server-side schedule
 * and no stored user data.
 * @param {string} apiBaseUrl
 * @returns {Promise<import('./emailApi.js').EmailOutcome>}
 */
export async function sendDailyReportIfDue(apiBaseUrl) {
    const stored = await chrome.storage.local.get([
        localStorageKeys.EPEC_USER,
        localStorageKeys.NOTIFICATION_PREFERENCES,
        localStorageKeys.CONSUMPTION_DATA,
        localStorageKeys.LAST_REPORT_SENT_ON,
        localStorageKeys.SESSION_EXPIRED
    ]);

    const today = getCordobaDateKey();
    const reportPrefs = stored[localStorageKeys.NOTIFICATION_PREFERENCES]?.email_reports;
    const consumptionData = stored[localStorageKeys.CONSUMPTION_DATA];
    const recipient = maskEmail(stored[localStorageKeys.EPEC_USER]?.email);
    const skip = (reason) => createEmailOutcome(KIND, 'skipped', reason);

    // The server would reject the expired token anyway; skipping avoids a pointless failing call.
    if (stored[localStorageKeys.SESSION_EXPIRED] === true) return skip('session-expired');
    if (!reportPrefs?.enabled) return skip('disabled');
    if (!reportPrefs.days?.includes(getCordobaWeekday())) return skip('not-today');
    if (stored[localStorageKeys.LAST_REPORT_SENT_ON] === today) {
        return createEmailOutcome(KIND, 'already-sent', 'already-sent-locally', { recipient });
    }
    if (!Array.isArray(consumptionData) || consumptionData.length === 0) return skip('no-data');

    const epecUser = await store.getEpecUser();
    const { result, reason, ...fields } = await postEmailRequest({
        apiBaseUrl,
        path: '/email/sendEmailNotification',
        token: epecUser.token,
        subject: `Consumo eléctrico - reporte diario - ${epecUser.nombre}`,
        htmlContent: buildDailyReportHtml(epecUser.nombre, consumptionData)
    });

    if (result === 'sent' || result === 'already-sent') {
        await chrome.storage.local.set({ [localStorageKeys.LAST_REPORT_SENT_ON]: today });
    }
    return createEmailOutcome(KIND, result, reason, { ...fields, recipient });
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
