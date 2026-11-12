const pad = (n) => String(n).padStart(2, '0');

/** Current Córdoba time in the DDMMYYYYHHmm format EPEC expects for "hasta". */
export const getToDate = () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Cordoba' }));
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};
