/// <reference types="chrome" />
import { localStorageKeys } from './storage/localStorageKeys.js';
import { store } from './storage/store.js';
import { getContratos, getContractCurrentPeriod } from './services/epecAPIservice.js'
import { getToDate } from '../src/utils/utils.js'

const IS_PRODUCTION = false; // Switch to false when debugging locally

const API_BASE_URL = IS_PRODUCTION
    ? 'https://epec-consumos-hub-production.up.railway.app/api'
    : 'http://localhost:3000/api';


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "refreshData") {
        console.log(`EPEC Refresh action received from extension's Popup ! ${new Date().toLocaleString()}`);
        fetchData()
            .then((isSuccess) => {
                sendResponse({ success: isSuccess });
            }).catch((error) => {
                console.error("Error during refreshData :", error);
                sendResponse({ success: false });
            });

        return true;
    }

    if (request.action === "logOff") {
        const user = store.getEpecUser()
            .then((user) => {
                if (!user) throw new Error("No user session found to log off.");
                return true;
            })
            .then((isSuccess) => {
                chrome.storage.local.clear(() => {
                    sendResponse({ success: isSuccess });
                });
            }).catch((error) => {
                console.error("Error during logoff:", error);
                sendResponse({ success: false });
            });

        return true;
    }

    if (request.action === 'save_notifications') {
        handleSaveNotifications(request.payload).then(sendResponse)
            .then((response) => {
                sendResponse(response);
            }).catch((error) => {
                console.error("Error during save_notifications:", error);
                sendResponse({ success: false });
            });

        return true;
    }

    return false;
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'LOGIN_EPEC_SESSION') {
        (async () => {
            const raw = message.payload;
            const normalizedSession = {
                documento: raw.documento,
                nombre: raw.nombre || '',
                apellido: raw.apellido || '',
                email: raw.email || '',
                token: raw.token || '',
                contratos: null
            };

            const contracts = await getContratos(normalizedSession.token);
            if (contracts && contracts.data.length > 0) {
                normalizedSession.contratos = contracts.data;
            }

            chrome.storage.local.set({ [localStorageKeys.EPEC_USER]: normalizedSession }, () => {
                console.log('EPEC identity profile successfully synchronized.');
            });

            await fetchData();
        })();
    }
});

async function handleSaveNotifications(preferencesPayload) {
    try {
        const data = await chrome.storage.local.get([
            localStorageKeys.EPEC_USER
        ]);

        const epecUser = data[localStorageKeys.EPEC_USER] || {};
        const emailReportsEnabled = preferencesPayload?.email_reports?.enabled === true;
        const emailAlertsEnabled = preferencesPayload?.email_alerts?.enabled === true;

        if (!epecUser.email) {
            throw new Error("No EPEC user context found in local storage.");
        }

        if (!emailReportsEnabled && !emailAlertsEnabled) {
            await chrome.storage.local.set({
                [localStorageKeys.NOTIFICATION_PREFERENCES]: preferencesPayload
            });
            return { success: true };
        }

        await chrome.storage.local.set({
            [localStorageKeys.NOTIFICATION_PREFERENCES]: preferencesPayload
        });

        return { success: true };

    } catch (error) {
        console.error('Failed to save notifications via background script:', error);
        return { success: false, error: error.message };
    }
}

async function getContractCurrentPeriod() {
    const contractId = await store.getContractId();
    const bearerToken = await store.getBearerToken();

    const url = `${API_BASE_URL}/epec/getContractCurrentPeriod?contractId=${contractId}`;
    const response = await fetch(url, {
        headers: {
            bearertoken: bearerToken
        }
    });

    if (!response.ok) throw new Error(`Error fetching Contract Current Period. Error details: ${response.status} ${response.statusText}`);

    const result = await response.json();
    if (!result || !result.data || result.data.length <= 0) throw new Error('Error fetching Contract Current Period.');

    const x = result.data;
    const sanitizedResults = {
        tipoMedicion: x.tipoMedicion,
        numeroMedidor: x.numeroMedidor,
        desde: x.desde,
        hasta: x.hasta,
        nombreMedidor: x.nombreMedidor,
        medicionInteligente: x.medicionInteligente,
        msjPeriodoMensual: x.msjPeriodoMensual,
        msjPeriodoDiario: x.msjPeriodoDiario
    };

    return sanitizedResults;
}

async function fetchData() {
    const now = new Date();

    try {
        const hasta = getToDate();
        const contractId = await store.getContractId();
        const bearerToken = await store.getBearerToken();
        const currentContractPeriod = await getContractCurrentPeriod();

        const url = `${API_BASE_URL}/epec/getEpecConsumptionData?desde=${currentContractPeriod.desde}&hasta=${hasta}&contractId=${contractId}`;
        const response = await fetch(url, {
            headers: {
                bearertoken: bearerToken
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log("EPEC Data Results " + new Date().toLocaleString(), data);

        if (!data || data.length === 0) {
            console.error("No consumption data found to calculate.");
            return false;
        }

        const result = await chrome.storage.local.get(['consumptionData']);
        const localStorageData = result.consumptionData;

        const localDataExists = localStorageData && Array.isArray(localStorageData) && localStorageData.length > 0;
        if (localDataExists) {
            const lastServerRow = data.at(-1);
            const lastLocalStorageRow = localStorageData.at(-1);

            const hasNewData = (lastServerRow.fechaHora !== lastLocalStorageRow.fechaHora) ||
                (lastServerRow.consumo !== lastLocalStorageRow.consumo);
            if (hasNewData) {
                chrome.action.setBadgeText({ text: '!' });
                chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
            }
        }

        await chrome.storage.local.set({
            consumptionData: data,
            lastUpdated: now.toLocaleString()
        });

        return true;
    } catch (err) {
        console.error(new Date().toLocaleString(), "Fetch failed:", err);
        return false;
    }
}

async function logOff(token) {
    try {
        chrome.storage.local.clear();

        return true;
    } catch (error) {
        console.error(new Date().toLocaleString(), "Log Off failed:", error);
        return false;
    }
}