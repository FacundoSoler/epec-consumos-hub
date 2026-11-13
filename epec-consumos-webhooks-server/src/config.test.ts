import { describe, expect, it } from 'vitest';
import { getPort } from './config.js';

describe('getPort', () => {
    it('uses PORT from the environment (Railway)', () => {
        expect(getPort({ PORT: '8080' })).toBe(8080);
    });

    it('falls back to 3000 when PORT is missing or empty', () => {
        expect(getPort({})).toBe(3000);
        expect(getPort({ PORT: '' })).toBe(3000);
    });

    it.each(['abc', '0', '-1', '70000', '30.5'])('falls back to 3000 for invalid PORT "%s"', (value) => {
        expect(getPort({ PORT: value })).toBe(3000);
    });
});
