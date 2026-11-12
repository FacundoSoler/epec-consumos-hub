import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, hashUser } from './logger.js';

afterEach(() => vi.restoreAllMocks());

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
    it('is stable, short and does not contain the documento', () => {
        const hash = hashUser('30111222');

        expect(hash).toBe(hashUser(30111222));
        expect(hash).toMatch(/^[0-9a-f]{12}$/);
        expect(hash).not.toContain('30111222');
        expect(hashUser('30111223')).not.toBe(hash);
    });
});
