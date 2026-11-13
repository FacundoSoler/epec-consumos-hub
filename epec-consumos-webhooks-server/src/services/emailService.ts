import nodemailer from 'nodemailer';
import { createLogger } from '../logger.js';
import { maskEmail } from '../maskEmail.js';

const log = createLogger('email');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD
    }
});

export async function sendEmail(subject: string, htmlContent: string, sendToEmailAddress: string) {
    const info = await transporter.sendMail({
        from: `"Electricity Monitor" <${process.env.SMTP_USER}>`,
        to: sendToEmailAddress,
        subject,
        html: htmlContent
    });

    log.info(`Email sent to ${maskEmail(sendToEmailAddress) ?? 'unknown recipient'} (Gmail message id ${info.messageId})`);
    return info.messageId;
}
