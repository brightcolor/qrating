import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter } from './routes/public.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { runMigrations, seedDefaultData } from './db/bootstrap.js';
import { JobWorker } from './services/jobService.js';
import { query } from './db/pool.js';
import { corsOrigin } from './utils/security.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['content-type', 'authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/storage', express.static(path.join(process.cwd(), '..', 'storage')));

app.get('/health', (req, res) => res.json({ ok: true, name: 'qrating' }));
app.get('/health/live', (req, res) => res.json({ ok: true }));
app.get('/health/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: 'ok' });
  } catch (error) {
    res.status(503).json({ ok: false, database: 'error', error: error.message });
  }
});
app.use('/admin', (req, res, next) => {
  res.setHeader('cache-control', 'no-store');
  next();
});
app.use('/admin', authRouter);
app.use('/admin', adminRouter);
app.use('/public', publicRouter);
app.use(notFound);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  await runMigrations();
  await seedDefaultData();
  const worker = new JobWorker({ query }, { intervalMs: env.workerIntervalMs });
  worker.start();
  app.listen(env.port, () => {
    console.log(`qrating API listening on ${env.port}`);
  });
}

export { app };
