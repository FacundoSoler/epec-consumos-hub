import { vi } from 'vitest';
import type { Request, Response } from 'express';

export type FakeResponse = Response & { body: unknown; finish: () => void };

export function fakeRequest(overrides: Partial<Request> = {}): Request {
    return { body: {}, headers: {}, ...overrides } as Request;
}

/** Records status/json calls and lets tests trigger the 'finish' event. */
export function fakeResponse(locals: Record<string, unknown> = {}): FakeResponse {
    const finishListeners: Array<() => void> = [];
    const res: any = { statusCode: 200, locals, body: undefined };

    res.status = vi.fn((code: number) => {
        res.statusCode = code;
        return res;
    });
    res.json = vi.fn((body: unknown) => {
        res.body = body;
        return res;
    });
    res.on = vi.fn((event: string, listener: () => void) => {
        if (event === 'finish') finishListeners.push(listener);
        return res;
    });
    res.finish = () => finishListeners.forEach((listener) => listener());

    return res as FakeResponse;
}
