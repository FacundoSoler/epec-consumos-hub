window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'EPEC_NETWORK_LOGIN') {
        chrome.runtime.sendMessage({ type: 'SYNC_EPEC_SESSION', payload: event.data.data });
    }
});

function checkPersistedSession() {
    try {
        const localData = localStorage.getItem('epecUserData');

        if (!localData || localData === '{}' || localData.trim() === '') {
            return;
        }

        const parsed = JSON.parse(localData);
        chrome.runtime.sendMessage({ type: 'SYNC_EPEC_SESSION', payload: parsed });
    } catch (error) {
        console.error('Failed to parse  active EPEC storage session:', error);
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    checkPersistedSession();
} else {
    window.addEventListener('DOMContentLoaded', checkPersistedSession);
}