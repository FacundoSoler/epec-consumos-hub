import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import { buildDailyReportHtml, sendDailyReportIfDue } from '../src/services/dailyReportService.js';

const API = 'http://localhost:3000/api';
// Thursday 12 Nov 2026, 10:00 in Córdoba (UTC-3) -> weekday "4"
const THURSDAY_MORNING = new Date('2026-11-12T13:00:00Z');

const readings = [
    { fechaHora: '11/11/2026', consumo: 12, dateSorting: 2 },
    { fechaHora: '10/11/2026', consumo: 10.5, dateSorting: 1 }
];

function setup({ prefs = { email_reports: { enabled: true, days: ['4'] } }, storage = {}, status = 200 } = {}) {
    const mock = createChromeMock({
        epecUser: { nombre: 'Ana', token: 'tok' },
        notificationPrefs: prefs,
        consumptionData: readings,
        ...storage
    });
    vi.stubGlobal('chrome', mock.chrome);
    const fetchMock = vi.fn().mockResolvedValue({ ok: status < 400, status });
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

describe('sendDailyReportIfDue', () => {
    it('sends the report with the EPEC token and remembers the day', async () => {
        const { mock, fetchMock } = setup();

        await sendDailyReportIfDue(API);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost:3000/api/email/sendEmailNotification');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer tok');
        const body = JSON.parse(options.body);
        expect(body.subject).toContain('Ana');
        expect(body).not.toHaveProperty('sendToEmailAddress');
        expect(mock.storage.lastReportSentOn).toBe('2026-11-12');
    });

    it.each([
        ['reports are disabled', { prefs: { email_reports: { enabled: false, days: ['4'] } } }],
        ['no preferences were saved', { prefs: null }],
        ['today is not a selected day', { prefs: { email_reports: { enabled: true, days: ['1', '3'] } } }],
        ['no days are selected', { prefs: { email_reports: { enabled: true, days: [] } } }],
        ['it was already sent today', { storage: { lastReportSentOn: '2026-11-12' } }],
        ['there is no consumption data yet', { storage: { consumptionData: [] } }]
    ])('does nothing when %s', async (_label, options) => {
        const { fetchMock } = setup(options);

        await sendDailyReportIfDue(API);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends again on a new day after yesterday’s report', async () => {
        const { fetchMock } = setup({ storage: { lastReportSentOn: '2026-11-11' } });

        await sendDailyReportIfDue(API);

        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('treats 429 (already sent, e.g. from another device) as sent', async () => {
        const { mock } = setup({ status: 429 });

        await sendDailyReportIfDue(API);

        expect(mock.storage.lastReportSentOn).toBe('2026-11-12');
    });

    it.each([401, 500, 502])('throws on %i and leaves the day unsent so it retries', async (status) => {
        const { mock } = setup({ status });

        await expect(sendDailyReportIfDue(API)).rejects.toThrow(`status ${status}`);
        expect(mock.storage.lastReportSentOn).toBeUndefined();
    });

    it('uses the Córdoba weekday: Sunday 23:00 Córdoba is already Monday in UTC', async () => {
        vi.setSystemTime(new Date('2026-11-16T02:00:00Z')); // Sun 15 Nov, 23:00 Córdoba
        const { fetchMock, mock } = setup({ prefs: { email_reports: { enabled: true, days: ['0'] } } });

        await sendDailyReportIfDue(API);

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(mock.storage.lastReportSentOn).toBe('2026-11-15');
    });
});

describe('buildDailyReportHtml', () => {
    it('lists each day and the total, average and 28-day projection', () => {
        const html = buildDailyReportHtml('Ana', readings);

        expect(html).toContain('11/11/2026: <b>12 kWh</b>');
        expect(html).toContain('10/11/2026: <b>11 kWh</b>');
        expect(html).toContain('Total acumulado: <b>23 kWh</b>');
        expect(html).toContain('Promedio diario: <b>11 kWh</b>');
        expect(html).toContain('(28 días): <b>315 kWh</b>');
    });

    it('escapes HTML in the user name and dates', () => {
        const html = buildDailyReportHtml('<script>alert(1)</script>', [{ fechaHora: '<b>x</b>', consumo: 1 }]);

        expect(html).not.toContain('<script>');
        expect(html).toContain('&#60;script&#62;');
        expect(html).not.toContain('<b>x</b>');
    });

    it('handles comma-decimal readings from older stored data', () => {
        expect(buildDailyReportHtml('Ana', [{ fechaHora: '01/11/2026', consumo: '12,6' }])).toContain('<b>13 kWh</b>');
    });
});
