import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, documentoFromToken, hashUser } from '../src/utils/logger.js';

afterEach(() => vi.restoreAllMocks());

const base64Url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (payload) => `${base64Url({ alg: 'HS256' })}.${base64Url(payload)}.signature`;

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

describe('hashUser', () => {
    it('is stable, short and does not contain the documento', async () => {
        const hash = await hashUser('30111222');

        expect(hash).toMatch(/^[0-9a-f]{12}$/);
        expect(await hashUser(30111222)).toBe(hash);
        expect(await hashUser('30111223')).not.toBe(hash);
        expect(hash).not.toContain('30111222');
    });

    it.each([undefined, null, ''])('returns undefined for a missing documento (%s)', async (documento) => {
        expect(await hashUser(documento)).toBeUndefined();
    });
});

describe('documentoFromToken', () => {
    it('reads documento from the JWT payload', () => {
        expect(documentoFromToken(fakeJwt({ documento: 30111222, email: 'a@b.c' }))).toBe(30111222);
    });

    it.each(['not-a-jwt', '', undefined])('returns undefined for an unreadable token (%s)', (token) => {
        expect(documentoFromToken(token)).toBeUndefined();
    });
});
