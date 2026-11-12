import { Router } from 'express';
import { handleSendEmail } from '../controllers/emailController.js';
import { requireEpecToken } from '../middleware/requireEpecToken.js';

const router = Router();

router.post('/sendEmailNotification', requireEpecToken, handleSendEmail);
router.post('/sendEmailAlert', requireEpecToken, handleSendEmail);

export default router;
