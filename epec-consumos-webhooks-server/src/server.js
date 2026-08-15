import express from 'express';
import cors from 'cors';

import authRoutes from './routes/authRoutes.ts';
import epecApiRoutes from './routes/epecAPIroutes.ts';
import webhooksRoutes from './routes/webhooksRoutes.ts';

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