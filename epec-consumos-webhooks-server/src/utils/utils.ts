import { authUserDetails } from "../models/authUserDetails";
import jwt, { JwtPayload } from 'jsonwebtoken';

interface CustomJwtPayload {
    email?: string;
    documento?: number;
    sub?: string | number;
}

export const getUserTokenDetails = (token: string) : authUserDetails => {
    try {
        const payload = jwt.decode(token) as CustomJwtPayload | null;
        if (!payload) {
            throw new Error("El token es inválido o no se pudo decodificar.");
        }

        const sub = Number(payload.sub ?? 0);
        const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
        const documento = typeof payload.documento === 'number' ? payload.documento : 0;
        
        const userDetails: authUserDetails = {
            documento,
            email,
            sub
        }

        return userDetails;

    } catch (error:any) {
        console.error("Error procesando el token:", error.message);
        // handle error adequately (e.g.: 401 Unauthorized)
        throw error;
    }
}

export const getToDate = () => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" }));
    const pad = (n:any) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};