import { vi } from 'vitest';

/**
 * Minimal in-memory stand-in for the chrome.* APIs the extension uses.
 * Storage methods support both the promise and the callback style, like Chrome.
 */
export function createChromeMock(initialStorage = {}) {
    const storage = { ...initialStorage };
    const messageListeners = [];
    const startupListeners = [];

    const respond = (result, callback) => {
        if (typeof callback === 'function') {
            callback(result);
            return undefined;
        }
        return Promise.resolve(result);
    };

    const pick = (keys) => {
        const wanted = keys == null ? Object.keys(storage) : [].concat(keys);
        return Object.fromEntries(wanted.filter((key) => key in storage).map((key) => [key, storage[key]]));
    };

    const chrome = {
        storage: {
            local: {
                get: vi.fn((keys, callback) => respond(pick(keys), callback)),
                set: vi.fn((items, callback) => {
                    Object.assign(storage, items);
                    return respond(undefined, callback);
                }),
                clear: vi.fn((callback) => {
                    Object.keys(storage).forEach((key) => delete storage[key]);
                    return respond(undefined, callback);
                })
            }
        },
        runtime: {
            onMessage: { addListener: vi.fn((listener) => messageListeners.push(listener)) },
            onStartup: { addListener: vi.fn((listener) => startupListeners.push(listener)) },
            sendMessage: vi.fn()
        },
        action: {
            setBadgeText: vi.fn(),
            setBadgeBackgroundColor: vi.fn()
        }
    };

    /** Delivers a message to every listener; resolves with the first sendResponse value. */
    const dispatch = (message) => new Promise((resolve) => {
        messageListeners.forEach((listener) => listener(message, {}, resolve));
    });

    return { chrome, storage, messageListeners, startupListeners, dispatch };
}
