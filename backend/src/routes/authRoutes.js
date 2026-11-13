import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, signup } from '../controllers/authController.js';

const router = Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const handle = (controller) => (req, res, next) => Promise.resolve(controller(req, res)).catch(next);

router.post('/signup', authLimit, handle(signup));
router.post('/login', authLimit, handle(login));

export default router;
