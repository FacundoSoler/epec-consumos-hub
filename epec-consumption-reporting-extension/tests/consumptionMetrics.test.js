import { describe, expect, it } from 'vitest';
import { summarizeConsumption, toKwh } from '../src/utils/consumptionMetrics.js';

describe('toKwh', () => {
    it.each([
        [12.4, 12.4],
        [0, 0],
        ['12,4', 12.4],
        ['12.4', 12.4],
        [' 7 ', 7]
    ])('reads %j as %d kWh', (input, expected) => {
        expect(toKwh(input)).toBe(expected);
    });

    it.each([null, undefined, 'abc', NaN, Infinity])('treats %j as 0 instead of crashing', (input) => {
        expect(toKwh(input)).toBe(0);
    });

    it('does not throw on numbers (the old .replace() crash)', () => {
        expect(() => toKwh(10)).not.toThrow();
    });
});

describe('summarizeConsumption', () => {
    it('computes total, daily average and 28-day projection', () => {
        const summary = summarizeConsumption([{ consumo: 10 }, { consumo: '20,0' }, { consumo: 30 }]);

        expect(summary).toEqual({ total: 60, average: 20, projected: 560 });
    });

    it('does not truncate comma decimals (parseFloat("12,4") read as 12)', () => {
        expect(summarizeConsumption([{ consumo: '12,4' }]).total).toBe(12.4);
    });

    it('returns zeros for an empty period instead of NaN', () => {
        expect(summarizeConsumption([])).toEqual({ total: 0, average: 0, projected: 0 });
    });

    it('counts unreadable values as 0 kWh but still as a day', () => {
        expect(summarizeConsumption([{ consumo: 10 }, { consumo: null }])).toEqual({ total: 10, average: 5, projected: 140 });
    });
});
