require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
const TWILIO_SANDBOX_NUMBER = process.env.TWILIO_SANDBOX_NUMBER;
const TWILIO_CONTENT_SID = process.env.TWILIO_CONTENT_SID;

const EPEC_BEARER_TOKEN = process.env.EPEC_BEARER_TOKEN;
const EPEC_API_KEY = process.env.EPEC_API_KEY;
const EPEC_CONTRACT_ID = process.env.EPEC_CONTRACT_ID;

// List of target phone numbers (Include country code, e.g., +54 9 351 ... )
const TWILIO_SANDBOX_PARTICIPANTS = process.env.TWILIO_SANDBOX_PARTICIPANTS ? process.env.TWILIO_SANDBOX_PARTICIPANTS.split(',') : [];

const TEST_TWILIO = false;
const twilioClient = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
const { MessagingResponse } = require('twilio').twiml;

let globalEpecReport = "No data available yet.";
let totAcumulado = 0;
let avgConsumo = 0;
let projConsumo = 0;
let lastConsumo;

// --- HELPER: WAKE UP TWILIO (USING SDK) ---
async function sendInitialTemplate(phoneNumber) {
    console.log(`[Twilio API] Firing wake-up template to ${phoneNumber}...`);

    try {
        const message = await twilioClient.messages.create({
            from: TWILIO_SANDBOX_NUMBER,
            to: phoneNumber,
            contentSid: process.env.CONTENT_SID,
            contentVariables: JSON.stringify({
                "1": "EPEC Reporte",
                "2": `RESUMEN: Ayer: *${Math.round(lastConsumo.consumo)}* kWh⚡ | ` +
                    `Acumulado Mes Actual: *${totAcumulado}* kWh⚡ | ` +
                    `Proyectado Mes: *${projConsumo}* kWh⚡ | ` +
                    `Escribe 'ok' y presiona el boton de enviar para recibir el reporte completo. `
            })
        });

        console.log(`✅ Template delivered to ${phoneNumber}. SID: ${message.sid}`);
    } catch (error) {
        console.error(`❌ Failed to send template to ${phoneNumber}:`, error.message);
    }
}

app.get('/api/test', (req, res) => {
    return res.status(200).json({ response: "success !" });
});

app.get('/api/getEpecConsumptionData', async (req, res) => {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
        return res.status(400).json({
            error: "Missing required query parameters. Expected: desde, hasta"
        });
    }

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
        res.json(data);

    } catch (error) {
        console.error(`❌ Failed to fetch EPEC consumption data:`, error.message);
        res.status(500).json({ error: "Failed to fetch data from upstream EPEC provider." });
    }
})

// --- ENDPOINT 1: RECEIVE DATA FROM CHROME EXTENSION ---
app.post('/api/epec', async (req, res) => {
    const { detalleConsumos, total, avg, projected } = req.body;

    if (!total || !avg || !projected) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    totAcumulado = total;
    avgConsumo = avg;
    projConsumo = projected;

    let detalle = '';
    for (let i = 0; i < detalleConsumos.length; i++) {
        detalle = detalle + `${detalleConsumos[i].fechaHora}: ${Math.round(detalleConsumos[i].consumo)} kWh \n`;
    }

    lastConsumo = detalleConsumos.at(-1);

    globalEpecReport = `📊 *Reporte EPEC Consumo Completo*\n\n` +
        `${detalle} \n` +
        `• Total consumo acumulado: ${totAcumulado} kWh\n` +
        `• Promedio consumo diario: ${avgConsumo} kWh\n` +
        `• Consumo mensual proyectado (28 días): ${projConsumo} kWh`;

    console.log("📥 Fresh EPEC data received from Chrome Extension.");

    // 2. Fire the wake-up messages to open the 24-hour window
    if (TEST_TWILIO) {
        for (const phone of PARTICIPANTS) {
            await sendInitialTemplate(phone);
        }
    }

    return res.status(200).json({ status: "success, templates dispatched" });
});

// --- ENDPOINT 2: HANDLE INCOMING REPLIES FROM WHATSAPP ---
app.post('/api/webhook', (req, res) => {
    const incomingText = req.body.Body ? req.body.Body.trim().toLowerCase() : "";
    const sender = req.body.From;

    console.log(`💬 Received message from ${sender}: "${incomingText}"`);

    // Initialize the TwiML response object
    const twiml = new MessagingResponse();

    // 3. Serve the cached data for free now that the window is open
    if (incomingText === 'ok' || incomingText === 'ready') {
        twiml.message(globalEpecReport);
        console.log(`🚀 Pushed custom report to ${sender}`);
    }
    // If the text doesn't match, the twiml object remains empty, 
    // safely generating an empty <Response></Response>

    // Output the generated XML string
    res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => {
    console.log(`🚀 Local Express server running on http://localhost:${PORT}`);
});