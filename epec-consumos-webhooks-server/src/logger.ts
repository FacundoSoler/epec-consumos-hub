import { createHash } from 'node:crypto';

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

/** Truncated SHA-256: enough to correlate one user's log lines, not enough to recover the DNI. */
export function hashUser(documento: string | number): string {
    return createHash('sha256').update(String(documento)).digest('hex').slice(0, 12);
}
