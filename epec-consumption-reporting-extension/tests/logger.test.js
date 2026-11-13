import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/utils/logger.js';

afterEach(() => vi.restoreAllMocks());


describe('createLogger', () => {
    it.each([
        ['info', 'log'],
        ['warn', 'warn'],
        ['error', 'error']
    ])('writes %s lines as JSON with level, timestamp and area', (level, consoleMethod) => {
        const spy = vi.spyOn(console, consoleMethod).mockImplementation(() => {});

        createLogger('epec')[level]('something happened', { status: 503 });

        const entry = JSON.parse(spy.mock.calls[0][0]);
        expect(entry).toMatchObject({ level, area: 'epec', message: 'something happened', status: 503 });
        expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });
});
