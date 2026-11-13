import { describe, expect, it, vi } from 'vitest';
import { handleListenResult } from './listenResult.js';

function fakeDependencies() {
    return {
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        exit: vi.fn()
    };
}

function listenError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`listen ${code}: 0.0.0.0:3000`), { code });
}

describe('handleListenResult', () => {
    it('logs that the server is running when the port opened', () => {
        const deps = fakeDependencies();

        handleListenResult(3000, undefined, deps);

        expect(deps.log.info).toHaveBeenCalledWith('Server running on http://localhost:3000', { port: 3000 });
        expect(deps.log.error).not.toHaveBeenCalled();
        expect(deps.exit).not.toHaveBeenCalled();
    });

    it.each([
        ['EACCES', 'Could not listen on port 3000: port reserved or not permitted'],
        ['EADDRINUSE', 'Could not listen on port 3000: port already in use']
    ])('on %s logs a clear error naming the port and code and exits with 1', (code, message) => {
        const deps = fakeDependencies();

        handleListenResult(3000, listenError(code), deps);

        expect(deps.log.error).toHaveBeenCalledWith(message, { port: 3000, code });
        expect(deps.exit).toHaveBeenCalledWith(1);
        expect(deps.log.info).not.toHaveBeenCalled();
    });

    it('falls back to the error message for other codes', () => {
        const deps = fakeDependencies();

        handleListenResult(8080, listenError('EINVAL'), deps);

        expect(deps.log.error).toHaveBeenCalledWith('Could not listen on port 8080: listen EINVAL: 0.0.0.0:3000', { port: 8080, code: 'EINVAL' });
        expect(deps.exit).toHaveBeenCalledWith(1);
    });
});
