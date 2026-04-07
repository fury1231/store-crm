import { Router } from 'express';
import * as storeController from '../controllers/store.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import { storeContext } from '../middleware/storeContext';
import { requirePermission } from '../middleware/authorize';

const router = Router();

// All store routes require an authenticated user. `storeContext` then
// resolves the active store id and the user's accessible store scope —
// list/getById/update/delete all consult `req.availableStoreIds`.
router.use(asyncHandler(authenticate));
router.use(asyncHandler(storeContext));

// Reads — any role (ADMIN/MANAGER/STAFF). Service layer enforces the
// per-user store scope.
router.get('/', requirePermission('stores:read'), asyncHandler(storeController.list));
router.get('/:id', requirePermission('stores:read'), asyncHandler(storeController.getById));

// Writes — ADMIN only.
router.post('/', requirePermission('stores:write'), asyncHandler(storeController.create));
router.put('/:id', requirePermission('stores:write'), asyncHandler(storeController.update));
router.delete('/:id', requirePermission('stores:write'), asyncHandler(storeController.remove));

export default router;
