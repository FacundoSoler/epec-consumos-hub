import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chromeMock.js';
import { resolveSelectedContract, store } from '../src/storage/store.js';

function withStorage(initialStorage) {
    const mock = createChromeMock(initialStorage);
    vi.stubGlobal('chrome', mock.chrome);
    return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe('store', () => {
    it('getEpecUser returns the stored session', async () => {
        withStorage({ epecUser: { token: 't', contratos: [] } });

        await expect(store.getEpecUser()).resolves.toEqual({ token: 't', contratos: [] });
    });

    it.each(['getEpecUser', 'getBearerToken', 'getContractId'])('%s rejects when no session is stored', async (getter) => {
        withStorage({});

        await expect(store[getter]()).rejects.toThrow('No User data found.');
    });

    it('getBearerToken returns the session token', async () => {
        withStorage({ epecUser: { token: 'abc' } });

        await expect(store.getBearerToken()).resolves.toBe('abc');
    });

    it('getContractId returns the first contract id', async () => {
        withStorage({ epecUser: { contratos: [{ id: 'C1' }, { id: 'C2' }] } });

        await expect(store.getContractId()).resolves.toBe('C1');
    });

    it('getContractId returns the selected contract id', async () => {
        withStorage({ epecUser: { contratos: [{ id: 'C1' }, { id: 'C2' }] }, selectedContractId: 'C2' });

        await expect(store.getContractId()).resolves.toBe('C2');
    });

    it('getContractId matches a numeric EPEC id against the stored string selection', async () => {
        withStorage({ epecUser: { contratos: [{ id: 1 }, { id: 2 }] }, selectedContractId: '2' });

        await expect(store.getContractId()).resolves.toBe(2);
    });

    it('getContractId falls back to the first contract when the selection is gone', async () => {
        withStorage({ epecUser: { contratos: [{ id: 'C1' }, { id: 'C2' }] }, selectedContractId: 'OLD' });

        await expect(store.getContractId()).resolves.toBe('C1');
    });

    it('resolveSelectedContract handles a missing contract list', () => {
        expect(resolveSelectedContract(null, 'C1')).toBeUndefined();
    });

    it.each([
        ['null contratos', null],
        ['empty contratos', []],
        ['contract without id', [{}]]
    ])('getContractId rejects with %s', async (_label, contratos) => {
        withStorage({ epecUser: { contratos } });

        await expect(store.getContractId()).rejects.toThrow('Error retrieving contractId.');
    });

    it('reads storage once per getter call', async () => {
        const mock = withStorage({ epecUser: { contratos: [{ id: 'C1' }] } });

        await store.getContractId();

        expect(mock.chrome.storage.local.get).toHaveBeenCalledTimes(1);
    });

    it.each([[true, true], [false, false], [undefined, false]])('isSessionExpired with stored %s is %s', async (stored, expected) => {
        withStorage(stored === undefined ? {} : { sessionExpired: stored });

        await expect(store.isSessionExpired()).resolves.toBe(expected);
    });
});
