import { Request, Response, Router } from 'express';

/** No auth and no rate limit: it only proves the process is up, for local checks and Railway. */
export const handleHealthCheck = (_req: Request, res: Response) => res.status(200).json({ status: 'ok' });

const router = Router();

router.get('/', handleHealthCheck);

export default router;
