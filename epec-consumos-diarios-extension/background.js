// --- CONFIGURATION ---
const FIXED_START_DATE = "050620260000"; // Fixed: 05/06/2026 00:00
const TEST_TWILIO_MESSAGING = false;
const CREATE_ALARMS_FETCH_DATA = false;

chrome.alarms.get("hourlyFetch", (alarm) => {
    if (!alarm) {
        if (CREATE_ALARMS_FETCH_DATA) {
            chrome.alarms.create("hourlyFetch", { periodInMinutes: 60 });
            console.log("Created hourlyFetch alarm for the first time.");
        }
    } else {
        console.log('hourlyFetch alarm already exists', alarm);
    }
});

chrome.alarms.get("heartbeat", (alarm) => {
    if (!alarm) {
        if (CREATE_ALARMS_FETCH_DATA) {
            chrome.alarms.create("heartbeat", { periodInMinutes: 2 });
            console.log("Created heartbeat alarm for the first time.");
        }
    } else {
        console.log('heartbeat alarm already exists', alarm);
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "hourlyFetch") {
        console.log(new Date().toLocaleString(), "Automatic hourly check triggered.");
        fetchData(false);
    }

    if (alarm.name === "heartbeat") {
        chrome.alarms.get("hourlyFetch", (fetchedAlarm) => {
            if (fetchedAlarm) {
                const remaining = Math.round((fetchedAlarm.scheduledTime - Date.now()) / 60000);
                console.log(
                    new Date().toLocaleString(),
                    `Heartbeat: The next hourly fetch will trigger in approximately ${remaining} minutes.`
                );
            } else {
                console.warn(new Date().toLocaleString(), "Warning: hourlyFetch alarm not found!");
            }
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "refresh") {
        console.log(`EPEC Refresh action received from extension's Popup ! ${new Date().toLocaleString()}`);
        fetchData(true).then((isSuccess) => {
            sendResponse({ success: isSuccess });
        });
        return true; // Keeps the message channel open for the async fetch
    }
});

async function fireTwilioMessages(sanitizedData) {
    try {
        let finalTotal = 0;
        sanitizedData.forEach(element => {
            finalTotal += parseFloat(element.consumo) || 0;
        });

        let finalAvg = finalTotal / sanitizedData.length;
        let finalProjected = Math.round(finalAvg * 28);
        finalTotal = Math.round(finalTotal);
        finalAvg = Math.round(finalAvg);

        const response = await fetch('http://localhost:3000/api/getEpecConsumptionData', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                detalleConsumos: sanitizedData,
                total: finalTotal,
                avg: finalAvg,
                projected: finalProjected
            })
        });

        if (!response.ok) {
            console.error("⚠️ Local server rejected the payload.");
        }
    } catch (error) {
        console.error("❌ Could not reach local server. Is 'npm run dev' running?", error);
    }
}

const getHasta = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};

async function fetchData(isPopupRefresh) {
    const now = new Date();

    try {
        if (!isPopupRefresh) {
            const stored = await chrome.storage.local.get(['lastUpdated']);

            const todayStr = now.toLocaleDateString();
            const lastFetchStr = stored.lastUpdated ? new Date(stored.lastUpdated).toLocaleDateString() : null;

            const isDataUpToDate = now.getHours() < 6 || todayStr === lastFetchStr; // date / time check: Is it too early OR have we already fetched today?
            if (isDataUpToDate) {
                console.log("Automated fetch skipped: Before 6 AM or already fetched today.");
                return false;
            }
        }

        const hasta = getHasta();
        const url = `http://localhost:3000/api/getEpecConsumptionData?desde=${FIXED_START_DATE}&hasta=${hasta}`;

        const response = await fetch(url);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log("EPEC Data Results " + new Date().toLocaleString(), data);

        if (!data || data.length === 0) {
            console.error("No consumption data found to calculate.");
            return false;
        }

        const sanitizedData = data
            .filter(item => item.consumo && item.consumo.toString().trim() !== '')
            .map(item => ({
                consumo: String(item.consumo).replace(/,/g, '.'),
                fechaHora: item.fechaHora,
                dateSorting: new Date(item.fechaHora).getTime()
            }));

        sanitizedData.sort((a, b) => a.dateSorting - b.dateSorting);

        const result = await chrome.storage.local.get(['consumptionData']);
        const localStorageData = result.consumptionData;

        const localDataExists = localStorageData && Array.isArray(localStorageData) && localStorageData.length > 0;
        if (localDataExists) {
            const lastServerRow = sanitizedData.at(-1);
            const lastLocalStorageRow = localStorageData.at(-1);

            const hasNewData = (lastServerRow.fechaHora !== lastLocalStorageRow.fechaHora) ||
                (lastServerRow.consumo !== lastLocalStorageRow.consumo);
            if (hasNewData) {
                chrome.action.setBadgeText({ text: '!' });
                chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
            }
        }

        await chrome.storage.local.set({
            consumptionData: sanitizedData,
            lastUpdated: now.toLocaleString()
        });

       // if (isPopupRefresh) return true;

        // Process Twilio communications for background triggers
        if (!TEST_TWILIO_MESSAGING) return true;
        await fireTwilioMessages(sanitizedData);

        return true;
    } catch (err) {
        console.error(new Date().toLocaleString(), "Fetch failed:", err);
        return false;
    }
}