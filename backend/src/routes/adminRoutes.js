import { Router } from 'express';
import { getStats } from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router = Router();
router.get('/stats', requireAuth, requireRole('admin'), (req, res, next) => Promise.resolve(getStats(req, res)).catch(next));
export default router;
