/**
 * One JSON object per line so service-worker logs can be filtered by area/level.
 * Callers must never pass raw tokens, emails or DNIs. There is no user field: one
 * install is one user, and an extension cannot keep a hashing secret.
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
