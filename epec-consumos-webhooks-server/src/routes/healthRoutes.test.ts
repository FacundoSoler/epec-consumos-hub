import { describe, expect, it } from 'vitest';
import router, { handleHealthCheck } from './healthRoutes.js';
import { fakeRequest, fakeResponse } from '../testing/fakeExpress.js';

describe('health route', () => {
    it('answers 200 { status: "ok" } without needing a token', () => {
        const res = fakeResponse();

        handleHealthCheck(fakeRequest(), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });

    it('is a single GET handler, with no auth or rate-limit middleware in front', () => {
        const routes = router.stack.map((layer: any) => ({
            path: layer.route.path,
            methods: Object.keys(layer.route.methods),
            handlers: layer.route.stack.map((routeLayer: any) => routeLayer.handle)
        }));

        expect(routes).toEqual([{ path: '/', methods: ['get'], handlers: [handleHealthCheck] }]);
    });
});
