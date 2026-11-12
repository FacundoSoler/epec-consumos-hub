const originalFetch = window.fetch;

window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);

    if (url.includes('/api/login')) {
        try {
            const data = await response.clone().json();
            window.postMessage({ type: 'EPEC_NETWORK_LOGIN', data }, window.location.origin);
        } catch (error) {
            console.error('Error handling intercepted login stream:', error);
        }
    }

    // Every call must get its response back, or the EPEC site itself breaks.
    return response;
};

// Patch the prototype rather than replacing the constructor, so XMLHttpRequest.DONE,
// instanceof checks and anything else the site relies on keep working.
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
const interceptedUrls = new WeakMap();

XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    interceptedUrls.set(this, String(url));
    return originalOpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function (...args) {
    if (interceptedUrls.get(this)?.includes('/api/login')) {
        this.addEventListener('load', () => postLoginPayloadFromXhr(this));
    }

    return originalSend.apply(this, args);
};

function postLoginPayloadFromXhr(xhr) {
    try {
        const data = JSON.parse(xhr.responseText);
        window.postMessage({ type: 'EPEC_NETWORK_LOGIN', data }, window.location.origin);
    } catch (error) {
        console.error('Error handling intercepted XHR login stream:', error);
    }
}