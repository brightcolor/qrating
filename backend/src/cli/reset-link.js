// Shows a link to set a new password for one account. For an installation without a mail server
// of its own, or for an account whose mails do not arrive. Run it in the container:
//   docker compose exec backend node src/cli/reset-link.js person@example.com
import { pool, query } from '../db/pool.js';
import { issueResetLink, resetValidity } from '../services/passwordResetService.js';
import { writeAudit } from '../services/auditService.js';

const email = String(process.argv[2] || '').trim().toLowerCase();

try {
  const user = email ? (await query('SELECT * FROM users WHERE email = $1', [email])).rows[0] : null;
  if (!email) {
    console.error('qrating: Nenne die E-Mail-Adresse des Kontos, etwa: node src/cli/reset-link.js person@example.com');
    process.exitCode = 1;
  } else if (!user) {
    console.error(`qrating: Zu ${email} gibt es kein Konto. Prüfe die Schreibweise; im Adminbereich stehen alle Adressen unter Einstellungen → Team.`);
    process.exitCode = 1;
  } else if (user.status === 'invited') {
    console.error(`qrating: ${email} ist eingeladen und hat die Einladung noch nicht angenommen. Ein Owner der Organisation lädt die Person unter Einstellungen → Team neu ein.`);
    process.exitCode = 1;
  } else if (user.status !== 'active') {
    console.error(`qrating: Das Konto ${email} ist deaktiviert. Ein Owner der Organisation aktiviert es unter Einstellungen → Team.`);
    process.exitCode = 1;
  } else {
    const link = await issueResetLink({ query }, user);
    await writeAudit({ query }, {
      organizationId: user.organization_id,
      action: 'auth.reset_link_issued',
      entityType: 'user',
      entityId: user.id,
      metadata: { via: 'command' }
    });
    console.log(`qrating: Link zum Zurücksetzen für ${email}, gültig ${resetValidity()}:\n${link}`);
  }
} catch (error) {
  console.error(`qrating: Der Link ließ sich nicht erzeugen. ${error.message} Prüfe mit „docker compose ps“, ob Backend und Datenbank laufen, und versuche es dann erneut.`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
