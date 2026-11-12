export const getToDate = () => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" }));
    const pad = (n:any) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};