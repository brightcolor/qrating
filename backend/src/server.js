import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { securityRouter } from './routes/security.js';
import { platformRouter } from './routes/platform.js';
import { eventPreviewRouter } from './routes/eventPreview.js';
import { publicRouter, setupHeader, setupUrlHeader } from './routes/public.js';
import { errorHandler, logServerError, notFound } from './middleware/errors.js';
import { runMigrations, seedDefaultData } from './db/bootstrap.js';
import { JobWorker } from './services/jobService.js';
import { query } from './db/pool.js';
import { corsOrigin } from './utils/security.js';
import { announceSetupCode } from './services/setupService.js';

const app = express();

app.set('trust proxy', env.trustProxy);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['content-type', 'authorization'],
  // Public pages read these two to lead to the first setup while it is open.
  exposedHeaders: [setupHeader, setupUrlHeader]
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/storage', express.static(path.join(process.cwd(), '..', 'storage')));

app.get('/health', (req, res) => res.json({ ok: true, name: 'qrating' }));
app.get('/health/live', (req, res) => res.json({ ok: true }));
// The answer says whether the database answers; what went wrong stands in the log under the
// reference it names.
app.get('/health/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: 'ok' });
  } catch (error) {
    const reference = logServerError(req, error);
    res.status(503).json({
      ok: false,
      database: 'error',
      error: `qrating ist nicht bereit, die Prüfabfrage an die Datenbank ist gescheitert. Die Einzelheiten stehen im Log des Backends unter der Fehlerkennung ${reference}.`,
      reference
    });
  }
});
app.use('/admin', (req, res, next) => {
  res.setHeader('cache-control', 'no-store');
  next();
});
app.use('/admin', authRouter);
app.use('/admin/platform', platformRouter);
app.use('/admin', eventPreviewRouter);
app.use('/admin', securityRouter);
app.use('/admin', adminRouter);
app.use('/public', publicRouter);
app.use(notFound);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  await runMigrations();
  await seedDefaultData();
  await announceSetupCode({ query });
  const worker = new JobWorker({ query }, { intervalMs: env.workerIntervalMs });
  worker.start();
  app.listen(env.port, () => {
    console.log(`qrating API listening on ${env.port}`);
  });
}

export { app };
