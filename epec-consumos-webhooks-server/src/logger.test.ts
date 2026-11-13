import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, getLogHashSecret, hashUser } from './logger.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('createLogger', () => {
    it.each([
        ['info', 'log'],
        ['warn', 'warn'],
        ['error', 'error']
    ] as const)('writes %s lines as JSON with level, timestamp and area', (level, consoleMethod) => {
        const spy = vi.spyOn(console, consoleMethod).mockImplementation(() => {});

        createLogger('epec')[level]('something happened', { status: 500 });

        const entry = JSON.parse(spy.mock.calls[0][0]);
        expect(entry).toMatchObject({ level, area: 'epec', message: 'something happened', status: 500 });
        expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });
});

describe('hashUser', () => {
    it('is stable for one secret, short and does not contain the documento', () => {
        vi.stubEnv('LOG_HASH_SECRET', 'secret-a');
        const hash = hashUser('30111222');

        expect(hash).toBe(hashUser(30111222));
        expect(hash).toMatch(/^[0-9a-f]{12}$/);
        expect(hash).not.toContain('30111222');
        expect(hashUser('30111223')).not.toBe(hash);
    });

    it('gives a different hash for the same DNI under a different secret', () => {
        vi.stubEnv('LOG_HASH_SECRET', 'secret-a');
        const first = hashUser('30111222');
        vi.stubEnv('LOG_HASH_SECRET', 'secret-b');

        expect(hashUser('30111222')).not.toBe(first);
    });
});

describe('getLogHashSecret', () => {
    it('throws in production when LOG_HASH_SECRET is missing', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('LOG_HASH_SECRET', '');

        expect(() => getLogHashSecret()).toThrow('LOG_HASH_SECRET must be set in production.');
        expect(() => hashUser('1')).toThrow();
    });

    it('falls back to a dev default outside production and warns only once', async () => {
        vi.resetModules();
        const fresh = await import('./logger.js');
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('LOG_HASH_SECRET', '');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(fresh.getLogHashSecret()).toBe(fresh.getLogHashSecret());
        expect(warn).toHaveBeenCalledOnce();
        expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ level: 'warn', area: 'config' });
    });

    it('uses the configured secret in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('LOG_HASH_SECRET', 'real-secret');

        expect(getLogHashSecret()).toBe('real-secret');
    });
});
