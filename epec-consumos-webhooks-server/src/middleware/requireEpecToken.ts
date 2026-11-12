import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getContratos } from '../services/epecAPIservice.js';
import { EpecUser } from '../models/epecUser.js';
import { createLogger, hashUser } from '../logger.js';

const log = createLogger('epec');

export type EpecErrorKind = 'session-expired' | 'epec-unavailable' | 'request-error';

interface EpecJwtPayload {
    email?: string;
    documento?: string | number;
}

/**
 * Lets a request through only if EPEC itself accepts its Bearer token.
 * We cannot verify EPEC's JWT signature ourselves, so a successful EPEC call is
 * the proof of authenticity; only after that is the payload safe to decode.
 */
export const requireEpecToken = async (req: Request, res: Response, next: NextFunction) => {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer <EPEC token> header.' });

    try {
        const epecResponse = await getContratos(token);
        if (!epecResponse.ok) {
            logEpecFailure(token, epecResponse.status);
            return res.status(401).json({ error: 'EPEC rejected the token. Log in to epec.com.ar again.' });
        }
    } catch (error: any) {
        logEpecFailure(token, undefined, error?.message);
        return res.status(503).json({ error: 'EPEC is unreachable right now. Try again later.' });
    }

    const epecUser = decodeEpecUser(token);
    if (!epecUser) return res.status(400).json({ error: 'The EPEC token has no email or documento.' });

    res.locals.epecUser = epecUser;
    return next();
};

/** Single source of truth for how an EPEC failure is interpreted; a missing status means the network call failed. */
export function classifyEpecFailure(status?: number): EpecErrorKind {
    if (status === 401 || status === 403) return 'session-expired';
    if (status === undefined || status >= 500) return 'epec-unavailable';
    return 'request-error';
}

function logEpecFailure(token: string, status?: number, cause?: string) {
    log.error('EPEC token validation failed', {
        kind: classifyEpecFailure(status),
        status,
        cause,
        user: hashUserFromUnverifiedToken(token)
    });
}

// The token is not yet trusted here, but its documento is only hashed to correlate log lines.
function hashUserFromUnverifiedToken(token: string): string | undefined {
    const payload = jwt.decode(token) as EpecJwtPayload | null;
    return payload?.documento === undefined ? undefined : hashUser(payload.documento);
}

function getBearerToken(req: Request) {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    return scheme === 'Bearer' && token ? token : null;
}

function decodeEpecUser(token: string): EpecUser | null {
    const payload = jwt.decode(token) as EpecJwtPayload | null;
    if (!payload?.email || payload.documento === undefined) return null;

    return { email: payload.email.toLowerCase(), documento: String(payload.documento) };
}
