import { Router } from "express";
import { handleEmailNotification, handleEmailAlert } from '../controllers/emailController.js';

const router = Router();

router.get('/sendEmailNotification', handleEmailNotification);
router.get('/sendEmailAlert', handleEmailAlert);

export default router;