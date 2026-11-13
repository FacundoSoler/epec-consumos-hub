import { describe, expect, it } from 'vitest';
import { buildEmailStatusLine, formatKwh } from '../src/utils/emailStatusText.js';

const at = new Date(2026, 10, 12, 9, 5).toISOString();
const recipient = 'fa•••@hotmail.com';
const server = 'http://localhost:3000';
const outcome = (kind, result, reason, fields = {}) => ({ kind, result, reason, at, ...fields });
const textOf = (...args) => buildEmailStatusLine(outcome(...args)).text;

describe('buildEmailStatusLine: daily report', () => {
    it('sent', () => {
        expect(buildEmailStatusLine(outcome('report', 'sent', 'sent', { recipient, status: 200 }))).toEqual({
            tone: 'success',
            text: '✅ Reporte diario enviado por email a fa•••@hotmail.com (usuario EPEC) a las 09:05.'
        });
    });

    it.each(['already-sent', 'already-sent-locally'])('already-sent (%s)', (reason) => {
        expect(buildEmailStatusLine(outcome('report', 'already-sent', reason, { recipient }))).toEqual({
            tone: 'success',
            text: '✅ El reporte diario de hoy ya fue enviado por email a fa•••@hotmail.com (usuario EPEC). El próximo se envía el siguiente día seleccionado.'
        });
    });

    it.each(['server-unreachable', 'timeout'])('%s', (reason) => {
        expect(buildEmailStatusLine(outcome('report', 'failed', reason, { server }))).toEqual({
            tone: 'error',
            text: '❌ No se pudo enviar el reporte diario por email: el servidor no responde (http://localhost:3000). Se reintentará en la próxima actualización.'
        });
    });

    it('session-rejected', () => {
        expect(textOf('report', 'failed', 'session-rejected', { status: 401 }))
            .toBe('❌ No se pudo enviar el reporte diario por email: EPEC rechazó la sesión. Ingresá a EPEC nuevamente.');
    });

    it('invalid-data with and without the server message', () => {
        expect(textOf('report', 'failed', 'invalid-data', { status: 400, details: { serverMessage: 'subject is required.' } }))
            .toBe('❌ No se pudo enviar el reporte diario por email: el servidor rechazó los datos (subject is required.).');
        expect(textOf('report', 'failed', 'invalid-data', { status: 400 }))
            .toBe('❌ No se pudo enviar el reporte diario por email: el servidor rechazó los datos.');
    });

    it.each(['server-error', 'unexpected-response'])('%s with and without a status', (reason) => {
        expect(textOf('report', 'failed', reason, { status: 502 }))
            .toBe('❌ No se pudo enviar el reporte diario por email: error del servidor (código 502). Se reintentará en la próxima actualización.');
        expect(textOf('report', 'failed', reason))
            .toBe('❌ No se pudo enviar el reporte diario por email: error del servidor. Se reintentará en la próxima actualización.');
    });

    it('an unexpected error', () => {
        expect(textOf('report', 'failed', 'unexpected-error'))
            .toBe('❌ No se pudo enviar el reporte diario por email: error inesperado. Se reintentará en la próxima actualización.');
    });

    it.each([
        ['not-today', 'ℹ️ Reporte diario por email: no corresponde hoy.'],
        ['disabled', 'ℹ️ Reporte diario por email: desactivado.'],
        ['no-data', 'ℹ️ Reporte diario por email: sin datos de consumo todavía.'],
        ['session-expired', 'ℹ️ Reporte diario por email: sesión EPEC vencida.']
    ])('skipped %s', (reason, text) => {
        expect(buildEmailStatusLine(outcome('report', 'skipped', reason))).toEqual({ tone: 'neutral', text });
    });

    it('leaves the address out when there is no usable email', () => {
        expect(textOf('report', 'sent', 'sent', { recipient: null }))
            .toBe('✅ Reporte diario enviado por email a las 09:05.');
    });
});

describe('buildEmailStatusLine: threshold alert', () => {
    it('sent, with comma decimals', () => {
        expect(textOf('alert', 'sent', 'sent', { recipient, details: { average: 22.46, limit: 20, windowDays: 3 } }))
            .toBe('✅ Alerta de consumo enviada por email a fa•••@hotmail.com (usuario EPEC): promedio 22,5 kWh/día en los últimos 3 días, límite 20 kWh/día.');
    });

    it('sent with a one-day window uses the singular', () => {
        expect(textOf('alert', 'sent', 'sent', { recipient, details: { average: 30, limit: 12.5, windowDays: 1 } }))
            .toBe('✅ Alerta de consumo enviada por email a fa•••@hotmail.com (usuario EPEC): promedio 30 kWh/día en el último día, límite 12,5 kWh/día.');
    });

    it('already-sent', () => {
        expect(textOf('alert', 'already-sent', 'already-sent', { recipient }))
            .toBe('✅ La alerta de consumo de hoy ya fue enviada por email a fa•••@hotmail.com (usuario EPEC).');
    });

    it('failures name the alert with its article', () => {
        expect(textOf('alert', 'failed', 'timeout', { server }))
            .toBe('❌ No se pudo enviar la alerta de consumo por email: el servidor no responde (http://localhost:3000). Se reintentará en la próxima actualización.');
        expect(textOf('alert', 'failed', 'session-rejected', { status: 403 }))
            .toBe('❌ No se pudo enviar la alerta de consumo por email: EPEC rechazó la sesión. Ingresá a EPEC nuevamente.');
        expect(textOf('alert', 'failed', 'server-error', { status: 500 }))
            .toBe('❌ No se pudo enviar la alerta de consumo por email: error del servidor (código 500). Se reintentará en la próxima actualización.');
    });

    it('skipped below-threshold', () => {
        expect(textOf('alert', 'skipped', 'below-threshold', { details: { average: 18.04, limit: 20.5, windowDays: 3 } }))
            .toBe('ℹ️ Alerta de consumo: el promedio (18 kWh/día) está por debajo del límite (20,5 kWh/día). No se envió email.');
    });

    it('skipped invalid-threshold', () => {
        expect(textOf('alert', 'skipped', 'invalid-threshold'))
            .toBe('ℹ️ Alerta de consumo: configuración inválida, revisá los valores en Notificaciones.');
    });

    it.each([
        ['disabled', 'ℹ️ Alerta de consumo por email: desactivado.'],
        ['no-data', 'ℹ️ Alerta de consumo por email: sin datos de consumo todavía.'],
        ['session-expired', 'ℹ️ Alerta de consumo por email: sesión EPEC vencida.']
    ])('skipped %s', (reason, text) => {
        expect(textOf('alert', 'skipped', reason)).toBe(text);
    });
});

describe('buildEmailStatusLine: nothing to show', () => {
    it.each([undefined, null, {}, { kind: 'other', result: 'sent' }, { kind: 'report', result: 'weird' }])('returns null for %j', (value) => {
        expect(buildEmailStatusLine(value)).toBeNull();
    });
});

describe('formatKwh', () => {
    it.each([[12, '12'], [12.44, '12,4'], [12.46, '12,5'], [0, '0'], [987.25, '987,3']])('%d -> %s', (value, text) => {
        expect(formatKwh(value)).toBe(text);
    });
});
