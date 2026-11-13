import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMail, createTransport } = vi.hoisted(() => {
    process.env.SMTP_USER = 'monitor@example.com';
    process.env.SMTP_APP_PASSWORD = 'app-password';
    const sendMail = vi.fn();
    return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});

vi.mock('nodemailer', () => ({ default: { createTransport } }));

import { sendEmail } from './emailService.js';

beforeEach(() => {
    sendMail.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('sendEmail', () => {
    it('creates a Gmail transport with the SMTP env credentials', () => {
        expect(createTransport).toHaveBeenCalledWith({
            service: 'gmail',
            auth: { user: 'monitor@example.com', pass: 'app-password' }
        });
    });

    it('sends HTML with an RFC 5322 From header (address in angle brackets)', async () => {
        sendMail.mockResolvedValue({ messageId: 'abc' });

        await sendEmail('Reporte', '<p>hola</p>', 'ana@example.com');

        expect(sendMail).toHaveBeenCalledWith({
            from: '"Electricity Monitor" <monitor@example.com>',
            to: 'ana@example.com',
            subject: 'Reporte',
            html: '<p>hola</p>'
        });
    });

    it('returns the provider message id', async () => {
        sendMail.mockResolvedValue({ messageId: 'id-42' });

        await expect(sendEmail('s', 'h', 'a@b.c')).resolves.toBe('id-42');
    });

    it('logs the masked recipient and the Gmail message id, never the full address', async () => {
        sendMail.mockResolvedValue({ messageId: '<id-42@gmail.com>' });

        await sendEmail('s', 'h', 'facundo@hotmail.com');

        const lines = vi.mocked(console.log).mock.calls.map(([line]) => String(line));
        const output = lines.at(-1) ?? '';
        const entry = JSON.parse(output);
        expect(entry).toMatchObject({ level: 'info', area: 'email' });
        expect(entry.message).toBe('Email sent to fa*****@hotmail.com (Gmail message id <id-42@gmail.com>)');
        expect(lines.join(' ')).not.toContain('facundo@');
    });

    it('rejects when the provider fails instead of swallowing the error', async () => {
        sendMail.mockRejectedValue(new Error('Invalid login'));

        await expect(sendEmail('s', 'h', 'a@b.c')).rejects.toThrow('Invalid login');
    });
});
