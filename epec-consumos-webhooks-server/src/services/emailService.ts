import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD
    }
});

export async function sendEmail(subject: string, htmlContent: string, sendToEmailAddress: string) {
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