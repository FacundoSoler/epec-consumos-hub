import type { Request, Response } from 'express';
import { getContractCurrentPeriod, getEpecData, getContratos, contratos } from '../services/epecAPIservice.js';
import { getToDate } from '../utils/utils.js';

export const handleGetContratos = async (req: Request, res: Response) => {
    try {
        const bearerToken = req.headers['bearertoken']?.toString();
        if (!bearerToken) throw new Error('No bearer token for handleGetContratos.');

        const response = await getContratos(bearerToken);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

        const data = await response.json();
        if (!data || data.length <= 0) throw new Error('No data found for Contracts');

        res.status(200).json({ status: 'success', data: data });
    } catch (error: any) {
        res.status(500).json({ status: `Failed to fetch Contracts. Error details: ${error.message}` });
    }
}

export const handleContratos = async (req: Request, res: Response) => {
    try {
        const bearerToken = req.headers['bearertoken']?.toString();
        if (!bearerToken) throw new Error('No bearer token for handleContratos.');

        const response = await contratos(bearerToken);
        if (!response.ok) throw new Error('Error fetching Contratos data from EPEC Api');

        const data = await response.json();
        if (!data || data.length <= 0) throw new Error('Error fetching Contratos data from EPEC Api');

        res.status(200).json({ status: 'success !', data: data });
    } catch (error: any) {
        console.error('Error fetching Contratos data from EPEC Api', error);
        res.status(500).json({ status: `Error while fetching Contratos from EPEC Api. Error details: ${error.message}` });
    }
}

export const handleGetContractCurrentPeriod = async (req: Request, res: Response) => {
    try {
        const bearerToken = req.headers['bearertoken']?.toString();
        const contractId = req.query['contractId']?.toString();

        if (!bearerToken || !contractId) throw new Error('No bearer token or contractId passed.');

        const response = await getContractCurrentPeriod(bearerToken, contractId);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

        const data = await response.json();
        if (!data || data.length <= 0) throw new Error('No data found for Contracts');

        res.status(200).json({ status: 'success', data: data });
    } catch (error: any) {
        res.status(500).json({ status: `Failed to fetch Contracts. Error details: ${error.message}` });
    }
}

export const handleGetEpecData = async (req: Request, res: Response) => {
    try {
        const bearerToken = req.headers['bearertoken']?.toString();
        const contractId = req.query['contractId']?.toString();
        const desde = req.query['desde']?.toString();
        const hasta = req.query['hasta']?.toString();

        if (!bearerToken || !contractId || !desde || !hasta) 
            throw new Error('Uno de los parametros de la consulta getEpecData no son validos');

        return await getEpecData(contractId, bearerToken, desde, hasta);

    } catch (error: any) {
        console.error(`❌ Failed to fetch EPEC consumption data:`, error.message);
        return res.status(400).json({
            success: false,
            error: error.message || 'Internal server error while syncing database context.'
        });
    }
}

export const handleGetEpecConsumptionData = async (req: Request, res: Response) => {
    try {
        const bearerToken = req.headers['bearertoken']?.toString();
        const contractId = req.query['contractId']?.toString();
        const desde = req.query['desde']?.toString();
        const hasta = req.query['hasta']?.toString();

        if (!bearerToken || !contractId || !desde || !hasta) 
            throw new Error('Uno de los parametros de la consulta getEpecData no son validos');

        const finalDesde = desde;
        const finalHasta = hasta || getToDate();
        const data = await getEpecData(contractId, bearerToken, finalDesde, finalHasta);

        if (!data || data.length === 0) {
            console.warn("⚠️ EPEC returned an empty dataset for this timeframe.");
            return res.status(404).json({ error: "No EPEC data available for the requested date range." });
        }

        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: `Failed to fetch data from EPEC. Error Details: ${error.message}` });
    }
}