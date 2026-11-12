import { Request, Response } from 'express';
import { sendEmailNotification, sendEmailAlert } from '../services/emailService.js';

// --- ENDPOINT 1: We receive the ping from the Cron Job to fire up daily reports and alerts
export const handleEmailNotification = async (req: Request, res: Response) => {
    try {
        const subject = req.params['subject']?.toString();
        const htmlContent = req.params['htmlContent']?.toString();
        const sendToEmailAddress = req.params['sendToEmailAddress']?.toString();

        await sendEmailNotification(subject, htmlContent, sendToEmailAddress);

        return res.status(200).json({ status: "success, templates dispatched" });
    } catch (error:any) {
        console.error(`❌ Failed to trigger report cron job:`, error.message);
        return res.status(500).json({ status: "error triggering report cron job. Error Details: " + error.message });
    }
}

export const handleEmailAlert = async (req: Request, res: Response) => {
    try {
        const subject = req.params['subject']?.toString();
        const htmlContent = req.params['htmlContent']?.toString();
        const sendToEmailAddress = req.params['sendToEmailAddress']?.toString();

        await sendEmailAlert(subject, htmlContent, sendToEmailAddress);
    } catch (error) {
        
    }
}