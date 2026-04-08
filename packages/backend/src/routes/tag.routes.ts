import { Router } from 'express';
import * as tagController from '../controllers/tag.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';

const router = Router();

// All tag routes require an authenticated user.
router.use(asyncHandler(authenticate));

// Reads — every role inside a store.
router.get('/', requirePermission('tags:read'), asyncHandler(tagController.list));

// Writes — ADMIN and MANAGER only (per the permissions matrix).
router.post('/', requirePermission('tags:write'), asyncHandler(tagController.create));
router.put('/:id', requirePermission('tags:write'), asyncHandler(tagController.update));
router.delete('/:id', requirePermission('tags:write'), asyncHandler(tagController.remove));

export default router;
