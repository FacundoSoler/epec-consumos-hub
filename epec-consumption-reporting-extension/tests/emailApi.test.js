import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_REQUEST_TIMEOUT_MS, createEmailOutcome, postEmailRequest } from '../src/services/emailApi.js';

const request = {
    apiBaseUrl: 'http://localhost:3000/api',
    path: '/email/sendEmailNotification',
    token: 'tok',
    subject: 'Asunto',
    htmlContent: '<p>hola</p>'
};

const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function stubFetch(implementation) {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('postEmailRequest', () => {
    it('posts the subject and HTML with the EPEC token and an abort signal', async () => {
        const fetchMock = stubFetch(async () => respond(200, { status: 'sent' }));

        await postEmailRequest(request);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost:3000/api/email/sendEmailNotification');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer tok');
        expect(JSON.parse(options.body)).toEqual({ subject: 'Asunto', htmlContent: '<p>hola</p>' });
        expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it.each([
        [200, { status: 'sent' }, { result: 'sent', reason: 'sent', status: 200 }],
        [200, {}, { result: 'failed', reason: 'unexpected-response', status: 200 }],
        [200, undefined, { result: 'failed', reason: 'unexpected-response', status: 200 }],
        [204, null, { result: 'failed', reason: 'unexpected-response', status: 204 }],
        [429, { error: 'already sent' }, { result: 'already-sent', reason: 'already-sent', status: 429 }],
        [401, {}, { result: 'failed', reason: 'session-rejected', status: 401 }],
        [403, {}, { result: 'failed', reason: 'session-rejected', status: 403 }],
        [400, { error: 'subject is required.' }, { result: 'failed', reason: 'invalid-data', status: 400, details: { serverMessage: 'subject is required.' } }],
        [400, {}, { result: 'failed', reason: 'invalid-data', status: 400 }],
        [500, {}, { result: 'failed', reason: 'server-error', status: 500 }],
        [502, {}, { result: 'failed', reason: 'server-error', status: 502 }],
        [503, {}, { result: 'failed', reason: 'server-error', status: 503 }]
    ])('classifies %i with body %j', async (status, body, expected) => {
        stubFetch(async () => respond(status, body));

        expect(await postEmailRequest(request)).toEqual({ ...expected, server: 'http://localhost:3000' });
    });

    it('classifies a body that is not JSON by status alone', async () => {
        stubFetch(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('bad json'); } }));

        expect(await postEmailRequest(request)).toMatchObject({ result: 'failed', reason: 'server-error', status: 502 });
    });

    it('reports server-unreachable when fetch rejects', async () => {
        stubFetch(async () => { throw new TypeError('Failed to fetch'); });

        expect(await postEmailRequest(request)).toEqual({ result: 'failed', reason: 'server-unreachable', server: 'http://localhost:3000' });
    });

    it(`aborts after ${EMAIL_REQUEST_TIMEOUT_MS} ms and reports a timeout`, async () => {
        vi.useFakeTimers();
        stubFetch((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));

        const pending = postEmailRequest(request);
        await vi.advanceTimersByTimeAsync(EMAIL_REQUEST_TIMEOUT_MS - 1);
        let settled = false;
        pending.then(() => { settled = true; });
        await Promise.resolve();
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        expect(await pending).toEqual({ result: 'failed', reason: 'timeout', server: 'http://localhost:3000' });
    });
});

describe('createEmailOutcome', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-12T13:00:00Z'));
    });

    it('stamps the outcome with the attempt time', () => {
        expect(createEmailOutcome('report', 'skipped', 'disabled')).toEqual({
            kind: 'report', result: 'skipped', reason: 'disabled', at: '2026-11-12T13:00:00.000Z'
        });
    });
});
