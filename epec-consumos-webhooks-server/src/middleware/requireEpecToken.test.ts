import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { fakeRequest, fakeResponse } from '../testing/fakeExpress.js';

const { getContratos } = vi.hoisted(() => ({ getContratos: vi.fn() }));
vi.mock('../services/epecAPIservice.js', () => ({ getContratos }));

import { classifyEpecFailure, requireEpecToken } from './requireEpecToken.js';
import { hashUser } from '../logger.js';

// The signing key is irrelevant: authenticity comes from EPEC accepting the token.
const tokenFor = (payload: object) => jwt.sign(payload, 'test-key');
const validToken = tokenFor({ email: 'Ana@Example.com', documento: 30111222 });

async function run(authorization?: string) {
    const req = fakeRequest({ headers: authorization === undefined ? {} : { authorization } });
    const res = fakeResponse();
    const next = vi.fn();
    await requireEpecToken(req, res, next);
    return { res, next };
}

beforeEach(() => {
    getContratos.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

function lastErrorLog() {
    const calls = vi.mocked(console.error).mock.calls;
    return { raw: String(calls.at(-1)?.[0]), entry: JSON.parse(String(calls.at(-1)?.[0])) };
}

describe('classifyEpecFailure', () => {
    it.each([
        [401, 'session-expired'],
        [403, 'session-expired'],
        [500, 'epec-unavailable'],
        [503, 'epec-unavailable'],
        [undefined, 'epec-unavailable'],
        [400, 'request-error'],
        [404, 'request-error'],
        [429, 'request-error']
    ] as const)('classifies status %s as %s', (status, kind) => {
        expect(classifyEpecFailure(status)).toBe(kind);
    });
});

describe('requireEpecToken logging', () => {
    it.each([
        [401, 'session-expired'],
        [403, 'session-expired'],
        [502, 'epec-unavailable'],
        [404, 'request-error']
    ])('logs EPEC status %s as %s with the hashed user and keeps the 401 response', async (status, kind) => {
        getContratos.mockResolvedValue({ ok: false, status });

        const { res } = await run(`Bearer ${validToken}`);

        expect(res.statusCode).toBe(401);
        const { raw, entry } = lastErrorLog();
        expect(entry).toMatchObject({ level: 'error', area: 'epec', kind, status, user: hashUser('30111222') });
        expect(raw).not.toContain('30111222');
        expect(raw.toLowerCase()).not.toContain('ana@example.com');
        expect(raw).not.toContain(validToken);
    });

    it('logs a network failure as epec-unavailable', async () => {
        getContratos.mockRejectedValue(new Error('fetch failed'));

        await run(`Bearer ${validToken}`);

        expect(lastErrorLog().entry).toMatchObject({ area: 'epec', kind: 'epec-unavailable', cause: 'fetch failed', user: hashUser('30111222') });
    });

    it('omits the user when the token carries no documento', async () => {
        getContratos.mockResolvedValue({ ok: false, status: 401 });

        await run('Bearer not-a-jwt');

        expect(lastErrorLog().entry.user).toBeUndefined();
    });
});

describe('requireEpecToken', () => {
    it('lets a token EPEC accepts through and exposes the verified user', async () => {
        getContratos.mockResolvedValue({ ok: true });

        const { res, next } = await run(`Bearer ${validToken}`);

        expect(getContratos).toHaveBeenCalledWith(validToken);
        expect(next).toHaveBeenCalledOnce();
        expect(res.locals.epecUser).toEqual({ email: 'ana@example.com', documento: '30111222' });
    });

    it.each([
        ['no Authorization header', undefined],
        ['empty header', ''],
        ['wrong scheme', `Basic ${validToken}`],
        ['lowercase scheme', `bearer ${validToken}`],
        ['scheme without token', 'Bearer'],
        ['scheme with blank token', 'Bearer ']
    ])('answers 401 for %s without calling EPEC', async (_label, header) => {
        const { res, next } = await run(header);

        expect(res.statusCode).toBe(401);
        expect(getContratos).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 when EPEC rejects the token (expired or forged)', async () => {
        getContratos.mockResolvedValue({ ok: false, status: 401 });

        const { res, next } = await run(`Bearer ${validToken}`);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'EPEC rejected the token. Log in to epec.com.ar again.' });
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 503 when EPEC cannot be reached', async () => {
        getContratos.mockRejectedValue(new Error('fetch failed'));

        const { res, next } = await run(`Bearer ${validToken}`);

        expect(res.statusCode).toBe(503);
        expect(next).not.toHaveBeenCalled();
    });

    it.each([
        ['no email', { documento: 1 }],
        ['no documento', { email: 'a@b.c' }]
    ])('answers 400 when an accepted token has %s', async (_label, payload) => {
        getContratos.mockResolvedValue({ ok: true });

        const { res, next } = await run(`Bearer ${tokenFor(payload)}`);

        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 400 when an accepted token is not a JWT', async () => {
        getContratos.mockResolvedValue({ ok: true });

        const { res, next } = await run('Bearer not-a-jwt');

        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('keeps documento 0 and string documentos as strings', async () => {
        getContratos.mockResolvedValue({ ok: true });

        const { res } = await run(`Bearer ${tokenFor({ email: 'a@b.c', documento: '0012' })}`);

        expect(res.locals.epecUser).toEqual({ email: 'a@b.c', documento: '0012' });
    });
});
