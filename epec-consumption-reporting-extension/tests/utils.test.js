import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCordobaDateKey, getCordobaWeekday, getToDate } from '../src/utils/utils.js';

describe('getCordobaWeekday / getCordobaDateKey', () => {
    afterEach(() => vi.useRealTimers());

    it.each([
        ['2026-11-15T15:00:00Z', '0', '2026-11-15'], // Sunday afternoon
        ['2026-11-16T02:00:00Z', '0', '2026-11-15'], // Sunday 23:00 Córdoba, Monday in UTC
        ['2026-11-16T03:00:00Z', '1', '2026-11-16'], // Monday 00:00 Córdoba
        ['2026-11-21T12:00:00Z', '6', '2026-11-21'], // Saturday
        ['2027-01-01T02:00:00Z', '4', '2026-12-31']  // New Year's Eve 23:00 Córdoba
    ])('at %s it is weekday "%s" on %s', (instant, weekday, dateKey) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(instant));

        expect(getCordobaWeekday()).toBe(weekday);
        expect(getCordobaDateKey()).toBe(dateKey);
    });
});

afterEach(() => vi.useRealTimers());

describe('getToDate', () => {
    it('formats Córdoba time (UTC-3) as DDMMYYYYHHmm', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-12T12:34:00Z'));

        expect(getToDate()).toBe('121120260934');
    });

    it('stays on the previous Córdoba day just after UTC midnight', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-12T02:05:00Z'));

        expect(getToDate()).toBe('111120262305');
    });

    it('zero-pads single-digit day, month, hour and minute', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-02T06:07:00Z'));

        expect(getToDate()).toBe('020120260307');
    });
});
