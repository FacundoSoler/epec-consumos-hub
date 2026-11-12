import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import emailRoutes from './routes/emailRoutes.js';

const app = express();
app.use(cors());
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/email', emailRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Local Express server running on http://localhost:${PORT}`);
});