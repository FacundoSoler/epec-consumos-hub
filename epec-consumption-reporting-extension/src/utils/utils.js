const pad = (n) => String(n).padStart(2, '0');

const getCordobaNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Cordoba' }));

/** Current Córdoba time in the DDMMYYYYHHmm format EPEC expects for "hasta". */
export const getToDate = () => {
    const now = getCordobaNow();
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};

/** "0".."6" with Sunday = "0", the same encoding the popup stores for report days. */
export const getCordobaWeekday = () => String(getCordobaNow().getDay());

/** "YYYY-MM-DD" in Córdoba time, used to remember the day a report was sent. */
export const getCordobaDateKey = () => {
    const now = getCordobaNow();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
