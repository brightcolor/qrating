// Deletion periods, read the same way by the privacy page, the deletion run and the guest page
// that stores a callback number, so what the page promises is what happens.
import { env } from '../config/env.js';

// Callback numbers follow the period of the organization; without one, the default of the installation.
export function phoneRetentionDays(organization) {
  return Number(organization?.retention_low_rating_phone_days) || env.retentionPhoneDefaultDays;
}

// A period the settings allow: whole days from RETENTION_MIN_DAYS to RETENTION_MAX_DAYS.
export function periodAllowed(days) {
  return Number.isInteger(days) && days >= env.retentionMinDays && days <= env.retentionMaxDays;
}
