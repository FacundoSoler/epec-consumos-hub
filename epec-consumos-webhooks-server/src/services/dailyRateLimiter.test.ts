import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyRateLimiter } from './dailyRateLimiter.js';

describe('DailyRateLimiter', () => {
    it('allows a key once per day', () => {
        const limiter = new DailyRateLimiter(() => '2026-11-12');

        expect(limiter.tryReserve('report:123')).toBe(true);
        expect(limiter.tryReserve('report:123')).toBe(false);
        expect(limiter.tryReserve('alert:123')).toBe(true);
    });

    it('allows the key again after release', () => {
        const limiter = new DailyRateLimiter(() => '2026-11-12');

        limiter.tryReserve('report:123');
        limiter.release('report:123');

        expect(limiter.tryReserve('report:123')).toBe(true);
    });

    it('forgets previous days so memory stays bounded', () => {
        let today = '2026-11-12';
        const limiter = new DailyRateLimiter(() => today);
        limiter.tryReserve('report:1');
        limiter.tryReserve('report:2');

        today = '2026-11-13';

        expect(limiter.tryReserve('report:1')).toBe(true);
        expect(limiter.size).toBe(1);
    });

    it('ignores releasing a key that was never reserved', () => {
        const limiter = new DailyRateLimiter(() => '2026-11-12');

        expect(() => limiter.release('report:999')).not.toThrow();
        expect(limiter.size).toBe(0);
    });
});

describe('DailyRateLimiter default clock (Córdoba time)', () => {
    afterEach(() => vi.useRealTimers());

    it('treats 23:59 and 00:01 Córdoba time as different days', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-13T02:59:00Z')); // 23:59 on the 12th in Córdoba (UTC-3)
        const limiter = new DailyRateLimiter();
        limiter.tryReserve('report:1');

        vi.setSystemTime(new Date('2026-11-13T03:01:00Z')); // 00:01 on the 13th in Córdoba

        expect(limiter.tryReserve('report:1')).toBe(true);
    });

    it('does not reset at UTC midnight, which is still the same Córdoba day', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-12T23:30:00Z')); // 20:30 on the 12th in Córdoba
        const limiter = new DailyRateLimiter();
        limiter.tryReserve('report:1');

        vi.setSystemTime(new Date('2026-11-13T00:30:00Z')); // 21:30, still the 12th in Córdoba

        expect(limiter.tryReserve('report:1')).toBe(false);
    });
});
