const DEFAULT_PORT = 3000;

/** Railway injects PORT; anything missing or not a valid port falls back to 3000 for local runs. */
export function getPort(env: NodeJS.ProcessEnv = process.env): number {
    const port = Number(env.PORT);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}
