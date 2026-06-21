import { Router } from 'express';
import { usersRouter } from './users.js';
import { listsRouter } from './lists.js';
import { itemsRouter } from './items.js';
const apiRouter = Router();
apiRouter.use('/users', usersRouter);
apiRouter.use('/lists', listsRouter);
apiRouter.use('/items', itemsRouter);
export { apiRouter };
