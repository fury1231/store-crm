import { Router } from 'express';
import * as customerController from '../controllers/customer.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/', asyncHandler(customerController.create));
router.get('/', asyncHandler(customerController.list));
router.get('/:id', asyncHandler(customerController.getById));
router.put('/:id', asyncHandler(customerController.update));
router.delete('/:id', asyncHandler(customerController.remove));

export default router;
