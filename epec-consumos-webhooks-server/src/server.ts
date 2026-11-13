import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import emailRoutes from './routes/emailRoutes.js';
import { getPort } from './config.js';
import { getLogHashSecret } from './logger.js';
import { handleListenResult } from './listenResult.js';

getLogHashSecret();

const app = express();
app.use(cors());
const PORT = getPort();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/email', emailRoutes);

app.listen(PORT, (error) => handleListenResult(PORT, error));
