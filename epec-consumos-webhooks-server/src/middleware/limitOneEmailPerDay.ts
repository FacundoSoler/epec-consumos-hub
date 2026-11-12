import { NextFunction, Request, Response } from 'express';
import { DailyRateLimiter } from '../services/dailyRateLimiter.js';
import { EpecUser } from '../models/epecUser.js';

const limiter = new DailyRateLimiter();

/** Must run after requireEpecToken, which provides res.locals.epecUser. */
export const limitOneEmailPerDay = (emailKind: string) => (req: Request, res: Response, next: NextFunction) => {
    const epecUser = res.locals.epecUser as EpecUser;
    const key = `${emailKind}:${epecUser.documento}`;

    if (!limiter.tryReserve(key)) {
        return res.status(429).json({ error: `A ${emailKind} email was already sent today.` });
    }

    // A failed send should not use up the user's daily allowance.
    res.on('finish', () => {
        if (res.statusCode >= 400) limiter.release(key);
    });

    return next();
};
