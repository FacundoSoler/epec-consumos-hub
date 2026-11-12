const originalFetch = window.fetch;

window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0];

    console.log('API call intercepted: ' + url);

    if (typeof url === 'string' && url.includes('/api/login')) {
        try {
            const clone = response.clone();
            const data = await clone.json();

            window.postMessage({ type: 'EPEC_NETWORK_LOGIN', data }, '*');
        } catch (error) {
            console.error('Error handling intercepted login stream:', error);
        }

        return response;
    }
};

const OriginalXHR = window.XMLHttpRequest;

window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    let interceptedUrl = '';

    const originalOpen = xhr.open;
    xhr.open = function(method, url, ...rest) {
        interceptedUrl = url;
        console.log('XHR call intercepted: ' + url);
        return originalOpen.apply(this, [method, url, ...rest]);
    };

    const originalSend = xhr.send;
    xhr.send = function(body) {
        xhr.addEventListener('load', function() {
            if (typeof interceptedUrl === 'string' && interceptedUrl.includes('/api/login')) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    
                    window.postMessage({ type: 'EPEC_NETWORK_LOGIN', data }, '*');
                    console.log('Successfully extracted login payload via XHR!');
                } catch (error) {
                    console.error('Error handling intercepted XHR login stream:', error);
                }
            }
        });

        return originalSend.apply(this, arguments);
    };

    return xhr;
};