import { Request, Response } from 'express';
import { sendEmail } from '../services/emailService.js';
import { EpecUser } from '../models/epecUser.js';

const MAX_HTML_LENGTH = 100_000;

export const handleSendEmail = async (req: Request, res: Response) => {
    const { subject, htmlContent } = req.body ?? {};
    const epecUser = res.locals.epecUser as EpecUser;

    const validationError = getEmailRequestValidationError(subject, htmlContent);
    if (validationError) return res.status(400).json({ error: validationError });

    try {
        // The recipient always comes from the verified token, so callers can only email themselves.
        await sendEmail(subject, htmlContent, epecUser.email);
        return res.status(200).json({ status: 'sent' });
    } catch (error: any) {
        console.error('❌ Failed to send email:', error.message);
        return res.status(502).json({ error: 'The email provider rejected the message. Try again later.' });
    }
};

function getEmailRequestValidationError(subject: unknown, htmlContent: unknown) {
    if (typeof subject !== 'string' || subject.trim() === '') return 'subject is required.';
    if (typeof htmlContent !== 'string' || htmlContent.trim() === '') return 'htmlContent is required.';
    if (htmlContent.length > MAX_HTML_LENGTH) return `htmlContent must be under ${MAX_HTML_LENGTH} characters.`;

    return null;
}
