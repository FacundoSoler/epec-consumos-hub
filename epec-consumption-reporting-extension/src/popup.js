import { localStorageKeys } from './storage/localStorageKeys.js';
import { summarizeConsumption, toKwh } from './utils/consumptionMetrics.js';
import { resolveSelectedContract, store } from './storage/store.js';
import { showSessionExpiredBadge } from './services/sessionService.js';
import { buildPopupStatusLines } from './utils/emailStatusText.js';
import {
    KWH_LIMIT_OPTIONS,
    QUICK_DAY_SELECTIONS,
    ROLLING_DAYS_OPTIONS,
    WEEKDAY_OPTIONS,
    buildAlertsSection,
    buildReportsSection,
    mergeSectionIntoPreferences,
    orderDaysMondayFirst,
    shouldShowNoDaysHint,
    resolveAlertSelection,
    toggleDay
} from './utils/notificationOptions.js';

const SAVE_CONFIRMATION_MS = 2000;
const EPEC_LOGIN_URL = 'https://www.epec.com.ar/usuario/ingreso?returnTo=%2Foficina-virtual%2Fmis-datos';

document.addEventListener('DOMContentLoaded', () => {
    const unauthView = document.getElementById('unauth-view');
    const authView = document.getElementById('auth-view');
    const userdisplay = document.getElementById('user-display');
    const routeBtn = document.getElementById('route-login');
    const routeLogOff = document.getElementById('route-logoff');
    const contractSelect = document.getElementById('contract-select');

    const toggleEmail = document.getElementById('toggle-email');
    const panelEmail = document.getElementById('panel-email');
    const toggleEmailAlerts = document.getElementById('toggle-emailAlerts');
    const panelAlerts = document.getElementById('panel-alerts');

    const avgSelect = document.getElementById('alert-avg');
    const daysSelect = document.getElementById('alert-days');
    fillNumberOptions(avgSelect, KWH_LIMIT_OPTIONS);
    fillNumberOptions(daysSelect, ROLLING_DAYS_OPTIONS);
    showAlertSelection(resolveAlertSelection(undefined));

    const handleToggleChange = (toggleEl, panelEl) => {
        if (toggleEl.checked) {
            panelEl.classList.remove('hidden');
        } else {
            panelEl.classList.add('hidden');
        }
    };

    const reportsSaveStatus = document.getElementById('save-status-reports');
    const alertsSaveStatus = document.getElementById('save-status-alerts');

    toggleEmail.addEventListener('change', () => {
        handleToggleChange(toggleEmail, panelEmail);
        refreshNoDaysHint();
        saveReportsSection();
    });
    toggleEmailAlerts.addEventListener('change', () => {
        handleToggleChange(toggleEmailAlerts, panelAlerts);
        saveAlertsSection();
    });
    avgSelect.addEventListener('change', saveAlertsSection);
    daysSelect.addEventListener('change', saveAlertsSection);

    let selectedDays = [];
    let storedPreferences;
    const dayPills = renderDayPills();
    const quickDayButtons = renderQuickDaySelections();
    // Until storage answers, a change would overwrite the stored preferences with the defaults on screen.
    setNotificationControlsEnabled(false);

    const openEpecLogin = () => chrome.tabs.create({ url: EPEC_LOGIN_URL });
    routeBtn.addEventListener('click', openEpecLogin);
    document.getElementById('route-relogin').addEventListener('click', openEpecLogin);

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

            if (!response || !response.success) console.error('The manual refresh errored out');

            // Success or failure, the worker stored the outcome; the reload renders it.
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

    chrome.action.setBadgeText({ text: '' });
    const resultsList = document.getElementById('results');
    const status = document.getElementById('status'); // clear the current badge icon if any was set.

    chrome.storage.local.get([localStorageKeys.EPEC_USER, localStorageKeys.SELECTED_CONTRACT_ID], (result) => {
        const epecUser = result[localStorageKeys.EPEC_USER];
        if (epecUser && epecUser.nombre) {
            enableLoggedInPanel(true);

            const contract = resolveSelectedContract(epecUser.contratos, result[localStorageKeys.SELECTED_CONTRACT_ID]);
            userdisplay.textContent = `${epecUser.nombre} ${epecUser.apellido} - Contrato: ${contract?.id ?? ''}`;
            renderContractPicker(epecUser.contratos ?? [], contract);
        }
    });

    contractSelect.addEventListener('change', () => {
        status.innerText = "Actualizando contrato...";

        chrome.runtime.sendMessage({ action: 'selectContract', payload: contractSelect.value }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                console.error('Contract change failed:', chrome.runtime.lastError?.message ?? response?.error);
                status.innerText = "No se pudo cambiar de contrato. Intente nuevamente en unos instantes.";
                contractSelect.value = contractSelect.dataset.savedValue;
                return;
            }

            location.reload();
        });
    });

    store.isSessionExpired().then((expired) => {
        document.getElementById('session-expired').classList.toggle('hidden', !expired);
        // Opening the popup clears the badge above, but an expired session still needs the user.
        if (expired) showSessionExpiredBadge();
    });

    chrome.storage.local.get([localStorageKeys.CONSUMPTION_DATA, localStorageKeys.LAST_UPDATED], (result) => {
        if (result.consumptionData) renderLocalData(result.consumptionData);
        if (result.lastUpdated) status.innerText = `Ultima actualizacion: ${result.lastUpdated}`;
    });

    chrome.storage.local.get([localStorageKeys.LAST_EMAIL_STATUS, localStorageKeys.LAST_REFRESH_ERROR], (result) => {
        renderStatusLines(buildPopupStatusLines({
            refreshError: result[localStorageKeys.LAST_REFRESH_ERROR],
            emailStatus: result[localStorageKeys.LAST_EMAIL_STATUS]
        }));
    });

    loadStoredNotificationPreferences();

    function renderLocalData(data) {
        resultsList.innerHTML = "";

        data.forEach(entry => {
            const li = document.createElement('li');
            li.textContent = `${entry.fechaHora}: ${Math.round(toKwh(entry.consumo))} kWh`;
            resultsList.appendChild(li);
        });

        const { total, average, projected } = summarizeConsumption(data);

        document.getElementById('totalConsumption').innerHTML = `<b>${Math.round(total)} </b> kWh`;
        document.getElementById('averageConsumption').innerHTML = `<b>${Math.round(average)} </b> kWh`;
        document.getElementById('projectedConsumption').innerHTML = `<b>${Math.round(projected)} </b> kWh`;
    }

    // textContent only: a line can include a server-provided validation message.
    function renderStatusLines(lines) {
        const container = document.getElementById('status-lines');
        container.replaceChildren(...lines.map((line) => {
            const element = document.createElement('div');
            element.className = `email-status ${line.tone}`;
            element.textContent = line.text;
            return element;
        }));
    }

    function renderContractPicker(contracts, selectedContract) {
        if (contracts.length < 2) return;

        contracts.forEach((contract) => {
            const option = document.createElement('option');
            option.value = String(contract.id);
            option.textContent = typeof contract.direccion === 'string' ? `${contract.id} - ${contract.direccion}` : String(contract.id);
            option.selected = contract === selectedContract;
            contractSelect.appendChild(option);
        });
        contractSelect.dataset.savedValue = contractSelect.value;
        document.getElementById('contract-picker').classList.remove('hidden');
    }

    // Native buttons already toggle on Space/Enter and take focus; aria-pressed carries the state.
    function renderDayPills() {
        const pills = WEEKDAY_OPTIONS.map((day) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'day-pill';
            pill.textContent = day.label;
            pill.title = day.name;
            pill.setAttribute('aria-label', day.name);
            pill.setAttribute('aria-pressed', 'false');
            pill.dataset.value = day.value;
            pill.addEventListener('click', () => selectDaysAndSave(toggleDay(selectedDays, day.value)));
            return pill;
        });
        document.getElementById('day-pills').replaceChildren(...pills);
        return pills;
    }

    function renderQuickDaySelections() {
        const buttons = QUICK_DAY_SELECTIONS.map((quick) => {
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'quick-day';
            link.textContent = quick.label;
            link.addEventListener('click', () => selectDaysAndSave([...quick.days]));
            return link;
        });
        document.getElementById('quick-days').replaceChildren(...buttons);
        return buttons;
    }

    function showSelectedDays(days) {
        selectedDays = days;
        dayPills.forEach((pill) => pill.setAttribute('aria-pressed', String(days.includes(pill.dataset.value))));
        refreshNoDaysHint();
    }

    function refreshNoDaysHint() {
        document.getElementById('no-days-hint').classList.toggle('hidden', !shouldShowNoDaysHint(toggleEmail.checked, selectedDays));
    }

    function setNotificationControlsEnabled(enabled) {
        [toggleEmail, toggleEmailAlerts, avgSelect, daysSelect, ...dayPills, ...quickDayButtons]
            .forEach((control) => { control.disabled = !enabled; });
    }

    function selectDaysAndSave(days) {
        showSelectedDays(days);
        saveReportsSection();
    }

    function loadStoredNotificationPreferences() {
        chrome.storage.local.get([localStorageKeys.NOTIFICATION_PREFERENCES], (data) => {
            storedPreferences = data[localStorageKeys.NOTIFICATION_PREFERENCES];
            showNotificationPreferences(storedPreferences);
            setNotificationControlsEnabled(true);
        });
    }

    function showNotificationPreferences(prefs) {
        toggleEmail.checked = prefs?.email_reports?.enabled === true;
        handleToggleChange(toggleEmail, panelEmail);
        showSelectedDays(orderDaysMondayFirst(prefs?.email_reports?.days));

        toggleEmailAlerts.checked = prefs?.email_alerts?.enabled === true;
        handleToggleChange(toggleEmailAlerts, panelAlerts);
        showAlertSelection(resolveAlertSelection(prefs?.email_alerts?.threshold));
    }

    function saveReportsSection() {
        const reports = buildReportsSection({ reportsEnabled: toggleEmail.checked, reportDays: selectedDays });
        saveSection('email_reports', reports, reportsSaveStatus);
    }

    function saveAlertsSection() {
        const alerts = buildAlertsSection({
            alertsEnabled: toggleEmailAlerts.checked,
            kwhLimit: avgSelect.value,
            rollingDays: daysSelect.value
        });
        saveSection('email_alerts', alerts, alertsSaveStatus);
    }

    function saveSection(section, sectionValue, statusElement) {
        const preferences = mergeSectionIntoPreferences(storedPreferences, section, sectionValue);

        chrome.runtime.sendMessage({ action: 'save_notifications', payload: preferences }, (response) => {
            if (!chrome.runtime.lastError && response?.success) {
                storedPreferences = preferences;
                showSaveStatus(statusElement, 'Guardado ✓', false);
                return;
            }
            console.error('Save failed:', chrome.runtime.lastError?.message ?? response?.error);
            showSaveStatus(statusElement, 'No se pudo guardar. Intente nuevamente.', true);
            // The controls already show the rejected choice; going back to storage keeps them truthful.
            loadStoredNotificationPreferences();
        });
    }

    function showSaveStatus(statusElement, text, isError) {
        clearTimeout(Number(statusElement.dataset.timer));
        statusElement.textContent = text;
        statusElement.classList.toggle('error', isError);
        statusElement.classList.remove('faded');
        if (isError) return;
        statusElement.dataset.timer = String(setTimeout(() => statusElement.classList.add('faded'), SAVE_CONFIRMATION_MS));
    }

    function fillNumberOptions(select, values) {
        select.replaceChildren(...values.map((value) => {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = String(value);
            return option;
        }));
    }

    function showAlertSelection({ kwhLimit, rollingDays }) {
        avgSelect.value = String(kwhLimit);
        daysSelect.value = String(rollingDays);
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