export const KWH_LIMIT_OPTIONS = range(5, 50, 5);
export const ROLLING_DAYS_OPTIONS = range(1, 31, 1);
export const DEFAULT_KWH_LIMIT = 15;
export const DEFAULT_ROLLING_DAYS = 3;

// Stored values may predate the dropdowns (free number inputs), so they are shown as the closest choice.
export function snapToNearestOption(value, options, fallback) {
    const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
    if (typeof number !== 'number' || !Number.isFinite(number) || value === '') return fallback;

    return options.reduce((best, option) =>
        Math.abs(option - number) < Math.abs(best - number) ? option : best);
}

export function resolveAlertSelection(threshold) {
    return {
        kwhLimit: snapToNearestOption(threshold?.kwh_limit_per_day, KWH_LIMIT_OPTIONS, DEFAULT_KWH_LIMIT),
        rollingDays: snapToNearestOption(threshold?.rolling_days_window, ROLLING_DAYS_OPTIONS, DEFAULT_ROLLING_DAYS)
    };
}

function range(start, end, step) {
    const values = [];
    for (let value = start; value <= end; value += step) values.push(value);
    return values;
}

// Values follow Date#getDay (Sunday = "0") because the daily report compares against it; the UI lists Monday first.
export const WEEKDAY_OPTIONS = [
    { value: '1', label: 'L', name: 'Lunes' },
    { value: '2', label: 'M', name: 'Martes' },
    { value: '3', label: 'M', name: 'Miércoles' },
    { value: '4', label: 'J', name: 'Jueves' },
    { value: '5', label: 'V', name: 'Viernes' },
    { value: '6', label: 'S', name: 'Sábado' },
    { value: '0', label: 'D', name: 'Domingo' }
];

export const QUICK_DAY_SELECTIONS = [
    { id: 'all', label: 'Todos', days: ['1', '2', '3', '4', '5', '6', '0'] },
    { id: 'weekdays', label: 'Hábiles', days: ['1', '2', '3', '4', '5'] },
    { id: 'none', label: 'Ninguno', days: [] }
];

export function orderDaysMondayFirst(days) {
    const selected = new Set((days ?? []).map(String));
    return WEEKDAY_OPTIONS.map((day) => day.value).filter((value) => selected.has(value));
}

export function toggleDay(days, value) {
    const selected = new Set(days);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    return orderDaysMondayFirst([...selected]);
}

export function buildReportsSection({ reportsEnabled, reportDays }) {
    return { enabled: reportsEnabled === true, days: orderDaysMondayFirst(reportDays) };
}

export function buildAlertsSection({ alertsEnabled, kwhLimit, rollingDays }) {
    return {
        enabled: alertsEnabled === true,
        threshold: { kwh_limit_per_day: Number(kwhLimit), rolling_days_window: Number(rollingDays) }
    };
}

export function buildNotificationPreferences(controls) {
    return { email_reports: buildReportsSection(controls), email_alerts: buildAlertsSection(controls) };
}

// Only the section the user touched is rebuilt, so a stored value the controls cannot show
// (e.g. a 17.5 kWh threshold from before the dropdowns) survives edits to the other section.
export function mergeSectionIntoPreferences(storedPrefs, section, sectionValue) {
    return {
        email_reports: storedPrefs?.email_reports ?? buildReportsSection({ reportDays: [] }),
        email_alerts: storedPrefs?.email_alerts
            ?? buildAlertsSection({ kwhLimit: DEFAULT_KWH_LIMIT, rollingDays: DEFAULT_ROLLING_DAYS }),
        [section]: sectionValue
    };
}

export function shouldShowNoDaysHint(reportsEnabled, reportDays) {
    return reportsEnabled === true && orderDaysMondayFirst(reportDays).length === 0;
}
