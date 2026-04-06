import { Router } from 'express';
import * as storeController from '../controllers/store.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/', asyncHandler(storeController.create));
router.get('/', asyncHandler(storeController.list));
router.get('/:id', asyncHandler(storeController.getById));
router.put('/:id', asyncHandler(storeController.update));
router.delete('/:id', asyncHandler(storeController.remove));

export default router;
