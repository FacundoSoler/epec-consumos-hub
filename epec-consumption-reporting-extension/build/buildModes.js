export const API_BASE_URLS = {
    production: 'https://epec-consumos-hub-production.up.railway.app/api',
    development: 'http://localhost:3000/api'
};

const DEV_ONLY_HOST_PERMISSIONS = ['http://localhost:3000/*'];

// Built files sit at the root of dist/, so the source manifest's "src/" prefix is dropped.
function toDistPath(path) {
    return path.replace(/^src\//, '');
}

export function buildManifest(sourceManifest, mode) {
    const hostPermissions = sourceManifest.host_permissions ?? [];
    return {
        ...sourceManifest,
        host_permissions: mode === 'production'
            ? hostPermissions.filter((permission) => !DEV_ONLY_HOST_PERMISSIONS.includes(permission))
            : hostPermissions,
        background: {
            ...sourceManifest.background,
            service_worker: toDistPath(sourceManifest.background.service_worker)
        },
        action: {
            ...sourceManifest.action,
            default_popup: toDistPath(sourceManifest.action.default_popup)
        },
        content_scripts: sourceManifest.content_scripts.map((script) => ({
            ...script,
            js: script.js.map(toDistPath)
        }))
    };
}
