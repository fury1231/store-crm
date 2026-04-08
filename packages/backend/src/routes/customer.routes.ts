import { Router } from 'express';
import * as customerController from '../controllers/customer.controller';
import * as tagController from '../controllers/tag.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';

const router = Router();

// All customer routes require an authenticated user.
router.use(asyncHandler(authenticate));

// Customers — every role can CRUD within their store. Store-scope enforcement
// lives in the service layer.
router.post('/', requirePermission('customers:write'), asyncHandler(customerController.create));
router.get('/', requirePermission('customers:read'), asyncHandler(customerController.list));
router.get('/:id', requirePermission('customers:read'), asyncHandler(customerController.getById));
router.put('/:id', requirePermission('customers:write'), asyncHandler(customerController.update));
router.delete('/:id', requirePermission('customers:write'), asyncHandler(customerController.remove));

// Customer-tag assignment — all roles inside a store may assign/unassign tags
// (the tag must already exist; CRUD on tags themselves is restricted separately).
router.post(
  '/:id/tags',
  requirePermission('tags:assign'),
  asyncHandler(tagController.assignToCustomer),
);
router.delete(
  '/:id/tags/:tagId',
  requirePermission('tags:assign'),
  asyncHandler(tagController.removeFromCustomer),
);

export default router;
