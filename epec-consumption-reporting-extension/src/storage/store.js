import { localStorageKeys } from './localStorageKeys.js';

/**
 * The user's chosen contract, or the first one when nothing was chosen or the choice is no
 * longer among the user's contracts (e.g. after logging in with another account).
 * @param {{ id: string | number }[] | null | undefined} contracts
 * @param {string | number | undefined} selectedId
 */
export function resolveSelectedContract(contracts, selectedId) {
    if (!Array.isArray(contracts)) return undefined;

    return contracts.find((contract) => selectedId != null && String(contract.id) === String(selectedId)) ?? contracts[0];
}

export const store = {
    async getEpecUser() {
        const data = await chrome.storage.local.get([localStorageKeys.EPEC_USER]);
        const epecUser = data[localStorageKeys.EPEC_USER];
        if (!epecUser) throw new Error('No User data found.');

        return epecUser;
    },
    async getBearerToken() {
        const epecUser = await this.getEpecUser();
        return epecUser.token;
    },
    async getContractId() {
        const data = await chrome.storage.local.get([localStorageKeys.EPEC_USER, localStorageKeys.SELECTED_CONTRACT_ID]);
        const epecUser = data[localStorageKeys.EPEC_USER];
        if (!epecUser) throw new Error('No User data found.');

        // Data, the update badge, reports and alerts all follow this one contract: the server
        // allows one report and one alert per user per day, so covering every contract would
        // need a multi-contract email rather than one email per contract.
        const contractId = resolveSelectedContract(epecUser.contratos, data[localStorageKeys.SELECTED_CONTRACT_ID])?.id;
        if (!contractId) throw new Error('Error retrieving contractId.');

        return contractId;
    },
    async isSessionExpired() {
        const data = await chrome.storage.local.get([localStorageKeys.SESSION_EXPIRED]);
        return data[localStorageKeys.SESSION_EXPIRED] === true;
    }
};
