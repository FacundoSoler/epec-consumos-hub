/// <reference types="chrome" />
import { localStorageKeys } from './storage/localStorageKeys.js';
import { store } from './storage/store.js';
import { getContratos, getContractCurrentPeriod, getEpecData } from './services/epecAPIservice.js';
import { getToDate } from './utils/utils.js';
import { sendDailyReportIfDue } from './services/dailyReportService.js';
import { sendThresholdAlertIfDue } from './services/alertService.js';
import { createLogger } from './utils/logger.js';
import { createEmailOutcome } from './services/emailApi.js';
import { clearSessionExpired, markSessionExpiredIfRejected } from './services/sessionService.js';

const log = createLogger('background');
const emailLog = createLogger('email');

// Injected at build time (build/build.js) and by vitest.config.js.
const API_BASE_URL = __API_BASE_URL__;

const messageHandlers = {
    refreshData: fetchData,
    logOff: logOff,
    save_notifications: (request) => saveNotificationPreferences(request.payload),
    selectContract: (request) => selectContract(request.payload),
    LOGIN_EPEC_SESSION: (request) => loginEpecSession(request.payload)
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Popup messages carry "action", content-script messages carry "type".
    const handler = messageHandlers[request.action ?? request.type];
    if (!handler) return false;

    handler(request)
        .then(sendResponse)
        .catch((error) => {
            log.error('Message handler failed', { handler: request.action ?? request.type, ...describeError(error) });
            sendResponse({ success: false, error: error.message });
        });

    // Keeps the channel open until the async handler calls sendResponse.
    return true;
});

// Opening Chrome is the on-demand trigger for the daily report.
chrome.runtime.onStartup.addListener(() => {
    fetchData();
});

async function loginEpecSession(rawSession) {
    const normalizedSession = {
        documento: rawSession.documento,
        nombre: rawSession.nombre || '',
        apellido: rawSession.apellido || '',
        email: rawSession.email || '',
        token: rawSession.token || '',
        contratos: null
    };

    const contracts = await getContratos(normalizedSession.token);
    if (Array.isArray(contracts) && contracts.length > 0) {
        normalizedSession.contratos = contracts;
    }

    // Awaited so fetchData() below reads the freshly stored session.
    await chrome.storage.local.set({ [localStorageKeys.EPEC_USER]: normalizedSession });
    await clearSessionExpired();
    console.log('EPEC identity profile successfully synchronized.');

    return fetchData();
}

async function logOff() {
    await store.getEpecUser();
    await chrome.storage.local.clear();
    return { success: true };
}

async function saveNotificationPreferences(preferences) {
    const epecUser = await store.getEpecUser();
    if (!epecUser.email) throw new Error('No EPEC user context found in local storage.');

    await chrome.storage.local.set({ [localStorageKeys.NOTIFICATION_PREFERENCES]: preferences });
    return { success: true };
}

// The selection is saved only once the new contract's data loads, so a failed switch leaves
// the previous contract, its readings and the emails that follow it untouched.
async function selectContract(requestedContractId) {
    const epecUser = await store.getEpecUser();
    const contract = epecUser.contratos?.find((candidate) => String(candidate.id) === String(requestedContractId));
    if (!contract) throw new Error('The selected contract does not belong to the EPEC user.');

    const data = await loadContractReadings(contract.id, epecUser.token)
        .catch(async (error) => {
            await markSessionExpiredIfRejected(error, epecUser.token);
            throw error;
        });
    if (data.length === 0) throw new Error('No consumption data found for the selected contract.');

    await clearSessionExpired();
    await chrome.storage.local.set({
        [localStorageKeys.SELECTED_CONTRACT_ID]: contract.id,
        [localStorageKeys.CONSUMPTION_DATA]: data,
        [localStorageKeys.LAST_UPDATED]: new Date().toLocaleString()
    });
    // A "new readings" badge described the previous contract.
    chrome.action.setBadgeText({ text: '' });
    const emailStatus = await sendEmailsIfDue();

    return { success: true, emailStatus };
}

/** @returns {Promise<{ success: boolean, emailStatus: EmailStatus | null }>} emailStatus is null when no email was attempted */
async function fetchData() {
    let bearerToken;
    try {
        const contractId = await store.getContractId();
        bearerToken = await store.getBearerToken();
        const data = await loadContractReadings(contractId, bearerToken);

        if (data.length === 0) {
            log.warn('No consumption data found to calculate.');
            return { success: false, emailStatus: null };
        }

        await clearSessionExpired();
        await flagNewReadings(data);
        await chrome.storage.local.set({
            [localStorageKeys.CONSUMPTION_DATA]: data,
            [localStorageKeys.LAST_UPDATED]: new Date().toLocaleString()
        });
        const emailStatus = await sendEmailsIfDue();

        return { success: true, emailStatus };
    } catch (err) {
        log.error('Fetch failed', describeError(err));
        await markSessionExpiredIfRejected(err, bearerToken);
        return { success: false, emailStatus: null };
    }
}

async function loadContractReadings(contractId, bearerToken) {
    const currentContractPeriod = await getContractCurrentPeriod(bearerToken, contractId);
    return getEpecData(contractId, bearerToken, currentContractPeriod.desde, getToDate());
}

/**
 * @typedef {import('./services/emailApi.js').EmailOutcome} EmailOutcome
 * @typedef {{ report: EmailOutcome, alert: EmailOutcome }} EmailStatus
 */

/**
 * Stored so the popup can tell the user what happened to the emails, which otherwise
 * only the service-worker console would show.
 * @returns {Promise<EmailStatus>}
 */
async function sendEmailsIfDue() {
    const report = await runEmailSender('report', sendDailyReportIfDue);
    const alert = await runEmailSender('alert', sendThresholdAlertIfDue);
    const emailStatus = { report, alert };

    await chrome.storage.local.set({ [localStorageKeys.LAST_EMAIL_STATUS]: emailStatus });
    return emailStatus;
}

// Expected failures already come back as outcomes; this turns anything else (e.g. storage errors)
// into one too, so one sender failing never stops the other or the data refresh.
async function runEmailSender(kind, sender) {
    const outcome = await sender(API_BASE_URL)
        .catch((error) => createEmailOutcome(kind, 'failed', 'unexpected-error', { details: { error: error?.message } }));
    logEmailOutcome(outcome);
    return outcome;
}

// Only kind, result, reason and status: the outcome's masked recipient stays out of logs too.
function logEmailOutcome({ kind, result, reason, status }) {
    const fields = { kind, result, reason, status };
    if (result === 'failed') emailLog.error('Email not sent', fields);
    else emailLog.info('Email outcome', fields);
}

// Readings are sorted newest first (see getEpecData), so index 0 is the latest day.
async function flagNewReadings(freshData) {
    const { [localStorageKeys.CONSUMPTION_DATA]: storedData } = await chrome.storage.local.get([localStorageKeys.CONSUMPTION_DATA]);
    if (!Array.isArray(storedData) || storedData.length === 0) return;

    const latestFresh = freshData[0];
    const latestStored = storedData[0];
    const hasNewData = latestFresh.fechaHora !== latestStored.fechaHora || latestFresh.consumo !== latestStored.consumo;

    if (hasNewData) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    }
}

// EPEC failures were already logged by epecFetch; this adds which flow failed.
// Logging any error's message is safe: EPEC messages carry only the query-free path, and our
// own and our server's messages never echo emails or tokens.
function describeError(error) {
    return { error: error?.message, kind: error?.kind, status: error?.status };
}
