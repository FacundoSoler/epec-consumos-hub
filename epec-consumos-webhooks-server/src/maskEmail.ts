const MASK = '•••';
const VISIBLE_LOCAL_CHARS = 2;

/**
 * "fa•••@hotmail.com": enough to tell recipients apart in Railway logs without storing their address.
 * Mirrors the extension's maskEmail so the popup and the logs show the same form.
 * Short local parts keep at least one character hidden; unusable input yields null.
 */
export function maskEmail(email: unknown): string | null {
    if (typeof email !== 'string') return null;

    const trimmed = email.trim();
    const atIndex = trimmed.lastIndexOf('@');
    const localPart = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);
    if (atIndex < 1 || domain === '') return null;

    const visibleChars = Math.min(VISIBLE_LOCAL_CHARS, localPart.length - 1);
    return `${localPart.slice(0, visibleChars)}${MASK}@${domain}`;
}
