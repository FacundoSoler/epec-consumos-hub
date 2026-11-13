import { createLogger, Logger } from './logger.js';

const LISTEN_ERROR_HINTS: Record<string, string> = {
    EACCES: 'port reserved or not permitted',
    EADDRINUSE: 'port already in use'
};

export interface ListenResultDependencies {
    log: Logger;
    exit: (code: number) => void;
}

/**
 * Express 5 hands listen failures to the app.listen callback instead of throwing, so without this
 * the server would claim to be running on a port it never opened (as happened with a Windows
 * reserved port). A server that cannot listen is useless, so it exits for Railway to restart it.
 */
export function handleListenResult(
    port: number,
    error: NodeJS.ErrnoException | undefined,
    { log, exit }: ListenResultDependencies = { log: createLogger('server'), exit: (code) => process.exit(code) }
): void {
    if (error) {
        const reason = (error.code && LISTEN_ERROR_HINTS[error.code]) ?? error.message;
        log.error(`Could not listen on port ${port}: ${reason}`, { port, code: error.code });
        exit(1);
        return;
    }

    log.info(`Server running on http://localhost:${port}`, { port });
}
