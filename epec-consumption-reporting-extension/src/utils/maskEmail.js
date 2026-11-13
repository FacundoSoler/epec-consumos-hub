const VISIBLE_LOCAL_CHARS = 2;

/**
 * "fa*****@hotmail.com": enough for users to recognise their own address in the popup while a
 * screenshot or log line never exposes it. Short local parts keep at least one character hidden.
 * @param {unknown} email
 * @returns {string | null} null when there is no usable address
 */
export function maskEmail(email) {
    if (typeof email !== 'string') return null;

    const trimmed = email.trim();
    const atIndex = trimmed.lastIndexOf('@');
    const localPart = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);
    if (atIndex < 1 || domain === '') return null;

    const visibleChars = Math.min(VISIBLE_LOCAL_CHARS, localPart.length - 1);
    return `${localPart.slice(0, visibleChars)}${'*'.repeat(localPart.length - visibleChars)}@${domain}`;
}
