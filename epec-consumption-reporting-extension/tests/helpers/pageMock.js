import { vi } from 'vitest';

export const PAGE_ORIGIN = 'https://www.epec.com.ar';

/** A bare-bones XMLHttpRequest whose listeners tests can fire by hand. */
export function createFakeXhrClass() {
    return class FakeXMLHttpRequest {
        static DONE = 4;

        constructor() {
            this.listeners = {};
            this.responseText = '';
        }

        open(method, url) {
            this.openedWith = { method, url };
        }

        send(body) {
            this.sentBody = body;
        }

        addEventListener(type, listener) {
            (this.listeners[type] ??= []).push(listener);
        }

        fire(type) {
            (this.listeners[type] ?? []).forEach((listener) => listener.call(this));
        }
    };
}

/** Installs a fake page `window` (the MAIN world content scripts run in) on globalThis. */
export function installPageWindow({ originalFetch = vi.fn() } = {}) {
    const FakeXhr = createFakeXhrClass();
    const messageListeners = [];
    const pageWindow = {
        fetch: originalFetch,
        postMessage: vi.fn(),
        location: { origin: PAGE_ORIGIN },
        XMLHttpRequest: FakeXhr,
        addEventListener: vi.fn((type, listener) => {
            if (type === 'message') messageListeners.push(listener);
        })
    };

    vi.stubGlobal('window', pageWindow);
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    return { pageWindow, FakeXhr, messageListeners };
}
