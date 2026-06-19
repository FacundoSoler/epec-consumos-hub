require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FIXED_START_DATE = "050620260000"; // Fixed: 05/06/2026 00:00

const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
const TWILIO_SANDBOX_NUMBER = process.env.TWILIO_SANDBOX_NUMBER;
const TWILIO_CONTENT_SID = process.env.TWILIO_CONTENT_SID;
// List of target phone numbers (Include country code, e.g., +54 9 351 ... )
const TWILIO_SANDBOX_PARTICIPANTS = process.env.TWILIO_SANDBOX_PARTICIPANTS ? process.env.TWILIO_SANDBOX_PARTICIPANTS.split(',') : [];

const EPEC_BEARER_TOKEN = process.env.EPEC_BEARER_TOKEN;
const EPEC_API_KEY = process.env.EPEC_API_KEY;
const EPEC_CONTRACT_ID = process.env.EPEC_CONTRACT_ID;

const TEST_TWILIO = true;
const twilioClient = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
const { MessagingResponse } = require('twilio').twiml;

let globalEpecReport = "No data available yet.";

const getToDate = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}`;
};

// --- HELPER: WAKE UP TWILIO (USING SDK) from Cron Job ---
async function sendInitialTwilioTemplate(phoneNumber, lastConsumption, totalAcumulado, projectedConsumption) {
    console.log(`[Twilio API] Firing wake-up template to ${phoneNumber}...`);

    try {
        const message = await twilioClient.messages.create({
            from: TWILIO_SANDBOX_NUMBER,
            to: phoneNumber,
            contentSid: process.env.TWILIO_CONTENT_SID,
            contentVariables: JSON.stringify({
                "1": "EPEC Reporte",
                "2": `RESUMEN: Ayer: *${Math.round(lastConsumption)}* kWh⚡ | ` +
                    `Acumulado Mes Actual: *${totalAcumulado}* kWh⚡ | ` +
                    `Proyectado Mes: *${projectedConsumption}* kWh⚡ | ` +
                    `Escribe 'ok' y presiona el boton de enviar para recibir el reporte completo. `
            })
        });

        console.log(`✅ Template delivered to ${phoneNumber}. SID: ${message.sid}`);
    } catch (error) {
        console.error(`❌ Failed to send template to ${phoneNumber}:`, error.message);
    }
}

async function getEpecData(desde, hasta) {
    const url = `https://www.epec.com.ar/api/usuarios/contratos/${EPEC_CONTRACT_ID}/consumos/con-telemedicion/MED_INTELIGENTE/CONSUMO_DIARIO?desde=${desde}&hasta=${hasta}`;

    try {
        const response = await fetch(url, {
            headers: {
                "apiKey": EPEC_API_KEY,
                "Authorization": `Bearer ${EPEC_BEARER_TOKEN}`
            }
        });

        if (!response.ok) {
            throw new Error(`EPEC API responded with status ${response.status}`);
        }

        const data = await response.json();
        const sanitizedData = data
            .filter(item => item.consumo && item.consumo.toString().trim() !== '')
            .map(item => ({
                consumo: String(item.consumo).replace(/,/g, '.'),
                fechaHora: item.fechaHora,
                dateSorting: new Date(item.fechaHora).getTime()
            }));

        sanitizedData.sort((a, b) => a.dateSorting - b.dateSorting);
        return sanitizedData;

    } catch (error) {
        console.error(`❌ Failed to fetch EPEC consumption data:`, error.message);
        throw error;
    }
}

app.get('/api/getEpecConsumptionData', async (req, res) => {
    // 1. Extract params, but don't force them
    const { desde, hasta } = req.query;

    // 2. Use provided params, OR fall back to the defaults
    const finalDesde = desde || FIXED_START_DATE;
    const finalHasta = hasta || getToDate();

    try {
        const data = await getEpecData(finalDesde, finalHasta);

        if (!data || data.length === 0) {
            console.warn("⚠️ EPEC returned an empty dataset for this timeframe.");
            return res.status(404).json({ error: "No EPEC data available for the requested date range." });
        }

        res.json(data);
    } catch (error) {
        // Add a catch block so your server doesn't hang if EPEC fails
        res.status(500).json({ error: "Failed to fetch data from EPEC." });
    }
});

// --- ENDPOINT 1: We receive the ping from the Cron Job to fire up the first Twilio message initiator
app.post('/api/epecReportCronJob', async (req, res) => {
    try {
        const hasta = getToDate();
        const data = await getEpecData(FIXED_START_DATE, hasta);

        if (!data || data.length === 0) {
            console.warn("⚠️ EPEC returned an empty dataset for this timeframe.");
            return res.status(404).json({ error: "No EPEC data available for the requested date range." });
        }

        let finalTotal = 0;
        data.forEach(element => {
            finalTotal += parseFloat(element.consumo) || 0;
        });

        let finalAvg = finalTotal / data.length;
        let finalProjected = Math.round(finalAvg * 28);
        finalTotal = Math.round(finalTotal);
        finalAvg = Math.round(finalAvg);

        let detalle = '';
        for (let i = 0; i < data.length; i++) {
            detalle = detalle + `${data[i].fechaHora}: ${Math.round(data[i].consumo)} kWh \n`;
        }

        const lastConsumption = data.at(-1);

        globalEpecReport = `📊 *Reporte EPEC Consumo Completo*\n\n` +
            `${detalle} \n` +
            `• Total consumo acumulado: ${finalTotal} kWh\n` +
            `• Promedio consumo diario: ${finalAvg} kWh\n` +
            `• Consumo mensual proyectado (28 días): ${finalProjected} kWh`;

        console.log("📥 Fresh EPEC data received from Chrome Extension.");

        // 2. Fire the wake-up messages to open the 24-hour window
        if (TEST_TWILIO) {
            for (const phone of TWILIO_SANDBOX_PARTICIPANTS) {
                await sendInitialTwilioTemplate(phone, lastConsumption.consumo, finalTotal, finalProjected);
            }
        }

        return res.status(200).json({ status: "success, templates dispatched" });
    } catch (error) {
        console.error(`❌ Failed to trigger report cron job:`, error.message);
        return res.status(500).json({ status: "error triggering report cron job" });
    }
});

// --- ENDPOINT 2: HANDLE INCOMING REPLIES FROM WHATSAPP (from initial Appointment twilio initiator) ---
app.post('/api/webhook', (req, res) => {
    try {
        const incomingText = req.body.Body ? req.body.Body.trim().toLowerCase() : "";
        const sender = req.body.From;

        console.log(`💬 Received message from ${sender}: "${incomingText}"`);

        const twiml = new MessagingResponse();

        // 3. Serve the cached data for free now that the window is open
        if (incomingText === 'ok' || incomingText === 'ready') {
            twiml.message(globalEpecReport);
            console.log(`🚀 Pushed custom report to ${sender}`);
        }

        res.type('text/xml').send(twiml.toString());
    } catch (error) {
        console.error('error receiving Twilio whatsapp reply from user', error.message);
    }
});

app.get('/api/test', (req, res) => {
    return res.status(200).json({ response: "success !" });
});

app.listen(PORT, () => {
    console.log(`🚀 Local Express server running on http://localhost:${PORT}`);
});