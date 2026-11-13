export const EMAIL_REQUEST_TIMEOUT_MS = 15_000;

/**
 * @typedef {Object} EmailOutcome
 * @property {'report' | 'alert'} kind
 * @property {'sent' | 'already-sent' | 'failed' | 'skipped'} result
 * @property {string} reason
 * @property {string} at ISO timestamp of the attempt
 * @property {number} [status] HTTP status, when the server answered
 * @property {string} [server] API origin, so the popup can name the server that did not answer
 * @property {string | null} [recipient] masked EPEC email
 * @property {Record<string, unknown>} [details]
 */

/**
 * @param {'report' | 'alert'} kind
 * @param {EmailOutcome['result']} result
 * @param {string} reason
 * @param {Partial<EmailOutcome>} [fields]
 * @returns {EmailOutcome}
 */
export function createEmailOutcome(kind, result, reason, fields = {}) {
    return { kind, result, reason, at: new Date().toISOString(), ...fields };
}

/**
 * Posts one email request and classifies the answer. Expected failures become a result instead
 * of an exception so the popup can tell the user what happened. Only 'sent' and 'already-sent'
 * mean the server handled today's email; callers record the day for those alone.
 * @param {{ apiBaseUrl: string, path: string, token: string, subject: string, htmlContent: string }} request
 */
export async function postEmailRequest({ apiBaseUrl, path, token, subject, htmlContent }) {
    const server = new URL(apiBaseUrl).origin;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMAIL_REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${apiBaseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ subject, htmlContent }),
            signal: controller.signal
        });
        return { ...(await classifyEmailResponse(response)), server };
    } catch (error) {
        const reason = error?.name === 'AbortError' ? 'timeout' : 'server-unreachable';
        return { result: 'failed', reason, server };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function classifyEmailResponse(response) {
    const { status } = response;
    const body = await readJsonBody(response);

    if (status === 200 && body?.status === 'sent') return { result: 'sent', reason: 'sent', status };
    // 429 means the server already sent today's email (e.g. from another device).
    if (status === 429) return { result: 'already-sent', reason: 'already-sent', status };
    if (response.ok) return { result: 'failed', reason: 'unexpected-response', status };
    if (status === 401 || status === 403) return { result: 'failed', reason: 'session-rejected', status };
    if (status === 400) {
        const details = typeof body?.error === 'string' ? { serverMessage: body.error } : undefined;
        return { result: 'failed', reason: 'invalid-data', status, details };
    }
    return { result: 'failed', reason: 'server-error', status };
}

// A missing or non-JSON body is classified by status alone.
async function readJsonBody(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
