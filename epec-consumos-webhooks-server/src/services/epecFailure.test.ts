import { describe, expect, it } from 'vitest';
import { classifyEpecFailure } from './epecFailure.js';

describe('classifyEpecFailure', () => {
    it.each([
        [401, 'session-expired'],
        [403, 'session-expired'],
        [500, 'epec-unavailable'],
        [503, 'epec-unavailable'],
        [undefined, 'epec-unavailable'],
        [400, 'request-error'],
        [404, 'request-error'],
        [429, 'request-error']
    ] as const)('classifies status %s as %s', (status, kind) => {
        expect(classifyEpecFailure(status)).toBe(kind);
    });
});
