import { describe, expect, it } from 'vitest';
import {
    KWH_LIMIT_OPTIONS,
    ROLLING_DAYS_OPTIONS,
    resolveAlertSelection,
    snapToNearestOption
} from '../src/utils/notificationOptions.js';

describe('alert threshold options', () => {
    it('offers 5 to 50 kWh in steps of 5', () => {
        expect(KWH_LIMIT_OPTIONS).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    });

    it('offers 1 to 31 days', () => {
        expect(ROLLING_DAYS_OPTIONS).toHaveLength(31);
        expect(ROLLING_DAYS_OPTIONS[0]).toBe(1);
        expect(ROLLING_DAYS_OPTIONS[30]).toBe(31);
    });
});

describe('snapToNearestOption', () => {
    it('keeps a value that is already an option', () => {
        expect(snapToNearestOption(20, KWH_LIMIT_OPTIONS, 15)).toBe(20);
    });

    it('picks the nearest option', () => {
        expect(snapToNearestOption(18, KWH_LIMIT_OPTIONS, 15)).toBe(20);
        expect(snapToNearestOption(16, KWH_LIMIT_OPTIONS, 15)).toBe(15);
    });

    it('sends ties to the lower option', () => {
        expect(snapToNearestOption(17.5, KWH_LIMIT_OPTIONS, 5)).toBe(15);
        expect(snapToNearestOption(2.5, KWH_LIMIT_OPTIONS, 50)).toBe(5);
    });

    it('clamps values outside the range', () => {
        expect(snapToNearestOption(0.5, KWH_LIMIT_OPTIONS, 15)).toBe(5);
        expect(snapToNearestOption(-3, KWH_LIMIT_OPTIONS, 15)).toBe(5);
        expect(snapToNearestOption(120, KWH_LIMIT_OPTIONS, 15)).toBe(50);
        expect(snapToNearestOption(40, ROLLING_DAYS_OPTIONS, 3)).toBe(31);
        expect(snapToNearestOption(0, ROLLING_DAYS_OPTIONS, 3)).toBe(1);
    });

    it('accepts numeric strings, including a decimal comma', () => {
        expect(snapToNearestOption('22', KWH_LIMIT_OPTIONS, 15)).toBe(20);
        expect(snapToNearestOption('12,4', KWH_LIMIT_OPTIONS, 5)).toBe(10);
    });

    it.each([undefined, null, '', 'abc', NaN, Infinity, {}, []])('returns the fallback for %j', (value) => {
        expect(snapToNearestOption(value, KWH_LIMIT_OPTIONS, 15)).toBe(15);
    });
});

describe('resolveAlertSelection', () => {
    it('defaults to 15 kWh and 3 days when nothing is stored', () => {
        expect(resolveAlertSelection(undefined)).toEqual({ kwhLimit: 15, rollingDays: 3 });
        expect(resolveAlertSelection({})).toEqual({ kwhLimit: 15, rollingDays: 3 });
    });

    it('snaps stored values to the dropdown options', () => {
        expect(resolveAlertSelection({ kwh_limit_per_day: 17.5, rolling_days_window: 40 }))
            .toEqual({ kwhLimit: 15, rollingDays: 31 });
    });
});
