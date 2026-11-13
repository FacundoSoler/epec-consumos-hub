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
