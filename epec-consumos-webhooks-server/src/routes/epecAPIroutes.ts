import { Router } from "express";
import { handleGetContractCurrentPeriod, handleContratos, handleGetContratos, handleGetEpecData, handleGetEpecConsumptionData } from '../controllers/epecAPIcontroller.js';

const router = Router();

router.get('/getContractCurrentPeriod', handleGetContractCurrentPeriod);
router.get('/getContratos', handleGetContratos);
router.get('/contratos', handleContratos);
router.get('/getEpecData', handleGetEpecData);
router.get('/getEpecConsumptionData', handleGetEpecConsumptionData);

export default router;