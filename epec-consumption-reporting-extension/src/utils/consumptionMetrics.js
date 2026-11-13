const PROJECTION_DAYS = 28;

/** Readings arrive as numbers now, but older stored data may still hold "12,4" strings. */
export function toKwh(value) {
    const kwh = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(kwh) ? kwh : 0;
}

/** Totals for the popup and the email report; an empty period yields zeros instead of NaN. */
export function summarizeConsumption(readings) {
    const total = readings.reduce((sum, reading) => sum + toKwh(reading.consumo), 0);
    const average = readings.length > 0 ? total / readings.length : 0;

    return { total, average, projected: average * PROJECTION_DAYS };
}
