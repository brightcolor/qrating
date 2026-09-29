// Links that let a person choose a new password. They travel over the mail server of the
// installation or come from a command in the container, never over the mail server of an
// organization: whoever runs that one could read them and take the account over.
import { env } from '../config/env.js';
import { hashValue, randomToken } from '../utils/crypto.js';

export function resetValidity() {
  return env.passwordResetValidHours === 1 ? 'eine Stunde' : `${env.passwordResetValidHours} Stunden`;
}

// A fresh link for one account; a newer link replaces an older one.
export async function issueResetLink(db, user) {
  const token = randomToken(32);
  await db.query(
    `UPDATE users
     SET password_reset_token_hash = $2,
         password_reset_expires_at = now() + ($3 * interval '1 hour'),
         password_reset_requested_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [user.id, hashValue(token), env.passwordResetValidHours]
  );
  return `${env.adminAppUrl}/admin/reset-password?token=${token}`;
}
