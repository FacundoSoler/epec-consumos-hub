import { Request, Response } from 'express';
import { sendEmail } from '../services/emailService.js';

const MAX_HTML_LENGTH = 100_000;

export const handleSendEmail = async (req: Request, res: Response) => {
    const { subject, htmlContent, sendToEmailAddress } = req.body ?? {};

    const validationError = getEmailRequestValidationError(subject, htmlContent, sendToEmailAddress);
    if (validationError) return res.status(400).json({ error: validationError });

    try {
        await sendEmail(subject, htmlContent, sendToEmailAddress);
        return res.status(200).json({ status: 'sent' });
    } catch (error: any) {
        console.error('❌ Failed to send email:', error.message);
        return res.status(502).json({ error: 'The email provider rejected the message. Try again later.' });
    }
};

function getEmailRequestValidationError(subject: unknown, htmlContent: unknown, sendToEmailAddress: unknown) {
    if (typeof subject !== 'string' || subject.trim() === '') return 'subject is required.';
    if (typeof htmlContent !== 'string' || htmlContent.trim() === '') return 'htmlContent is required.';
    if (htmlContent.length > MAX_HTML_LENGTH) return `htmlContent must be under ${MAX_HTML_LENGTH} characters.`;
    if (typeof sendToEmailAddress !== 'string' || sendToEmailAddress.trim() === '') return 'sendToEmailAddress is required.';

    return null;
}
