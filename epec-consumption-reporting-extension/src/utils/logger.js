/**
 * One JSON object per line so service-worker logs can be filtered by area/level.
 * Callers must never pass raw tokens, emails or DNIs; use hashUser() for identity.
 * @param {string} area e.g. 'epec', 'email', 'session'
 */
export function createLogger(area) {
    const write = (level, message, fields = {}) => {
        const line = JSON.stringify({ timestamp: new Date().toISOString(), level, area, message, ...fields });
        if (level === 'error') console.error(line);
        else if (level === 'warn') console.warn(line);
        else console.log(line);
    };

    return {
        info: (message, fields) => write('info', message, fields),
        warn: (message, fields) => write('warn', message, fields),
        error: (message, fields) => write('error', message, fields)
    };
}

/**
 * Truncated SHA-256 via Web Crypto (no Node APIs in a service worker): enough to
 * correlate one user's log lines, not enough to recover the DNI.
 * @returns {Promise<string|undefined>}
 */
export async function hashUser(documento) {
    if (documento === undefined || documento === null || documento === '') return undefined;

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(documento)));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

/** Reads documento from an EPEC JWT without verifying it; used only to hash it for logs. */
export function documentoFromToken(bearerToken) {
    try {
        const payloadPart = String(bearerToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(payloadPart)).documento;
    } catch {
        return undefined;
    }
}
