import express from 'express';
import { createInventoryRoutes } from './routes/inventoryRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
export function createApp(service) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1', createInventoryRoutes(service));
  app.use((req, res) =>
    res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found', details: {} }),
  );
  app.use(errorHandler);
  return app;
}
