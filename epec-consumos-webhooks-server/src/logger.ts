import { createHmac } from 'node:crypto';

// Only for local development and tests; production refuses to start without a real secret.
const DEV_LOG_HASH_SECRET = 'dev-only-log-hash-secret';
let warnedAboutDevSecret = false;

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Record<string, string | number | boolean | undefined>;

export interface Logger {
    info(message: string, fields?: LogFields): void;
    warn(message: string, fields?: LogFields): void;
    error(message: string, fields?: LogFields): void;
}

/**
 * One JSON object per line so Railway's log search can filter by area/level.
 * Callers must never pass raw tokens, emails or DNIs; use hashUser() for identity.
 */
export function createLogger(area: string): Logger {
    const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
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
 * Keyed so the ~10^8 possible DNIs cannot be brute-forced back from a log line
 * without the secret. Truncated to 12 hex chars for readability.
 */
export function hashUser(documento: string | number): string {
    return createHmac('sha256', getLogHashSecret()).update(String(documento)).digest('hex').slice(0, 12);
}

/** Called at startup so a missing Railway variable fails the deploy instead of the first EPEC error. */
export function getLogHashSecret(): string {
    const secret = process.env.LOG_HASH_SECRET;
    if (secret) return secret;

    if (process.env.NODE_ENV === 'production') {
        throw new Error('LOG_HASH_SECRET must be set in production.');
    }
    if (!warnedAboutDevSecret) {
        warnedAboutDevSecret = true;
        createLogger('config').warn('LOG_HASH_SECRET is not set; using a dev-only default.');
    }
    return DEV_LOG_HASH_SECRET;
}
