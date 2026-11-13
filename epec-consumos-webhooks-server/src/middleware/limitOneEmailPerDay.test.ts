import { describe, expect, it, vi } from 'vitest';
import { fakeRequest, fakeResponse } from '../testing/fakeExpress.js';
import { limitOneEmailPerDay } from './limitOneEmailPerDay.js';

let nextDocumento = 1000;
const uniqueUser = () => ({ email: 'a@b.c', documento: String(nextDocumento++) });

function attempt(emailKind: string, epecUser: { email: string; documento: string }) {
    const res = fakeResponse({ epecUser });
    const next = vi.fn();
    limitOneEmailPerDay(emailKind)(fakeRequest(), res, next);
    return { res, next };
}

function completeWith(res: ReturnType<typeof fakeResponse>, statusCode: number) {
    res.statusCode = statusCode;
    res.finish();
}

describe('limitOneEmailPerDay', () => {
    it('lets the first email of the day through', () => {
        const { res, next } = attempt('report', uniqueUser());

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('answers 429 for a second email of the same kind on the same day', () => {
        const user = uniqueUser();
        const first = attempt('report', user);
        completeWith(first.res, 200);

        const second = attempt('report', user);

        expect(second.next).not.toHaveBeenCalled();
        expect(second.res.statusCode).toBe(429);
        expect(second.res.body).toEqual({ error: 'A report email was already sent today.' });
    });

    it('blocks a concurrent duplicate while the first send is still in flight', () => {
        const user = uniqueUser();
        attempt('report', user);

        const concurrent = attempt('report', user);

        expect(concurrent.res.statusCode).toBe(429);
    });

    it('counts reports and alerts separately', () => {
        const user = uniqueUser();
        attempt('report', user);

        const alert = attempt('alert', user);

        expect(alert.next).toHaveBeenCalledOnce();
    });

    it('does not share allowances between users', () => {
        attempt('report', uniqueUser());

        expect(attempt('report', uniqueUser()).next).toHaveBeenCalledOnce();
    });

    it.each([400, 401, 502, 503])('releases the slot when the request ends with %i', (statusCode) => {
        const user = uniqueUser();
        const failed = attempt('report', user);
        completeWith(failed.res, statusCode);

        const retry = attempt('report', user);

        expect(retry.next).toHaveBeenCalledOnce();
    });

    it('keeps the slot after a successful send', () => {
        const user = uniqueUser();
        const sent = attempt('report', user);
        completeWith(sent.res, 200);

        expect(attempt('report', user).res.statusCode).toBe(429);
    });
});
