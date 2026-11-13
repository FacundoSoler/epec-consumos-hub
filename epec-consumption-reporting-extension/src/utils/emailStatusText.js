const pad = (n) => String(n).padStart(2, '0');

// Spanish wording differs by gender: "el reporte diario" / "la alerta de consumo".
const SUBJECTS = {
    report: {
        withArticle: 'el reporte diario',
        title: 'Reporte diario',
        todayAlreadySent: 'El reporte diario de hoy ya fue enviado',
        sentLabel: 'Reporte diario enviado'
    },
    alert: {
        withArticle: 'la alerta de consumo',
        title: 'Alerta de consumo',
        todayAlreadySent: 'La alerta de consumo de hoy ya fue enviada',
        sentLabel: 'Alerta de consumo enviada'
    }
};

const SKIPPED_SUFFIXES = {
    'not-today': 'no corresponde hoy.',
    disabled: 'desactivado.',
    'no-data': 'sin datos de consumo todavía.',
    'session-expired': 'sesión EPEC vencida.'
};

const RETRY_NOTE = 'Se reintentará en la próxima actualización.';

/**
 * @typedef {{ text: string, tone: 'success' | 'error' | 'neutral' }} EmailStatusLine
 */

/**
 * The popup's line for one email outcome, or null when there is nothing to show yet.
 * @param {import('../services/emailApi.js').EmailOutcome | null | undefined} outcome
 * @returns {EmailStatusLine | null}
 */
export function buildEmailStatusLine(outcome) {
    const subject = outcome ? SUBJECTS[outcome.kind] : undefined;
    if (!outcome || !subject) return null;

    switch (outcome.result) {
        case 'sent': return { tone: 'success', text: buildSentText(subject, outcome) };
        case 'already-sent': return { tone: 'success', text: buildAlreadySentText(subject, outcome) };
        case 'failed': return { tone: 'error', text: `❌ No se pudo enviar ${subject.withArticle} por email: ${describeFailure(outcome)}` };
        case 'skipped': return { tone: 'neutral', text: buildSkippedText(subject, outcome) };
        default: return null;
    }
}

const REFRESH_FAILED_LINE = { tone: 'error', text: '❌ No se pudieron actualizar los datos de EPEC. Intentá nuevamente en unos instantes.' };

/**
 * The popup's status lines under "Última actualización". A failed refresh hides the email lines,
 * since no email was attempted; an expired session shows nothing here because its own banner explains it.
 * @param {{ refreshError?: string | null, emailStatus?: { report?: object, alert?: object } | null }} state
 * @returns {EmailStatusLine[]}
 */
export function buildPopupStatusLines({ refreshError, emailStatus }) {
    if (refreshError === 'session-expired') return [];
    if (refreshError) return [REFRESH_FAILED_LINE];

    return [emailStatus?.report, emailStatus?.alert]
        .map((outcome) => buildEmailStatusLine(outcome))
        .filter((line) => line !== null);
}

/** kWh with at most one decimal and a comma separator, as Argentine users read numbers. */
export function formatKwh(value) {
    return Number(Number(value).toFixed(1)).toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function buildSentText(subject, outcome) {
    const destination = describeRecipient(outcome.recipient);
    if (outcome.kind === 'alert' && outcome.details) {
        const { average, limit, windowDays } = outcome.details;
        return `✅ ${subject.sentLabel} por email${destination}: promedio ${formatKwh(average)} kWh/día en ${describeWindow(windowDays)}, límite ${formatKwh(limit)} kWh/día.`;
    }
    return `✅ ${subject.sentLabel} por email${destination} a las ${formatLocalTime(outcome.at)}.`;
}

function buildAlreadySentText(subject, outcome) {
    const nextReport = outcome.kind === 'report' ? ' El próximo se envía el siguiente día seleccionado.' : '';
    return `✅ ${subject.todayAlreadySent} por email${describeRecipient(outcome.recipient)}.${nextReport}`;
}

function buildSkippedText(subject, outcome) {
    if (outcome.reason === 'below-threshold' && outcome.details) {
        const { average, limit } = outcome.details;
        return `ℹ️ ${subject.title}: el promedio (${formatKwh(average)} kWh/día) está por debajo del límite (${formatKwh(limit)} kWh/día). No se envió email.`;
    }
    if (outcome.reason === 'invalid-threshold') {
        return `ℹ️ ${subject.title}: configuración inválida, revisá los valores en Notificaciones.`;
    }
    return `ℹ️ ${subject.title} por email: ${SKIPPED_SUFFIXES[outcome.reason] ?? 'no se envió.'}`;
}

function describeFailure({ reason, status, server, details }) {
    if (reason === 'server-unreachable' || reason === 'timeout') {
        return `el servidor no responde${server ? ` (${server})` : ''}. ${RETRY_NOTE}`;
    }
    if (reason === 'session-rejected') return 'EPEC rechazó la sesión. Ingresá a EPEC nuevamente.';
    if (reason === 'invalid-data') {
        const serverMessage = details?.serverMessage;
        return `el servidor rechazó los datos${serverMessage ? ` (${serverMessage})` : ''}.`;
    }
    if (reason === 'server-error' || reason === 'unexpected-response') {
        return `error del servidor${status ? ` (código ${status})` : ''}. ${RETRY_NOTE}`;
    }
    return `error inesperado. ${RETRY_NOTE}`;
}

function describeRecipient(maskedEmail) {
    return maskedEmail ? ` a ${maskedEmail} (usuario EPEC)` : '';
}

function describeWindow(windowDays) {
    return windowDays === 1 ? 'el último día' : `los últimos ${windowDays} días`;
}

function formatLocalTime(isoTimestamp) {
    const date = new Date(isoTimestamp);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
