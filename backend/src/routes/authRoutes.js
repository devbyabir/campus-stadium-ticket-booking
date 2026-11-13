import { Router } from 'express';
import { login, signup } from '../controllers/authController.js';
import { dbRateLimit } from '../middleware/dbRateLimit.js';

const router = Router();
const authLimit = dbRateLimit('auth', 20);
const handle = (controller) => (req, res, next) => Promise.resolve(controller(req, res)).catch(next);

router.post('/signup', authLimit, handle(signup));
router.post('/login', authLimit, handle(login));

export default router;
