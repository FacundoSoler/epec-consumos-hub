import { localStorageKeys } from '../storage/localStorageKeys.js';
import { EpecApiError } from './epecAPIservice.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('session');

/**
 * EPEC issues no refresh token, so a rejected token can only be fixed by the user logging in
 * again on epec.com.ar. The flag lets the popup say so and pauses emails until then.
 * @returns {Promise<boolean>} whether the error was a rejected session
 */
export async function markSessionExpiredIfRejected(error) {
    if (!(error instanceof EpecApiError) || error.kind !== 'session-expired') return false;

    await chrome.storage.local.set({ [localStorageKeys.SESSION_EXPIRED]: true });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F0AD4E' });
    log.warn('EPEC session expired; waiting for a new login', { status: error.status });
    return true;
}

export async function clearSessionExpired() {
    await chrome.storage.local.set({ [localStorageKeys.SESSION_EXPIRED]: false });
}
