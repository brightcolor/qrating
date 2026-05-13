import { env } from '../config/env.js';
import crypto from 'crypto';

function originOf(value) {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

export function allowedOrigins() {
  const configured = [
    env.adminAppUrl,
    env.feedbackAppUrl,
    ...env.corsAllowedOrigins,
    env.nodeEnv !== 'production' ? 'http://localhost:8080' : null,
    env.nodeEnv !== 'production' ? 'http://localhost:5173' : null
  ].filter(Boolean);
  return new Set(configured.map(originOf).filter(Boolean));
}

export function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins().has(origin)) return callback(null, true);
  return callback(new Error('CORS origin is not allowed.'), false);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000
  };
}

export function setAdminCookie(res, token) {
  res.cookie('qrating_admin', token, adminCookieOptions());
}

export function clearAdminCookie(res) {
  res.clearCookie('qrating_admin', { path: '/', sameSite: 'lax', secure: env.nodeEnv === 'production' });
}

export function emailDomain(email) {
  const parts = String(email || '').trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : null;
}

export function emailHash(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHmac('sha256', env.pretixTokenSecret).update(normalized).digest('hex');
}

export function publicOrganization(organization = {}) {
  if (!organization) return null;
  return {
    name: organization.name,
    slug: organization.slug,
    logoUrl: organization.logo_url,
    primaryColor: organization.primary_color,
    privacyText: organization.privacy_text,
    footerText: organization.footer_text,
    websiteUrl: organization.website_url,
    ticketshopUrl: organization.ticketshop_url,
    instagramUrl: organization.instagram_url,
    facebookUrl: organization.facebook_url,
    branding: organization.branding || {},
    defaultLanguage: organization.default_language
  };
}

export function publicEventStatus(event = {}) {
  if (!event) return null;
  return {
    name: event.name,
    dateFrom: event.date_from,
    dateTo: event.date_to,
    location: event.location,
    imageUrl: event.image_url || event.cached_image_url || null,
    imageAlt: event.image_alt || (event.name ? `Bild zu ${event.name}` : null),
    organization: publicOrganization({
      name: event.organization_name,
      slug: event.organization_slug,
      logo_url: event.logo_url,
      primary_color: event.primary_color,
      privacy_text: event.privacy_text,
      footer_text: event.footer_text,
      branding: event.branding,
      default_language: event.default_language
    })
  };
}
