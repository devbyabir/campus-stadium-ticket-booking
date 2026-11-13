import { Router } from 'express';
import { listEvents, eventSeats } from '../controllers/eventController.js';
const router = Router();
const handle = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.get('/', handle(listEvents));
router.get('/:id/seats', handle(eventSeats));
export default router;
