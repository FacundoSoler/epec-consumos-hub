import { Router } from "express";
import { epecReportCronJob } from '../controllers/webhooksController.js';

const router = Router();

router.post('/epecReportCronJob', epecReportCronJob);

export default router;