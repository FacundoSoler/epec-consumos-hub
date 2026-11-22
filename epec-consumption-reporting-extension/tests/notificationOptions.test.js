import { describe, expect, it } from 'vitest';
import {
    KWH_LIMIT_OPTIONS,
    QUICK_DAY_SELECTIONS,
    WEEKDAY_OPTIONS,
    buildAlertsSection,
    buildNotificationPreferences,
    buildReportsSection,
    mergeSectionIntoPreferences,
    shouldShowNoDaysHint,
    orderDaysMondayFirst,
    toggleDay,
    ROLLING_DAYS_OPTIONS,
    resolveAlertSelection,
    snapToNearestOption
} from '../src/utils/notificationOptions.js';
import { validateAlertThreshold } from '../src/services/alertService.js';

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

describe('weekday options', () => {
    it('lists Monday first with Sunday "0" last', () => {
        expect(WEEKDAY_OPTIONS.map((day) => day.value)).toEqual(['1', '2', '3', '4', '5', '6', '0']);
        expect(WEEKDAY_OPTIONS.map((day) => day.label).join(' ')).toBe('L M M J V S D');
        expect(WEEKDAY_OPTIONS.map((day) => day.name))
            .toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    });

    it('offers Todos, Hábiles and Ninguno quick selections', () => {
        const byLabel = Object.fromEntries(QUICK_DAY_SELECTIONS.map((quick) => [quick.label, quick.days]));
        expect(byLabel).toEqual({
            Todos: ['1', '2', '3', '4', '5', '6', '0'],
            Hábiles: ['1', '2', '3', '4', '5'],
            Ninguno: []
        });
    });
});

describe('orderDaysMondayFirst', () => {
    it('orders stored days Monday first and keeps strings', () => {
        expect(orderDaysMondayFirst(['0', '3', '1'])).toEqual(['1', '3', '0']);
    });

    it('accepts numbers, drops unknown values and duplicates', () => {
        expect(orderDaysMondayFirst([0, '0', 7, 'x', 6])).toEqual(['6', '0']);
    });

    it('treats a missing list as no days', () => {
        expect(orderDaysMondayFirst(undefined)).toEqual([]);
    });
});

describe('toggleDay', () => {
    it('adds a missing day in Monday-first order', () => {
        expect(toggleDay(['1', '0'], '5')).toEqual(['1', '5', '0']);
    });

    it('removes a selected day', () => {
        expect(toggleDay(['1', '5', '0'], '0')).toEqual(['1', '5']);
    });
});

describe('buildNotificationPreferences', () => {
    it('builds the stored preferences shape with string days and numeric threshold', () => {
        const preferences = buildNotificationPreferences({
            reportsEnabled: true,
            reportDays: ['0', '1', '5'],
            alertsEnabled: false,
            kwhLimit: '25',
            rollingDays: '7'
        });

        expect(preferences).toStrictEqual({
            email_reports: { enabled: true, days: ['1', '5', '0'] },
            email_alerts: { enabled: false, threshold: { kwh_limit_per_day: 25, rolling_days_window: 7 } }
        });
    });

    it('stores booleans and an empty day list for an untouched form', () => {
        const preferences = buildNotificationPreferences({ reportDays: [], kwhLimit: 15, rollingDays: 3 });

        expect(preferences.email_reports).toStrictEqual({ enabled: false, days: [] });
        expect(preferences.email_alerts.enabled).toBe(false);
    });

    it('produces a threshold the alert validation accepts for every dropdown choice', () => {
        for (const kwhLimit of KWH_LIMIT_OPTIONS) {
            for (const rollingDays of ROLLING_DAYS_OPTIONS) {
                const { email_alerts } = buildNotificationPreferences({ reportDays: [], kwhLimit, rollingDays });
                expect(validateAlertThreshold(email_alerts.threshold)).toBeNull();
            }
        }
    });
});

describe('mergeSectionIntoPreferences', () => {
    const stored = {
        email_reports: { enabled: true, days: ['0', '3'] },
        email_alerts: { enabled: true, threshold: { kwh_limit_per_day: 17.5, rolling_days_window: 40 } }
    };

    it('changing reports keeps an off-list stored threshold untouched', () => {
        const reports = buildReportsSection({ reportsEnabled: true, reportDays: ['1'] });

        const merged = mergeSectionIntoPreferences(stored, 'email_reports', reports);

        expect(merged).toStrictEqual({ email_reports: { enabled: true, days: ['1'] }, email_alerts: stored.email_alerts });
    });

    it('changing alerts keeps the stored days untouched, in their stored order', () => {
        const alerts = buildAlertsSection({ alertsEnabled: false, kwhLimit: '20', rollingDays: '3' });

        const merged = mergeSectionIntoPreferences(stored, 'email_alerts', alerts);

        expect(merged.email_reports).toBe(stored.email_reports);
        expect(merged.email_alerts).toStrictEqual({ enabled: false, threshold: { kwh_limit_per_day: 20, rolling_days_window: 3 } });
    });

    it('fills the untouched section with defaults when nothing is stored yet', () => {
        const reports = buildReportsSection({ reportsEnabled: true, reportDays: ['1'] });

        expect(mergeSectionIntoPreferences(undefined, 'email_reports', reports).email_alerts)
            .toStrictEqual({ enabled: false, threshold: { kwh_limit_per_day: 15, rolling_days_window: 3 } });
        expect(mergeSectionIntoPreferences({}, 'email_alerts', buildAlertsSection({ kwhLimit: 5, rollingDays: 1 })).email_reports)
            .toStrictEqual({ enabled: false, days: [] });
    });

    it('does not mutate the stored preferences', () => {
        const copy = structuredClone(stored);
        mergeSectionIntoPreferences(stored, 'email_reports', { enabled: false, days: [] });
        expect(stored).toStrictEqual(copy);
    });
});

describe('shouldShowNoDaysHint', () => {
    it('shows the hint when reports are enabled without days', () => {
        expect(shouldShowNoDaysHint(true, [])).toBe(true);
        expect(shouldShowNoDaysHint(true, undefined)).toBe(true);
    });

    it('hides it when a day is selected or reports are off', () => {
        expect(shouldShowNoDaysHint(true, ['1'])).toBe(false);
        expect(shouldShowNoDaysHint(false, [])).toBe(false);
    });
});
