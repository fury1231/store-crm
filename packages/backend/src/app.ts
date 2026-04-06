import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
