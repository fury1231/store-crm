import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import storeRoutes from './routes/store.routes';
import authRoutes from './routes/auth.routes';
import customerRoutes from './routes/customer.routes';

dotenv.config();

export const app = express();

// Global middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health checks
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/customers', customerRoutes);

// Error handling (must be after routes)
app.use(errorHandler);
