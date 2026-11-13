import { localStorageKeys } from '../storage/localStorageKeys.js';
import { EpecApiError } from './epecAPIservice.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('session');

/**
 * EPEC issues no refresh token, so a rejected token can only be fixed by the user logging in
 * again on epec.com.ar. The flag lets the popup say so and pauses emails until then.
 * @param {unknown} error
 * @param {string} rejectedToken the token the failed request used
 * @returns {Promise<boolean>} whether the session was marked expired
 */
export async function markSessionExpiredIfRejected(error, rejectedToken) {
    if (!(error instanceof EpecApiError) || error.kind !== 'session-expired') return false;

    // A login can land while the failing request is in flight; its fresh token must not be flagged.
    const stored = await chrome.storage.local.get([localStorageKeys.EPEC_USER]);
    if (stored[localStorageKeys.EPEC_USER]?.token !== rejectedToken) return false;

    await chrome.storage.local.set({ [localStorageKeys.SESSION_EXPIRED]: true });
    showSessionExpiredBadge();
    log.warn('EPEC session expired; waiting for a new login', { status: error.status });
    return true;
}

export function showSessionExpiredBadge() {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F0AD4E' });
}

/** Only touches the badge when the flag was set, so a "new readings" badge is left alone. */
export async function clearSessionExpired() {
    const stored = await chrome.storage.local.get([localStorageKeys.SESSION_EXPIRED]);
    if (stored[localStorageKeys.SESSION_EXPIRED] !== true) return;

    await chrome.storage.local.set({ [localStorageKeys.SESSION_EXPIRED]: false });
    chrome.action.setBadgeText({ text: '' });
}
