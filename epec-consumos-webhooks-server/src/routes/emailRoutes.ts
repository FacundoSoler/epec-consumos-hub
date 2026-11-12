import { Router } from 'express';
import { handleSendEmail } from '../controllers/emailController.js';

const router = Router();

router.post('/sendEmailNotification', handleSendEmail);
router.post('/sendEmailAlert', handleSendEmail);

export default router;
