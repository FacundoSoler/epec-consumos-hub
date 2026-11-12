import { localStorageKeys } from "./localStorageKeys.js";

export const store = {
    async getBearerToken() {
        const data = await chrome.storage.local.get([localStorageKeys.EPEC_USER]);
        if (!data.epecUser) throw new Error('No User data found.');

        return data.epecUser.token;
    },
    getEpecUser() {
        return chrome.storage.local.get([localStorageKeys.EPEC_USER])
            .then((data) => {
                if (!data.epecUser) throw new Error('No User data found.');
                return data.epecUser;
            });
    },
    async getContractId() {
        const data = await chrome.storage.local.get([localStorageKeys.EPEC_USER]);
        if (!data.epecUser) throw new Error('EPEC User not found.');

        if (data.epecUser.contratos && data.epecUser.contratos.length > 0) {
            return data.epecUser.contratos[0].id;
        }

        throw new Error('Error retrieving contractId.');
    }
}