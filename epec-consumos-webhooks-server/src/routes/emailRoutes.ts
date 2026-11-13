import { Router } from 'express';
import { handleSendEmail } from '../controllers/emailController.js';
import { requireEpecToken } from '../middleware/requireEpecToken.js';
import { limitOneEmailPerDay } from '../middleware/limitOneEmailPerDay.js';

const router = Router();

router.post('/sendEmailNotification', requireEpecToken, limitOneEmailPerDay('report'), handleSendEmail);
router.post('/sendEmailAlert', requireEpecToken, limitOneEmailPerDay('alert'), handleSendEmail);

export default router;
