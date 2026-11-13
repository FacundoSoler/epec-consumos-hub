import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import {
    buildThresholdAlertHtml,
    evaluateThresholdAlert,
    sendThresholdAlertIfDue,
    validateAlertThreshold
} from '../src/services/alertService.js';

const API = 'http://localhost:3000/api';
const THURSDAY_MORNING = new Date('2026-11-12T13:00:00Z');

// Newest first: the last 3 days average 20 kWh, the last 2 average 22.5.
const readings = [
    { fechaHora: '11/11/2026', consumo: 25 },
    { fechaHora: '10/11/2026', consumo: 20 },
    { fechaHora: '09/11/2026', consumo: 15 },
    { fechaHora: '08/11/2026', consumo: 2 }
];

const alertPrefs = (threshold, enabled = true) => ({ email_alerts: { enabled, threshold } });

function setup({ prefs = alertPrefs({ kwh_limit_per_day: 19, rolling_days_window: 3 }), storage = {}, status = 200, body = { status: 'sent' } } = {}) {
    const mock = createChromeMock({
        epecUser: { nombre: 'Ana', token: 'tok', email: 'ana.paz@example.com' },
        notificationPrefs: prefs,
        consumptionData: readings,
        ...storage
    });
    vi.stubGlobal('chrome', mock.chrome);
    const fetchMock = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    return { mock, fetchMock };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(THURSDAY_MORNING);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('evaluateThresholdAlert', () => {
    it('averages only the newest N readings', () => {
        expect(evaluateThresholdAlert(readings, { kwh_limit_per_day: 22, rolling_days_window: 2 }))
            .toEqual({ exceeded: true, average: 22.5, limit: 22, windowDays: 2 });
    });

    it('is not exceeded when the average is exactly at the limit', () => {
        expect(evaluateThresholdAlert(readings, { kwh_limit_per_day: 20, rolling_days_window: 3 }).exceeded).toBe(false);
    });

    it('is not exceeded below the limit', () => {
        expect(evaluateThresholdAlert(readings, { kwh_limit_per_day: 30, rolling_days_window: 1 }).exceeded).toBe(false);
    });

    it('does not alert with fewer readings than the window, even if they are high', () => {
        expect(evaluateThresholdAlert(readings, { kwh_limit_per_day: 1, rolling_days_window: 5 }).exceeded).toBe(false);
    });

    it('does not alert with zero readings', () => {
        expect(evaluateThresholdAlert([], { kwh_limit_per_day: 1, rolling_days_window: 1 }).exceeded).toBe(false);
    });

    it('accepts comma-decimal readings from older stored data', () => {
        expect(evaluateThresholdAlert([{ consumo: '12,5' }], { kwh_limit_per_day: 12, rolling_days_window: 1 }).average).toBe(12.5);
    });
});

describe('validateAlertThreshold', () => {
    it('accepts a positive limit and an integer window from 1 to 31', () => {
        expect(validateAlertThreshold({ kwh_limit_per_day: 0.1, rolling_days_window: 1 })).toBeNull();
        expect(validateAlertThreshold({ kwh_limit_per_day: 20, rolling_days_window: 31 })).toBeNull();
    });

    it.each([0, -1, NaN, undefined])('rejects a limit of %s', (limit) => {
        expect(validateAlertThreshold({ kwh_limit_per_day: limit, rolling_days_window: 3 })).toMatch(/mayor a 0/);
    });

    it.each([0, 32, 2.5, NaN, undefined])('rejects a window of %s', (windowDays) => {
        expect(validateAlertThreshold({ kwh_limit_per_day: 20, rolling_days_window: windowDays })).toMatch(/entre 1 y 31/);
    });
});

describe('sendThresholdAlertIfDue', () => {
    it('sends the alert with the EPEC token and remembers the day', async () => {
        const { mock, fetchMock } = setup();

        await sendThresholdAlertIfDue(API);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost:3000/api/email/sendEmailAlert');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer tok');
        const body = JSON.parse(options.body);
        expect(body.subject).toContain('Alerta');
        expect(body.htmlContent).toContain('20 kWh por día');
        expect(body).not.toHaveProperty('sendToEmailAddress');
        expect(mock.storage.lastAlertSentOn).toBe('2026-11-12');
    });

    it.each([
        ['alerts are disabled', 'disabled', { prefs: alertPrefs({ kwh_limit_per_day: 19, rolling_days_window: 3 }, false) }],
        ['no preferences were saved', 'disabled', { prefs: null }],
        ['the saved threshold is invalid', 'invalid-threshold', { prefs: alertPrefs({ kwh_limit_per_day: 0, rolling_days_window: 3 }) }],
        ['there is no consumption data yet', 'no-data', { storage: { consumptionData: [] } }],
        ['there are fewer readings than the window', 'no-data', { prefs: alertPrefs({ kwh_limit_per_day: 1, rolling_days_window: 5 }) }],
        ['the EPEC session expired', 'session-expired', { storage: { sessionExpired: true } }]
    ])('skips without calling the server when %s', async (_label, reason, options) => {
        const { fetchMock } = setup(options);

        const outcome = await sendThresholdAlertIfDue(API);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: 'alert', result: 'skipped', reason, at: THURSDAY_MORNING.toISOString() });
    });

    it('skips below the limit and reports the average, limit and window', async () => {
        const { fetchMock } = setup({ prefs: alertPrefs({ kwh_limit_per_day: 20, rolling_days_window: 3 }) });

        const outcome = await sendThresholdAlertIfDue(API);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({ result: 'skipped', reason: 'below-threshold', details: { average: 20, limit: 20, windowDays: 3 } });
    });

    it('reports already-sent without calling the server when today is already recorded', async () => {
        const { fetchMock } = setup({ storage: { lastAlertSentOn: '2026-11-12' } });

        const outcome = await sendThresholdAlertIfDue(API);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({ result: 'already-sent', reason: 'already-sent-locally', recipient: 'an•••@example.com' });
    });

    it('logs one warning without the threshold values when the stored threshold is invalid', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setup({ prefs: alertPrefs({ kwh_limit_per_day: -7, rolling_days_window: 3 }) });

        await sendThresholdAlertIfDue(API);

        expect(warn).toHaveBeenCalledOnce();
        const line = JSON.parse(warn.mock.calls[0][0]);
        expect(line).toMatchObject({ level: 'warn', area: 'alerts' });
        expect(warn.mock.calls[0][0]).not.toContain('-7');
        warn.mockRestore();
    });

    it('does not warn when alerts are simply disabled', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setup({ prefs: alertPrefs({ kwh_limit_per_day: 0, rolling_days_window: 0 }, false) });

        await sendThresholdAlertIfDue(API);

        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('sends again on a new day', async () => {
        const { fetchMock } = setup({ storage: { lastAlertSentOn: '2026-11-11' } });

        await sendThresholdAlertIfDue(API);

        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('returns a sent outcome with the masked recipient and the evaluation', async () => {
        setup();

        expect(await sendThresholdAlertIfDue(API)).toMatchObject({
            kind: 'alert', result: 'sent', status: 200, recipient: 'an•••@example.com',
            details: { average: 20, limit: 19, windowDays: 3 }
        });
    });

    it('treats 429 (already sent today) as already-sent and records the day', async () => {
        const { mock } = setup({ status: 429, body: {} });

        expect(await sendThresholdAlertIfDue(API)).toMatchObject({ result: 'already-sent' });
        expect(mock.storage.lastAlertSentOn).toBe('2026-11-12');
    });

    it.each([
        [200, {}, 'unexpected-response'],
        [400, { error: 'htmlContent is required.' }, 'invalid-data'],
        [401, {}, 'session-rejected'],
        [403, {}, 'session-rejected'],
        [500, {}, 'server-error'],
        [503, {}, 'server-error']
    ])('returns failed on %i and leaves the day unsent so it retries', async (status, body, reason) => {
        const { mock } = setup({ status, body });

        expect(await sendThresholdAlertIfDue(API)).toMatchObject({ kind: 'alert', result: 'failed', reason, status });
        expect(mock.storage.lastAlertSentOn).toBeUndefined();
    });

    it('keeps the evaluation and adds the server validation message for invalid data', async () => {
        setup({ status: 400, body: { error: 'htmlContent is required.' } });

        expect((await sendThresholdAlertIfDue(API)).details)
            .toEqual({ average: 20, limit: 19, windowDays: 3, serverMessage: 'htmlContent is required.' });
    });

    it('never records the day when the server is unreachable', async () => {
        const { mock, fetchMock } = setup();
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        expect(await sendThresholdAlertIfDue(API)).toMatchObject({ result: 'failed', reason: 'server-unreachable' });
        expect(mock.storage.lastAlertSentOn).toBeUndefined();
    });

    it('never records the day when the request times out', async () => {
        const { mock, fetchMock } = setup();
        fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));

        const pending = sendThresholdAlertIfDue(API);
        await vi.advanceTimersByTimeAsync(15_000);

        expect(await pending).toMatchObject({ result: 'failed', reason: 'timeout' });
        expect(mock.storage.lastAlertSentOn).toBeUndefined();
    });
});

describe('buildThresholdAlertHtml', () => {
    it('states the average, the limit and the window in Spanish', () => {
        const html = buildThresholdAlertHtml('Ana', { average: 22.46, limit: 20, windowDays: 3 });

        expect(html).toContain('los últimos 3 días');
        expect(html).toContain('<b>22,5 kWh por día</b>');
        expect(html).toContain('<b>20 kWh por día</b>');
    });

    it('uses the singular for a one-day window', () => {
        expect(buildThresholdAlertHtml('Ana', { average: 30, limit: 20, windowDays: 1 })).toContain('el último día');
    });

    it('escapes HTML in the user name', () => {
        const html = buildThresholdAlertHtml('<img src=x>', { average: 30, limit: 20, windowDays: 1 });

        expect(html).not.toContain('<img');
        expect(html).toContain('&#60;img');
    });
});
