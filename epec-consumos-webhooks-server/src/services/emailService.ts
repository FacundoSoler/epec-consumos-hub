import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { getContratos } from './epecAPIservice.js';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD
    }
});

interface CustomJwtTokenPayload {
    email: string;
    documento: string;
}

export async function sendEmailNotification(subject: string, htmlContent: string, sendToEmailAddress: string, token: string) {
    try {
        const response = await getContratos(token);
        if (!response.ok) throw new Error('EPEC Token is invalid.');

        const jwtToken = jwt.decode(token) as CustomJwtTokenPayload;
        const emailAddress = jwtToken.email;
        const documento = jwtToken.documento;

        const info = await transporter.sendMail({
            from: `"Electricity Monitor" ${process.env.SMTP_USER}`,
            to: sendToEmailAddress,
            subject: subject,
            html: htmlContent
        });

        console.log('Email sent %s', info.messageId);
    } catch (error) {
        console.error('Error sending email', error);
    }
}

export async function sendEmailAlert(subject: string, htmlContent: string, sendToEmailAddress: string) {
    try {
        const info = await transporter.sendMail({
            from: `"Electricity Monitor" ${process.env.SMTP_USER}`,
            to: sendToEmailAddress,
            subject: subject,
            html: htmlContent
        });

        console.log('Email sent %s', info.messageId);
    } catch (error) {
        console.error('Error sending email', error);
    }
}