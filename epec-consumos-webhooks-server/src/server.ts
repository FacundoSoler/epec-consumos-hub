import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/authRoutes.js';
import epecApiRoutes from './routes/epecAPIroutes.js';
import webhooksRoutes from './routes/webhooksRoutes.js';

const app = express();
app.use(cors());
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/epec', epecApiRoutes);
app.use('/api/webhooks', webhooksRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Local Express server running on http://localhost:${PORT}`);
});