import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/emailService.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../services/epecAPIservice.js', () => ({ getContratos: vi.fn() }));

import router from './emailRoutes.js';
import { requireEpecToken } from '../middleware/requireEpecToken.js';
import { handleSendEmail } from '../controllers/emailController.js';

function registeredRoutes() {
    return router.stack.map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
        handlers: layer.route.stack.map((routeLayer: any) => routeLayer.handle)
    }));
}

describe('email routes', () => {
    it('exposes both endpoints as POST only', () => {
        expect(registeredRoutes().map(({ path, methods }) => ({ path, methods }))).toEqual([
            { path: '/sendEmailNotification', methods: ['post'] },
            { path: '/sendEmailAlert', methods: ['post'] }
        ]);
    });

    it('checks the EPEC token before the controller on every route', () => {
        for (const route of registeredRoutes()) {
            expect(route.handlers[0]).toBe(requireEpecToken);
            expect(route.handlers.at(-1)).toBe(handleSendEmail);
        }
    });
});
