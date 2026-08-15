import { getUserTokenDetails } from "../utils/utils.js";
import { deleteUserAndCleanupContracts, syncUserContext } from '../db/repository.js'

const EPEC_API_KEY = process.env.EPEC_API_KEY;
const EPEC_API_BASE_URL = process.env.EPEC_API_BASE_URL;

export const processUserLogOff = async (token: string): Promise<{ message: string; success: boolean }> => {
    if (!EPEC_API_KEY || !EPEC_API_KEY) {
        throw new Error('EPEC_API_KEY or EPEC_API_KEY environment variables are missing.');
    }

    const url = `${EPEC_API_BASE_URL}/usuarios/servicios`;
    const response = await fetch(url, {
        headers: {
            apikey: EPEC_API_KEY,
            Authorization: `Bearer ${token}`
        }
    });

    const userDetails = getUserTokenDetails(token);
    if (!response.ok) {
        console.warn(`⚠️ Intento de logoff con token inválido rechazado por EPEC para el documento: ${userDetails.documento}`);
        return { message: 'Sesión inválida o expirada en EPEC. No se puede procesar la baja.', success: false };
    }

    const result = await deleteUserAndCleanupContracts(userDetails?.documento, userDetails.email, userDetails.sub);
    return { message: result.message ?? '', success: result.success };
}

export const syncUser = async (notificationsPreferences: any) => {
    if (notificationsPreferences?.email_reports?.enabled && notificationsPreferences.email_reports.days.length <= 0) {
        throw new Error('No ha seteado Dias para notificaciones Email.');
    }

    if (notificationsPreferences?.email_alerts?.enabled) {
        const kwhLimit = Number(notificationsPreferences?.email_alerts?.threshold.kwh_limit_per_day);
        const rollingDays = parseInt(notificationsPreferences.email_alerts.threshold.rolling_days_window, 10);

        if (isNaN(kwhLimit) || kwhLimit <= 0) {
            throw new Error('El consumo promedio por día debe ser un número positivo mayor a 0.');
        }

        if (isNaN(rollingDays) || rollingDays < 1 || rollingDays > 31) {
            throw new Error('La ventana de días móviles debe ser un número entero positivo entre 1 y 31.');
        }
    }

    const result = await syncUserContext(notificationsPreferences);
    return result;
}