// --- CONFIGURATION ---
const FIXED_START_DATE = "050620260000"; // Fixed: 05/06/2026 00:00
const TEST_TWILIO_MESSAGING = false;
const CREATE_ALARMS_FETCH_DATA = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "refresh") {
        console.log(`EPEC Refresh action received from extension's Popup ! ${new Date().toLocaleString()}`);
        fetchData().then((isSuccess) => {
            sendResponse({ success: isSuccess });
        });
        return true; // Keeps the message channel open for the async fetch
    }
});

const getToDate = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};

async function fetchData() {
    const now = new Date();

    try {
        const hasta = getToDate();
        const url = `http://localhost:3000/api/getEpecConsumptionData?desde=${FIXED_START_DATE}&hasta=${hasta}`;

        const response = await fetch(url);

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