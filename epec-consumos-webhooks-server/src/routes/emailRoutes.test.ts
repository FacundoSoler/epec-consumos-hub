import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/emailService.js', () => ({ sendEmail: vi.fn() }));

import router from './emailRoutes.js';

function registeredRoutes() {
    return router.stack.map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
    }));
}

describe('email routes', () => {
    it('exposes both endpoints as POST only', () => {
        expect(registeredRoutes()).toEqual([
            { path: '/sendEmailNotification', methods: ['post'] },
            { path: '/sendEmailAlert', methods: ['post'] }
        ]);
    });
});
