import type { Request, Response } from 'express';
import { processUserLogOff, syncUser } from '../services/authService';

export const handleLogOff = async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Faltan parámetros requeridos (token).' });

    try {
        const result = await processUserLogOff(token);
        if (!result.success) return res.status(400).json({ error: result.message });

        return res.status(200).json({
            success: true,
            message: 'User, preferences and associated contracts deleted correctly.'
        });

    } catch (error) {
        console.error('Error crítico en el endpoint de logoff:', error);
        return res.status(500).json({ error: 'Error interno del servidor al procesar la baja.' });
    }
};

export const handleSyncUser = async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        const notificationsPreferences = payload.notificationsPreferences;

        const result = await syncUser(notificationsPreferences);

        return res.status(200).json({
            success: true,
            message: 'User context and preferences synchronized successfully.',
            userId: result.userId
        });

    } catch (error) {
        console.error('Error handling /api/sync-user payload:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error while syncing database context.'
        });
    }
};

export const handleTestAPI = async (req: Request, res:Response) => {
    return res.status(200).json({ response: "success !" });
}