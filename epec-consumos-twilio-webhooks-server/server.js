import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken'
import { pool, query } from './db/db.js';
import { deleteUserAndCleanupContracts } from './db/repository.js';
import { encrypt, decrypt } from './db/encryption.js';

const app = express();
app.use(cors());
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EPEC_API_KEY = process.env.EPEC_API_KEY;
const EPEC_API_BASE_URL = process.env.EPEC_API_BASE_URL;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD
    }
});

async function sendEmail(subject, htmlContent, sendToEmailAddress) {
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

function processUserToken(token) {
    try {
        let payload = jwt.decode(token);
        if (!payload) {
            throw new Error("El token es inválido o no se pudo decodificar.");
        }

        const sub = payload.sub;
        const email = payload.email.toLowerCase();
        const documento = payload.documento;
        
        const userDetails = [documento, email, sub];
        return { userDetails };

    } catch (error) {
        console.error("Error procesando el token:", error.message);
        // Manejar el error adecuadamente (ej. retornar 401 Unauthorized)
        return null;
    }
}

async function processNotifications() {
    const client = await pool.connect();

    try {
        const notificationsUsers = await client.query(`
            SELECT u.email_address, u.phone_number, u.app_user_name, u.token, uc.contract_id, up.preferences
            FROM users u
            JOIN user_preferences up ON up.user_id = u.id
            JOIN user_contracts uc ON uc.user_id = u.id
            WHERE (up.preferences::jsonb -> 'email_reports' -> 'days') @> jsonb_build_array(extract(isodow from current_date)::integer)
            AND (up.preferences::jsonb -> 'email_reports' ->> 'enabled')::boolean = true;
        `);

        if (notificationsUsers.rows.length === 0) {
            console.warn('⚠️ [Worker] Ejecución terminada: No se encontraron usuarios con notificaciones activas.');
            return;
        }

        const contractsSet = new Set(notificationsUsers.rows.map(row => row.contract_id));
        for (const contractId of contractsSet) {
            // process each contract by querying EPEC's API once per contract (we'll query EPEC data once) then send respective 
            // notifications to each user sharing the contract. This way we efficientizise the processing from the DB / APIs.

            const usersSharingContract = notificationsUsers.rows.filter(x => x.contract_id === contractId);
            const firstUser = usersSharingContract.slice(0, 1)[0];
            const decryptedToken = decrypt(firstUser.token);
            const response = await getContractCurrentPeriod(decryptedToken, contractId);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

            const dataContractCurrentPeriod = await response.json();
            if (!dataContractCurrentPeriod || dataContractCurrentPeriod.length <= 0) throw new Error('No data found for Contracts');

            const desde = dataContractCurrentPeriod.desde;
            const hasta = getToDate();
            const data = await getEpecData(contractId, decryptedToken, desde, hasta);

            if (!data || data.length === 0) {
                console.warn("⚠️ EPEC returned an empty dataset for this timeframe.");
                return res.status(404).json({ error: "No EPEC data available for the requested date range." });
            }

            const { detalleConsumo, finalTotal, finalAvg, finalProjected } = getConsumptionMetrics(data);
            const lastConsumption = data.at(-1);

            const fechaActual = new Date();
            const diaDeLaSemana = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(fechaActual);
            const diaDeLaSemanaCapitalizado = diaDeLaSemana.toUpperCase();
            console.log(diaDeLaSemanaCapitalizado);

            for (const user of usersSharingContract) {
                if (user.preferences.email_reports.enabled) {

                    const daysSelected = user.preferences.email_reports.days.map(x => x.toUpperCase());
                    const isDaySelectedToday = daysSelected.includes(diaDeLaSemanaCapitalizado);

                    if (isDaySelectedToday) {
                        const detailsList = data.map(item => {
                            return `${item.fechaHora}: <b>${Math.round(item.consumo)} kWh</b>`;
                        });

                        const jointDetailsList = detailsList.join('<br>');
                        const nombreUsuario = user.app_user_name;
                        const emailBody = `<p>Hola, ${nombreUsuario}.</p><p>A continuación, el detalle de consumos diario:</p><p>${jointDetailsList}</p>`;

                        await sendEmail(`Consumo electrico reporte diario - ${nombreUsuario}`, emailBody, user.email_address);
                    }
                }

                if (user.preferences.email_alerts.enable) {
                    const CONSUMPTION_THRESHOLD_METRIC = user.preferences.threshold.kwh_limit_per_day;
                    const CONSUMPTION_DAYS_METRIC = user.preferences.threshold.rolling_days_window;

                    if (!CONSUMPTION_DAYS_METRIC || !CONSUMPTION_DAYS_METRIC) console.warn('threshold and days metric values not found.');
                    if (isNaN(CONSUMPTION_THRESHOLD_METRIC) || isNaN(CONSUMPTION_DAYS_METRIC)) console.warn('threshold and days metric values NaN');

                    const numberofDaysToMeasure = data.length - CONSUMPTION_DAYS_METRIC;
                    const lastConsumptionMetrics = data.slice(numberofDaysToMeasure);

                    const lastDaysAccumulatedConsumption = lastConsumptionMetrics.reduce((total, x) => total + parseFloat(x.consumo), 0);
                    const averageConsumption = Math.round(lastDaysAccumulatedConsumption / CONSUMPTION_DAYS_METRIC);

                    if (averageConsumption > CONSUMPTION_THRESHOLD_METRIC) {
                        console.log('THRESHOLD exceeded:', averageConsumption);

                        //await sendWhatsAppAlert(user.phone_Number, desde, hasta, detalleConsumo);
                    }
                }
            }
        };

    } catch (error) {
        console.error('Failed to send notifications.', error);
        throw error;
    }
}

async function syncUserContext(payload) {
    const { documento, emailAddress, fullName, token, contratos, notificationsPreferences } = payload;

    const emailEnabled = notificationsPreferences?.email_reports?.enabled === true;
    const whatsappEnabled = notificationsPreferences?.email_alerts?.enabled === true;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (!emailEnabled && !whatsappEnabled) {
            await client.query(`
                DELETE FROM users 
                WHERE documento = $1;
            `, [documento]);

            await client.query('COMMIT');
            return { success: true, synced: false };
        }

        const userCheck = await client.query(`
            SELECT id FROM users WHERE documento = $1;
        `, [documento]);

        if (userCheck.rows.length > 0) {
            const userId = userCheck.rows[0].id;

            // Insertar o actualizar únicamente las preferencias
            await client.query(`
                INSERT INTO user_preferences (user_id, preferences)
                VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE SET 
                    preferences = EXCLUDED.preferences,
                    updated_at = CURRENT_TIMESTAMP;
            `, [userId, JSON.stringify(notificationsPreferences)]);

            await client.query('COMMIT');
            return { success: true, synced: true, userId, optimized: true };
        }

        /* 
           ARCHITECTURAL INTENT: Nullify contact paths if their specific 
           notification vector is disabled to maintain data minimization.
        */
        const targetEmail = emailEnabled ? emailAddress.toLowerCase().trim() : null;
        const targetPhoneNumber = whatsappEnabled ? payload.phoneNumber : null;

        const userRes = await client.query(`
            INSERT INTO users (documento, email_address, phone_number, app_user_name, token)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (documento) DO UPDATE SET 
                email_address = EXCLUDED.email_address,
                phone_number = EXCLUDED.phone_number,
                token = EXCLUDED.token,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id;
        `, [documento, targetEmail, targetPhoneNumber, fullName, encrypt(token)]);

        const userId = userRes.rows[0].id;

        await client.query(`
            INSERT INTO user_preferences (user_id, preferences)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET 
                preferences = EXCLUDED.preferences,
                updated_at = CURRENT_TIMESTAMP;
        `, [userId, JSON.stringify(notificationsPreferences)]);

        if (contratos && Array.isArray(contratos)) {
            await syncUserContracts(client, userId, contratos);
        }

        await client.query('COMMIT');
        return { success: true, synced: true, userId };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction failed, rolled back:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function syncUserContracts(client, userId, contratos) {
    for (const contrato of contratos) {
        await client.query(`
            INSERT INTO contracts (contract_id, client_number, owner_name, address)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (contract_id) DO UPDATE SET 
                owner_name = EXCLUDED.owner_name,
                address = EXCLUDED.address,
                updated_at = CURRENT_TIMESTAMP;
        `, [contrato.id, contrato.nroCliente, contrato.razonSocial, contrato.direccion]);

        await client.query(`
            INSERT INTO user_contracts (user_id, contract_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, contract_id) DO NOTHING;
        `, [userId, contrato.id]);
    }
}

app.post('/api/sync-user', async (req, res) => {
    try {
        const payload = req.body;

        const notificationsPreferences = payload.notificationsPreferences;

        if (notificationsPreferences?.email_reports?.enabled && notificationsPreferences.email_reports.days.length <= 0) {
            return res.status(400).json({ success: false, error: 'No ha seteado Dias para notificaciones Email.' });
        }

        if (notificationsPreferences?.email_alerts?.enabled) {
            if (parseInt(notificationsPreferences.email_alerts.threshold.kwh_limit_per_day) <= 0 ||
                parseInt(notificationsPreferences.email_alerts.threshold.rolling_days_window) <= 0) {
                return res.status(400).json({ success: false, error: 'No ha seteado valores para notificaciones Whatsapp.' });
            }

            const kwhLimit = Number(notificationsPreferences?.email_alerts?.threshold.kwh_limit_per_day);
            const rollingDays = parseInt(notificationsPreferences.email_alerts.threshold.rolling_days_window, 10);

            if (isNaN(kwhLimit) || kwhLimit <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'El consumo promedio por día debe ser un número positivo mayor a 0.'
                });
            }

            if (isNaN(rollingDays) || rollingDays < 1 || rollingDays > 31) {
                return res.status(400).json({
                    success: false,
                    error: 'La ventana de días móviles debe ser un número entero positivo entre 1 y 31.'
                });
            }
        }

        const result = await syncUserContext(payload);

        return res.status(200).json({
            success: true,
            message: 'User context and preferences synchronized successfully.',
            userId: result.userId
        });

    } catch (error) {
        console.error('Error handling /api/sync-user payload:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error while syncing database context.'
        });
    }
});

const getToDate = () => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" }));
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};

app.get('/api/getContratos', async (req, res) => {
    try {
        const bearerToken = req.headers['bearertoken'];
        const url = `${EPEC_API_BASE_URL}/api/usuarios/contratos`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                apikey: EPEC_API_KEY
            }
        });

        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

        const data = await response.json();
        if (!data || data.length <= 0) throw new Error('No data found for Contracts');

        res.status(200).json({ status: 'success', data: data });
    } catch (error) {
        res.status(500).json({ status: `Failed to fetch Contracts. Error details: ${error.message}` });
    }
});

app.get('/api/getContractCurrentPeriod', async (req, res) => {
    try {
        const bearerToken = req.headers['bearertoken'];
        const contractId = req.query['contractId'];

        const response = await getContractCurrentPeriod(bearerToken, contractId);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

        const data = await response.json();
        if (!data || data.length <= 0) throw new Error('No data found for Contracts');

        res.status(200).json({ status: 'success', data: data });
    } catch (error) {
        res.status(500).json({ status: `Failed to fetch Contracts. Error details: ${error.message}` });
    }
});

async function getContractCurrentPeriod(bearerToken, contractId) {
    const url = `${EPEC_API_BASE_URL}/usuarios/contratos/${contractId}/consumos/tipo-medicion`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            apikey: EPEC_API_KEY
        }
    });

    return response;
}

async function getEpecData(contractId, bearerToken, desde, hasta) {
    const url = `${EPEC_API_BASE_URL}/usuarios/contratos/${contractId}/consumos/con-telemedicion/MED_INTELIGENTE/CONSUMO_DIARIO?desde=${desde}&hasta=${hasta}`;

    try {
        const response = await fetch(url, {
            headers: {
                "apiKey": EPEC_API_KEY,
                "Authorization": `Bearer ${bearerToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`EPEC API responded with status ${response.status}`);
        }

        const data = await response.json();
        const sanitizedData = data
            .filter(item => item.consumo && item.consumo.toString().trim() !== '')
            .map(item => {
                const [day, month, year] = item.fechaHora.split('/');
                const parsedDate = new Date(year, month - 1, day);

                return {
                    consumo: String(item.consumo).replace(/,/g, '.'),
                    fechaHora: item.fechaHora,
                    dateSorting: parsedDate.getTime()
                };
            });

        sanitizedData.sort((a, b) => b.dateSorting - a.dateSorting);
        return sanitizedData;

    } catch (error) {
        console.error(`❌ Failed to fetch EPEC consumption data:`, error.message);
        throw error;
    }
}

function getConsumptionMetrics(data) {
    let finalTotal = 0;
    data.forEach(element => {
        finalTotal += parseFloat(element.consumo) || 0;
    });

    let finalAvg = finalTotal / data.length;
    let finalProjected = Math.round(finalAvg * 28);
    finalTotal = Math.round(finalTotal);
    finalAvg = Math.round(finalAvg);

    let detalleConsumo = '';
    for (let i = 0; i < data.length; i++) {
        detalleConsumo = detalleConsumo + `${data[i].fechaHora}: ${Math.round(data[i].consumo)} kWh \n`;
    }

    return { detalleConsumo, finalTotal, finalAvg, finalProjected };
}

function getFullEPECReport(detalleConsumo, finalTotal, finalAvg, finalProjected) {
    const globalEpecReport = `📊 *Reporte EPEC Consumo Completo*\n\n` +
        `${detalleConsumo} \n` +
        `• Total consumo acumulado: ${finalTotal} kWh\n` +
        `• Promedio consumo diario: ${finalAvg} kWh\n` +
        `• Consumo mensual proyectado (28 días): ${finalProjected} kWh`;
    return globalEpecReport;
}

app.get('/api/contratos', async (req, res) => {
    try {
        const url = `${EPEC_API_BASE_URL}/usuarios/contratos`;
        const bearerToken = req.headers['bearertoken'];

        const response = await fetch(url, {
            headers: {
                apikey: EPEC_API_KEY,
                Authorization: `Bearer ${bearerToken}`
            }
        });

        if (!response.ok) throw new Error('Error fetching Contratos data from EPEC Api');

        const data = await response.json();
        if (!data || data.length <= 0) throw new Error('Error fetching Contratos data from EPEC Api');

        res.status(200).json({ status: 'success !', data: data });
    } catch (error) {
        console.error('Error fetching Contratos data from EPEC Api', error);
        res.status(500).json({ status: `Error while fetching Contratos from EPEC Api. Error details: ${error.message}` });
    }
});

app.get('/api/getEpecConsumptionData', async (req, res) => {
    const { contractId, desde, hasta } = req.query;
    const bearerToken = req.headers['bearertoken'];

    // 2. Use provided params, OR fall back to the defaults
    const finalDesde = desde;
    const finalHasta = hasta || getToDate();

    try {
        const data = await getEpecData(contractId, bearerToken, finalDesde, finalHasta);

        if (!data || data.length === 0) {
            console.warn("⚠️ EPEC returned an empty dataset for this timeframe.");
            return res.status(404).json({ error: "No EPEC data available for the requested date range." });
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: `Failed to fetch data from EPEC. Error Details: ${error.message}` });
    }
});

// --- ENDPOINT 1: We receive the ping from the Cron Job to fire up daily reports and alerts
app.post('/api/epecReportCronJob', async (req, res) => {
    try {
        const apiKey = req.headers["apikey"];
        if (process.env.CRON_JOB_API_KEY !== apiKey) {
            return res.status(401).json({ error: "Unauthorized access. Request rejected." });
        }

        await processNotifications();

        return res.status(200).json({ status: "success, templates dispatched" });
    } catch (error) {
        console.error(`❌ Failed to trigger report cron job:`, error.message);
        return res.status(500).json({ status: "error triggering report cron job. Error Details: " + error.message });
    }
});

app.post('/api/auth/logoff', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos (token).' });
    }

    try {
        const url = `${EPEC_API_BASE_URL}/usuarios/servicios`;
        const response = await fetch(url, {
            headers: {
                apikey: EPEC_API_KEY,
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.warn(`⚠️ Intento de logoff con token inválido rechazado por EPEC para el documento: ${documento}`);
            return res.status(401).json({ error: 'Sesión inválida o expirada en EPEC. No se puede procesar la baja.' });
        }

        const userDetails = processUserToken(token);
        const result = await deleteUserAndCleanupContracts(userDetails.documento, userDetails.email, userDetails.sub);
        if (!result.success) {
            return res.status(404).json({ error: result.message });
        }

        return res.status(200).json({
            success: true,
            message: 'Usuario, preferencias y contratos huérfanos eliminados correctamente.'
        });

    } catch (error) {
        console.error('Error crítico en el endpoint de logoff:', error);
        return res.status(500).json({ error: 'Error interno del servidor al procesar la baja.' });
    }
});

app.post('/api/test', (req, res) => {
    return res.status(200).json({ response: "success !" });
});

app.listen(PORT, () => {
    console.log(`🚀 Local Express server running on http://localhost:${PORT}`);
});