import {Request, Response} from 'express';
import { processNotifications } from '../services/webhooksService';

const CRON_JOB_API_KEY = process.env.CRON_JOB_API_KEY;

// --- ENDPOINT 1: We receive the ping from the Cron Job to fire up daily reports and alerts
export const epecReportCronJob = async (req: Request, res: Response) => {
    try {
        const apiKey = req.headers["apikey"];
        if (CRON_JOB_API_KEY !== apiKey) {
            return res.status(401).json({ error: "Unauthorized access. Request rejected." });
        }

        await processNotifications();

        return res.status(200).json({ status: "success, templates dispatched" });
    } catch (error:any) {
        console.error(`❌ Failed to trigger report cron job:`, error.message);
        return res.status(500).json({ status: "error triggering report cron job. Error Details: " + error.message });
    }
}