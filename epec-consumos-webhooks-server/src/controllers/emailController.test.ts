import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRequest, fakeResponse } from '../testing/fakeExpress.js';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('../services/emailService.js', () => ({ sendEmail }));

import { handleSendEmail } from './emailController.js';

const verifiedUser = { email: 'ana@example.com', documento: '30111222' };
const validBody = { subject: 'Reporte', htmlContent: '<p>hola</p>' };

async function send(body: unknown) {
    const res = fakeResponse({ epecUser: verifiedUser });
    await handleSendEmail(fakeRequest({ body }), res);
    return res;
}

beforeEach(() => {
    sendEmail.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('handleSendEmail', () => {
    it('sends to the verified token email and answers 200', async () => {
        sendEmail.mockResolvedValue('id');

        const res = await send(validBody);

        expect(sendEmail).toHaveBeenCalledWith('Reporte', '<p>hola</p>', 'ana@example.com');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: 'sent' });
    });

    it('ignores a recipient in the body, so callers can only email themselves', async () => {
        sendEmail.mockResolvedValue('id');

        await send({ ...validBody, sendToEmailAddress: 'victim@example.com', to: 'victim@example.com' });

        expect(sendEmail).toHaveBeenCalledWith('Reporte', '<p>hola</p>', 'ana@example.com');
    });

    it.each([
        ['missing subject', { ...validBody, subject: undefined }, 'subject is required.'],
        ['blank subject', { ...validBody, subject: '   ' }, 'subject is required.'],
        ['non-string subject', { ...validBody, subject: 42 }, 'subject is required.'],
        ['missing htmlContent', { ...validBody, htmlContent: undefined }, 'htmlContent is required.'],
        ['blank htmlContent', { ...validBody, htmlContent: '' }, 'htmlContent is required.']
    ])('answers 400 for %s without sending', async (_label, body, error) => {
        const res = await send(body);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error });
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('rejects HTML over 100 000 characters', async () => {
        const res = await send({ ...validBody, htmlContent: 'x'.repeat(100_001) });

        expect(res.statusCode).toBe(400);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('accepts HTML of exactly 100 000 characters', async () => {
        sendEmail.mockResolvedValue('id');

        const res = await send({ ...validBody, htmlContent: 'x'.repeat(100_000) });

        expect(res.statusCode).toBe(200);
    });

    it('answers 400 when there is no JSON body at all', async () => {
        const res = await send(undefined);

        expect(res.statusCode).toBe(400);
    });

    it('answers 502, not 200, when the email provider fails', async () => {
        sendEmail.mockRejectedValue(new Error('SMTP down'));

        const res = await send(validBody);

        expect(res.statusCode).toBe(502);
        expect(res.body).toEqual({ error: 'The email provider rejected the message. Try again later.' });
    });
});
