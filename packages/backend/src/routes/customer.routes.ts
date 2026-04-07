import { Router } from 'express';
import * as customerController from '../controllers/customer.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import { storeContext } from '../middleware/storeContext';
import { requirePermission } from '../middleware/authorize';

const router = Router();

// All customer routes require an authenticated user AND a resolved store
// context. The order matters: authenticate populates `req.user`, then
// storeContext uses that user (plus the optional X-Store-Id header) to set
// `req.storeId`. Services downstream rely on `req.storeId` being present.
router.use(asyncHandler(authenticate));
router.use(asyncHandler(storeContext));

// Customers — every role can CRUD within their store. Cross-store access is
// blocked at the service layer (returns 404, never 403, to avoid existence leaks).
router.post('/', requirePermission('customers:write'), asyncHandler(customerController.create));
router.get('/', requirePermission('customers:read'), asyncHandler(customerController.list));
router.get('/:id', requirePermission('customers:read'), asyncHandler(customerController.getById));
router.put('/:id', requirePermission('customers:write'), asyncHandler(customerController.update));
router.delete('/:id', requirePermission('customers:write'), asyncHandler(customerController.remove));

export default router;
