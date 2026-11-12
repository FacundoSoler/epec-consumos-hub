import { localStorageKeys } from '../storage/localStorageKeys.js';
import { store } from '../storage/store.js';
import { getCordobaDateKey } from '../utils/utils.js';
import { toKwh } from '../utils/consumptionMetrics.js';
import { escapeHtml } from '../utils/html.js';

/**
 * @typedef {Object} AlertThreshold
 * @property {number} kwh_limit_per_day
 * @property {number} rolling_days_window
 */

/**
 * @typedef {Object} AlertEvaluation
 * @property {boolean} exceeded
 * @property {number} average      kWh per day over the evaluated window
 * @property {number} limit
 * @property {number} windowDays
 */

/**
 * Compares the average of the newest `rolling_days_window` readings with the daily limit.
 * With fewer readings than the window it never alerts: readings only cover the current billing
 * period, so early in a period one heavy day would otherwise trigger an alert meant to describe
 * a sustained N-day trend. Being exactly at the limit is not exceeding it.
 * @param {{ consumo: number | string }[]} readings sorted newest first
 * @param {AlertThreshold} threshold
 * @returns {AlertEvaluation}
 */
export function evaluateThresholdAlert(readings, threshold) {
    const limit = threshold.kwh_limit_per_day;
    const windowDays = threshold.rolling_days_window;

    if (readings.length === 0 || readings.length < windowDays) {
        return { exceeded: false, average: 0, limit, windowDays };
    }

    const windowReadings = readings.slice(0, windowDays);
    const average = windowReadings.reduce((sum, reading) => sum + toKwh(reading.consumo), 0) / windowDays;
    return { exceeded: average > limit, average, limit, windowDays };
}

/**
 * Asks the server to email a threshold alert when the rolling average exceeds the user's limit,
 * at most once per Córdoba day. Runs after each data refresh, like the daily report.
 */
export async function sendThresholdAlertIfDue(apiBaseUrl) {
    const stored = await chrome.storage.local.get([
        localStorageKeys.NOTIFICATION_PREFERENCES,
        localStorageKeys.CONSUMPTION_DATA,
        localStorageKeys.LAST_ALERT_SENT_ON,
        localStorageKeys.SESSION_EXPIRED
    ]);

    const today = getCordobaDateKey();
    const alertPrefs = stored[localStorageKeys.NOTIFICATION_PREFERENCES]?.email_alerts;
    const consumptionData = stored[localStorageKeys.CONSUMPTION_DATA];

    // The server would reject the expired token anyway; skipping avoids a pointless failing call.
    if (stored[localStorageKeys.SESSION_EXPIRED] === true) return;
    if (!alertPrefs?.enabled || !isValidThreshold(alertPrefs.threshold)) return;
    if (stored[localStorageKeys.LAST_ALERT_SENT_ON] === today) return;
    if (!Array.isArray(consumptionData)) return;

    const evaluation = evaluateThresholdAlert(consumptionData, alertPrefs.threshold);
    if (!evaluation.exceeded) return;

    const epecUser = await store.getEpecUser();
    const response = await fetch(`${apiBaseUrl}/email/sendEmailAlert`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${epecUser.token}`
        },
        body: JSON.stringify({
            subject: `Alerta de consumo eléctrico - ${epecUser.nombre}`,
            htmlContent: buildThresholdAlertHtml(epecUser.nombre, evaluation)
        })
    });

    // 429 means the server already sent today's alert (e.g. from another device).
    if (response.ok || response.status === 429) {
        await chrome.storage.local.set({ [localStorageKeys.LAST_ALERT_SENT_ON]: today });
        return;
    }

    throw new Error(`Threshold alert request failed with status ${response.status}`);
}

/**
 * @param {string} userName
 * @param {AlertEvaluation} evaluation
 */
export function buildThresholdAlertHtml(userName, { average, limit, windowDays }) {
    const days = windowDays === 1 ? 'el último día' : `los últimos ${windowDays} días`;

    return `<p>Hola, ${escapeHtml(userName)}.</p>`
        + `<p>Tu consumo promedio de ${days} fue de <b>${formatKwh(average)} kWh por día</b>, `
        + `por encima del límite que configuraste de <b>${formatKwh(limit)} kWh por día</b>.</p>`
        + '<p>Podés revisar el detalle en la extensión EPEC Consumos.</p>';
}

/**
 * The popup's rules for a usable threshold; returns a Spanish message for the user, or null when valid.
 * @param {AlertThreshold} threshold
 */
export function validateAlertThreshold(threshold) {
    const limit = threshold?.kwh_limit_per_day;
    const windowDays = threshold?.rolling_days_window;

    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
        return 'El consumo promedio por día debe ser mayor a 0.';
    }
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 31) {
        return 'La cantidad de días a evaluar debe ser un número entero entre 1 y 31.';
    }
    return null;
}

function isValidThreshold(threshold) {
    return validateAlertThreshold(threshold) === null;
}

function formatKwh(value) {
    return escapeHtml(Number(value.toFixed(1)).toLocaleString('es-AR'));
}
