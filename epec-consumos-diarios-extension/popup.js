document.addEventListener('DOMContentLoaded', () => {
    chrome.action.setBadgeText({ text: '' });
    const resultsList = document.getElementById('results');
    const status = document.getElementById('status'); // clear the current badge icon if any was set.

    // Load existing data immediately
    chrome.storage.local.get(['consumptionData', 'lastUpdated'], (result) => {
        if (result.consumptionData) renderData(result.consumptionData);
        if (result.lastUpdated) status.innerText = `Ultima actualizacion: ${result.lastUpdated}`;
    });

    // Refresh Button Logic
    document.getElementById('refreshBtn').addEventListener('click', () => {
        status.innerText = "Fetching...";

        chrome.runtime.sendMessage({ action: "refresh" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Connection error:', chrome.runtime.lastError.message);
                status.innerText = "Error connecting to background worker";
                return
            }

            if (!response || !response.success) {
                console.error('The manual refresh errored out');
                status.innerText = "Update failed.";
                return;
            }

            location.reload();
        });
    });

    function renderData(data) {
        resultsList.innerHTML = "";
        let totalConsumption = 0;
        let cantidadConsumos = 0;
        data.forEach(entry => {
            const li = document.createElement('li');
            const consumo = entry.consumo.replace(',', '.').trim();
            li.textContent = (consumo !== '') ? `${entry.fechaHora}: ${Math.round(consumo)} kWh` : `${entry.fechaHora}: `;
            resultsList.appendChild(li);

            if (consumo !== '' && consumo !== null) {
                totalConsumption = parseFloat(totalConsumption) + parseFloat(consumo);
                cantidadConsumos++;
            }
        });

        const averageConsumption = (totalConsumption / cantidadConsumos).toFixed(2);
        const projectedConsumption = Math.round((averageConsumption * 28));
        
        document.getElementById('totalConsumption').innerHTML = `<b>${Math.round(totalConsumption)} </b> kWh`;
        document.getElementById('averageConsumption').innerHTML = `<b>${ Math.round(averageConsumption) } </b> kWh`;
        document.getElementById('projectedConsumption').innerHTML = `<b>${projectedConsumption} </b> kWh`;
    }
});