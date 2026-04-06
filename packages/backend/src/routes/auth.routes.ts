import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import { loginRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', asyncHandler(authController.register));
router.post('/login', loginRateLimiter, asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.post('/refresh', asyncHandler(authController.refresh));
router.get('/me', asyncHandler(authenticate), asyncHandler(authController.me));

export default router;
