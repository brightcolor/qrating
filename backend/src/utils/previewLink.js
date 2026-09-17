import crypto from 'crypto';
import { env } from '../config/env.js';

// A preview link opens the guest page of one event outside its feedback window.
// It carries an expiry and a signature, so only the admin area can hand it out.
export const previewValidityMs = 2 * 60 * 60 * 1000;

function sign(eventToken, expiresAt) {
  return crypto
    .createHmac('sha256', env.sessionSecret)
    .update(`preview:${eventToken}:${expiresAt}`)
    .digest('base64url');
}

export function createPreviewToken(eventToken, now = Date.now(), validityMs = previewValidityMs) {
  const expiresAt = now + validityMs;
  return `${expiresAt}.${sign(eventToken, expiresAt)}`;
}

export function verifyPreviewToken(eventToken, value, now = Date.now()) {
  const [expiresPart, signature] = String(value ?? '').split('.');
  const expiresAt = Number(expiresPart);
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = Buffer.from(sign(eventToken, expiresAt));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
