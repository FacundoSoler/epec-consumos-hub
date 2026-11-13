/**
 * Allows one action per key per calendar day (Córdoba time), held in memory.
 *
 * Fine for a single server instance: entries from previous days are pruned on
 * the first call of a new day, so memory is bounded by "keys seen today".
 * State is lost on restart and is not shared between replicas; see
 * ARCHITECTURE.md (Rate limiting) for when to move this to Redis.
 */
export class DailyRateLimiter {
    private readonly reservedKeys = new Set<string>();
    private currentDay: string;

    constructor(private readonly getToday: () => string = getCordobaDay) {
        this.currentDay = this.getToday();
    }

    /** Synchronous on purpose: no await between check and mark, so concurrent requests cannot both pass. */
    tryReserve(key: string): boolean {
        this.resetIfNewDay();
        if (this.reservedKeys.has(key)) return false;

        this.reservedKeys.add(key);
        return true;
    }

    release(key: string) {
        this.reservedKeys.delete(key);
    }

    get size() {
        return this.reservedKeys.size;
    }

    private resetIfNewDay() {
        const today = this.getToday();
        if (today === this.currentDay) return;

        this.reservedKeys.clear();
        this.currentDay = today;
    }
}

function getCordobaDay() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date());
}
