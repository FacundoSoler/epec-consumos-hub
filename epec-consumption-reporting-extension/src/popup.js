import { localStorageKeys } from './storage/localStorageKeys.js';

document.addEventListener('DOMContentLoaded', () => {
    const unauthView = document.getElementById('unauth-view');
    const authView = document.getElementById('auth-view');
    const userdisplay = document.getElementById('user-display');
    const routeBtn = document.getElementById('route-login');
    const routeLogOff = document.getElementById('route-logoff');

    const toggleEmail = document.getElementById('toggle-email');
    const panelEmail = document.getElementById('panel-email');
    const toggleEmailAlerts = document.getElementById('toggle-emailAlerts');
    const panelAlerts = document.getElementById('panel-alerts');

    const blockInvalidChars = (e) => {
        if (['-', '+', 'e', 'E'].includes(e.key)) {
            e.preventDefault();
        }
    };

    const avgInput = document.getElementById('alert-avg');
    if (avgInput) avgInput.addEventListener('keydown', blockInvalidChars);

    const daysInput = document.getElementById('alert-days');
    if (daysInput) {
        daysInput.addEventListener('keydown', blockInvalidChars);
        daysInput.addEventListener('keydown', (e) => {
            if (e.key === '.' || e.key === ',') {
                e.preventDefault();
            }
        });
    }

    const handleToggleChange = (toggleEl, panelEl) => {
        if (toggleEl.checked) {
            panelEl.classList.remove('hidden');
        } else {
            panelEl.classList.add('hidden');
        }
    };

    toggleEmail.addEventListener('change', () => handleToggleChange(toggleEmail, panelEmail));
    toggleEmailAlerts.addEventListener('change', () => handleToggleChange(toggleEmailAlerts, panelAlerts));

    setEmailReportsDaysOfTheWeek();

    routeBtn.addEventListener('click', () => {
        const destination = "https://www.epec.com.ar/usuario/ingreso?returnTo=%2Foficina-virtual%2Fmis-datos";
        chrome.tabs.create({ url: destination });
    });

    routeLogOff.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "logOff" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Log Off error:', chrome.runtime.lastError.message);
                status.innerHTML = "Error logging off.";
                return;
            }

            if (!response || !response.success) {
                console.error('Log off errored out.');
                status.innerText = "El deslogueo ha fallado. Intente nuevamente en instantes."
                return;
            }

            enableLoggedInPanel(false);

            location.reload();
        })
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        status.innerText = "Fetching...";

        chrome.runtime.sendMessage({ action: "refreshData" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Connection error:', chrome.runtime.lastError.message);
                status.innerText = "Error connecting to background worker";
                return;
            }

            if (!response || !response.success) {
                console.error('The manual refresh errored out');
                status.innerText = "La actualizacion ha fallado. Intente nuevamente en unos instantes.";
                return;
            }

            location.reload();
        });
    });

    // 1. Tab Switching Logic
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active')); // unselect all Tabs
            tabPanes.forEach(p => p.classList.remove('active')); // unselect all tab Panels

            btn.classList.add('active'); // Make the selected tab Active
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    const saveNotificationsBtn = document.getElementById('save-notifications');
    saveNotificationsBtn.addEventListener('click', () => {
        const selectedDays = Array.from(document.querySelectorAll('.day-cb:checked')).map(cb => cb.value);
        const avgPerDay = parseFloat(document.getElementById('alert-avg').value) || 0;
        const daysToEval = parseInt(document.getElementById('alert-days').value, 10) || 0;

        const preferences = {
            email_reports: {
                enabled: toggleEmail.checked,
                days: selectedDays
            },
            email_alerts: {
                enabled: toggleEmailAlerts.checked,
                threshold: {
                    kwh_limit_per_day: avgPerDay,
                    rolling_days_window: daysToEval
                }
            }
        };

        const saveStatus = document.getElementById('save-status');

        chrome.runtime.sendMessage({ action: 'save_notifications', payload: preferences }, (response) => {
            if (response && response.success) {
                saveStatus.textContent = '¡Preferencias guardadas exitosamente!';
                saveStatus.style.color = '#00875a';
            } else {
                saveStatus.textContent = `${response?.error}. Error al guardar. Intente nuevamente.`;
                saveStatus.style.color = 'red';
                console.error('Save failed:', response?.error);
            }
            setTimeout(() => { saveStatus.textContent = ''; }, 5000);
        });
    });

    chrome.action.setBadgeText({ text: '' });
    const resultsList = document.getElementById('results');
    const status = document.getElementById('status'); // clear the current badge icon if any was set.

    chrome.storage.local.get([localStorageKeys.EPEC_USER], (result) => {
        if (result.epecUser && result.epecUser.nombre) {
            enableLoggedInPanel(true);

            const contractId = result.epecUser.contratos[0]?.id ?? '';
            userdisplay.textContent = `${result.epecUser.nombre} ${result.epecUser.apellido} - Contrato: ${contractId}`;
        }
    });

    chrome.storage.local.get([localStorageKeys.CONSUMPTION_DATA, localStorageKeys.LAST_UPDATED], (result) => {
        if (result.consumptionData) renderLocalData(result.consumptionData);
        if (result.lastUpdated) status.innerText = `Ultima actualizacion: ${result.lastUpdated}`;
    });

    chrome.storage.local.get([localStorageKeys.NOTIFICATION_PREFERENCES], (data) => {
        if (data.notificationPrefs) {
            const prefs = data.notificationPrefs;

            if (prefs.email_reports) {
                toggleEmail.checked = prefs.email_reports.enabled === true;
                handleToggleChange(toggleEmail, panelEmail); // Trigger UI update

                if (prefs.email_reports.days) {
                    document.querySelectorAll('.day-cb').forEach(cb => {
                        cb.checked = prefs.email_reports.days.includes(cb.value);
                    });
                }
            }

            if (prefs.email_alerts) {
                toggleEmailAlerts.checked = prefs.email_alerts.enabled === true;
                handleToggleChange(toggleEmailAlerts, panelAlerts); // Trigger UI update

                if (prefs.email_alerts.threshold) {
                    document.getElementById('alert-avg').value = prefs.email_alerts.threshold.kwh_limit_per_day || '';
                    document.getElementById('alert-days').value = prefs.email_alerts.threshold.rolling_days_window || '';
                }
            }
        }
    });

    function renderLocalData(data) {
        resultsList.innerHTML = "";

        const totalConsumption = data.reduce((accumulator, currentItem) => {
            return accumulator + parseFloat(currentItem.consumo);
        }, 0);
        const cantidadConsumos = data.length;

        data.forEach(entry => {
            const li = document.createElement('li');
            const consumo = entry.consumo.replace(',', '.').trim();
            li.textContent = (consumo !== '') ? `${entry.fechaHora}: ${Math.round(consumo)} kWh` : `${entry.fechaHora}: `;
            resultsList.appendChild(li);
        });

        const averageConsumption = (totalConsumption / cantidadConsumos).toFixed(2);
        const projectedConsumption = Math.round((averageConsumption * 28));

        document.getElementById('totalConsumption').innerHTML = `<b>${Math.round(totalConsumption)} </b> kWh`;
        document.getElementById('averageConsumption').innerHTML = `<b>${Math.round(averageConsumption)} </b> kWh`;
        document.getElementById('projectedConsumption').innerHTML = `<b>${projectedConsumption} </b> kWh`;
    }

    function setEmailReportsDaysOfTheWeek() {
        // add email report Days of the Week
        let daysOfTheWeekStrings = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
        let daysGrid = document.getElementsByClassName('days-grid')[0];

        daysOfTheWeekStrings.forEach((day, index) => {
            const dayOfTheWeekHTML = `<label><input type="checkbox" class="day-cb" value=${index}> ${day}</label>`;
            daysGrid.insertAdjacentHTML('beforeend', dayOfTheWeekHTML);
        });
    }

    function enableLoggedInPanel(loggedIn) {
        if (loggedIn) {
            authView.classList.remove('hidden');
            unauthView.classList.add('hidden');
            routeLogOff.classList.remove('hidden');
        } else {
            unauthView.classList.remove('hidden');
            authView.classList.add('hidden');
            routeLogOff.classList.add('hidden');
        }
    }
});