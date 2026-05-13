import dotenv from 'dotenv';

dotenv.config();

const normalizeUrl = (value) => String(value || '').replace(/\/+$/, '');
const nodeEnv = process.env.NODE_ENV || 'development';
const defaultAdminAppUrl = nodeEnv === 'production' ? 'https://qrating.app' : 'http://localhost:8080';
const defaultFeedbackAppUrl = nodeEnv === 'production' ? 'https://qrat.ing' : 'http://localhost:8080';

const adminAppUrl = normalizeUrl(process.env.ADMIN_APP_URL || process.env.PUBLIC_APP_URL || defaultAdminAppUrl);
const feedbackAppUrl = normalizeUrl(
  process.env.FEEDBACK_APP_URL || process.env.PUBLIC_FEEDBACK_URL || process.env.PUBLIC_APP_URL || defaultFeedbackAppUrl
);
const corsAllowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => normalizeUrl(origin.trim()))
  .filter(Boolean);

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://qrating:qrating@localhost:5432/qrating',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  pretixTokenSecret: process.env.PRETIX_TOKEN_SECRET || 'change-me-32-byte-secret-value!!',
  adminAppUrl,
  feedbackAppUrl,
  organizationName: process.env.ORGANIZATION_NAME || 'Demo Events',
  organizationSlug: process.env.ORGANIZATION_SLUG || 'demo-events',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 30),
  imageCacheMaxBytes: Number(process.env.IMAGE_CACHE_MAX_BYTES || 5242880),
  workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS || 5000),
  pretixSchedulerIntervalMs: Number(process.env.PRETIX_SCHEDULER_INTERVAL_MS || 60000),
  corsAllowedOrigins,
  billingAdminEmails: String(process.env.BILLING_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
};
