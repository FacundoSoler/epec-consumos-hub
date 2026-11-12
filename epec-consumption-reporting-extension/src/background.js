/// <reference types="chrome" />
import { localStorageKeys } from './storage/localStorageKeys.js';
import { store } from './storage/store.js';
import { getContratos, getContractCurrentPeriod, getEpecData } from './services/epecAPIservice.js';
import { getToDate } from './utils/utils.js';

const IS_PRODUCTION = false; // Switch to false when debugging locally

const API_BASE_URL = IS_PRODUCTION
    ? 'https://epec-consumos-hub-production.up.railway.app/api'
    : 'http://localhost:3000/api';

const messageHandlers = {
    refreshData: async () => ({ success: await fetchData() }),
    logOff: logOff,
    save_notifications: (request) => saveNotificationPreferences(request.payload),
    LOGIN_EPEC_SESSION: (request) => loginEpecSession(request.payload)
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Popup messages carry "action", content-script messages carry "type".
    const handler = messageHandlers[request.action ?? request.type];
    if (!handler) return false;

    handler(request)
        .then(sendResponse)
        .catch((error) => {
            console.error(`Error handling "${request.action ?? request.type}":`, error);
            sendResponse({ success: false, error: error.message });
        });

    // Keeps the channel open until the async handler calls sendResponse.
    return true;
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
    console.log('EPEC identity profile successfully synchronized.');

    return { success: await fetchData() };
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

async function fetchData() {
    try {
        const contractId = await store.getContractId();
        const bearerToken = await store.getBearerToken();
        const currentContractPeriod = await getContractCurrentPeriod(bearerToken, contractId);
        const data = await getEpecData(contractId, bearerToken, currentContractPeriod.desde, getToDate());

        if (data.length === 0) {
            console.error('No consumption data found to calculate.');
            return false;
        }

        await flagNewReadings(data);
        await chrome.storage.local.set({
            [localStorageKeys.CONSUMPTION_DATA]: data,
            [localStorageKeys.LAST_UPDATED]: new Date().toLocaleString()
        });

        return true;
    } catch (err) {
        console.error(new Date().toLocaleString(), 'Fetch failed:', err);
        return false;
    }
}

async function flagNewReadings(freshData) {
    const { [localStorageKeys.CONSUMPTION_DATA]: storedData } = await chrome.storage.local.get([localStorageKeys.CONSUMPTION_DATA]);
    if (!Array.isArray(storedData) || storedData.length === 0) return;

    const latestFresh = freshData.at(-1);
    const latestStored = storedData.at(-1);
    const hasNewData = latestFresh.fechaHora !== latestStored.fechaHora || latestFresh.consumo !== latestStored.consumo;

    if (hasNewData) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    }
}
