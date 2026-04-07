import { Router } from 'express';
import * as storeController from '../controllers/store.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';

const router = Router();

// All store routes require an authenticated user.
router.use(asyncHandler(authenticate));

// Reads — any role (ADMIN/MANAGER/STAFF). Service layer enforces store ownership.
router.get('/', requirePermission('stores:read'), asyncHandler(storeController.list));
router.get('/:id', requirePermission('stores:read'), asyncHandler(storeController.getById));

// Writes — ADMIN only.
router.post('/', requirePermission('stores:write'), asyncHandler(storeController.create));
router.put('/:id', requirePermission('stores:write'), asyncHandler(storeController.update));
router.delete('/:id', requirePermission('stores:write'), asyncHandler(storeController.remove));

export default router;
