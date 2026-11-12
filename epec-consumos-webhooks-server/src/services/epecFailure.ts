export type EpecErrorKind = 'session-expired' | 'epec-unavailable' | 'request-error';

/** Single source of truth for how an EPEC failure is interpreted; a missing status means the network call failed. */
export function classifyEpecFailure(status?: number): EpecErrorKind {
    if (status === 401 || status === 403) return 'session-expired';
    if (status === undefined || status >= 500) return 'epec-unavailable';
    return 'request-error';
}
