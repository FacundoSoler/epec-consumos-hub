import { localStorageKeys } from './localStorageKeys.js';

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
        const epecUser = await this.getEpecUser();
        const contractId = epecUser.contratos?.[0]?.id;
        if (!contractId) throw new Error('Error retrieving contractId.');

        return contractId;
    }
};
