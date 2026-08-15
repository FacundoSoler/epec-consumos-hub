import { Router } from "express";
import { epecReportCronJob } from '../controllers/webhooksController';

const router = Router();

router.post('/epecReportCronJob', epecReportCronJob);

export default router;