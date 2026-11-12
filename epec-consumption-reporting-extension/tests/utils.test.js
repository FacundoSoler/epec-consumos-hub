import { afterEach, describe, expect, it, vi } from 'vitest';
import { getToDate } from '../src/utils/utils.js';

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
