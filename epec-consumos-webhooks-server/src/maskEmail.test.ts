import { describe, expect, it } from 'vitest';
import { maskEmail } from './maskEmail.js';

describe('maskEmail', () => {
    it('keeps the first two characters of the local part and the whole domain', () => {
        expect(maskEmail('facundo@hotmail.com')).toBe('fa*****@hotmail.com');
    });

    it('keeps at least one character of a short local part hidden', () => {
        expect(maskEmail('ab@x.com')).toBe('a*@x.com');
        expect(maskEmail('a@x.com')).toBe('*@x.com');
    });

    it.each([undefined, null, '', 'no-at-sign', '@example.com', 'ana@', 42])('returns null for %j', (email) => {
        expect(maskEmail(email)).toBeNull();
    });
});
