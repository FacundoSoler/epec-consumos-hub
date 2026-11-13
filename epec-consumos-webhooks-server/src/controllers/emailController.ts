import { Request, Response } from 'express';
import { sendEmail } from '../services/emailService.js';
import { EpecUser } from '../models/epecUser.js';
import { createLogger, LogFields } from '../logger.js';
import { maskEmail } from '../maskEmail.js';

const log = createLogger('email');

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
    } catch (error: unknown) {
        log.error('Email not sent: the provider rejected it or could not be reached', describeSendFailure(error, epecUser.email));
        return res.status(502).json({ error: 'The email provider rejected the message. Try again later.' });
    }
};

function getEmailRequestValidationError(subject: unknown, htmlContent: unknown) {
    if (typeof subject !== 'string' || subject.trim() === '') return 'subject is required.';
    if (typeof htmlContent !== 'string' || htmlContent.trim() === '') return 'htmlContent is required.';
    if (htmlContent.length > MAX_HTML_LENGTH) return `htmlContent must be under ${MAX_HTML_LENGTH} characters.`;

    return null;
}

/**
 * nodemailer puts the SMTP reply in `response` and a code like EAUTH or ECONNECTION in `code`.
 * SMTP replies and messages can echo the recipient, so the address is replaced by its masked form.
 * Credentials never appear in these fields; the transport config is not logged.
 */
export function describeSendFailure(error: unknown, recipient: string): LogFields {
    const failure = (error ?? {}) as { code?: unknown; responseCode?: unknown; response?: unknown; message?: unknown };
    const masked = maskEmail(recipient) ?? 'unknown recipient';
    const redact = (value: unknown) => typeof value === 'string'
        ? firstLine(value).split(recipient).join(masked)
        : undefined;

    return {
        recipient: masked,
        code: typeof failure.code === 'string' ? failure.code : undefined,
        responseCode: typeof failure.responseCode === 'number' ? failure.responseCode : undefined,
        response: redact(failure.response),
        error: redact(failure.message)
    };
}

function firstLine(text: string): string {
    return text.split(/\r?\n/)[0];
}
