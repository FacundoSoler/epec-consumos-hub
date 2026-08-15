import { Router } from 'express';
import { handleLogOff, handleSyncUser, handleTestAPI } from '../controllers/authController.js';

const router = Router();

router.post('/logoff', handleLogOff);
router.post('/sync-user', handleSyncUser);
router.get('/test', handleTestAPI);

export default router;