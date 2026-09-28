// Shows a fresh setup code while the installation has no account yet. Run it in the container:
//   docker compose exec backend node src/cli/setup-code.js
// The new code replaces the one from the log.
import { pool, query } from '../db/pool.js';
import { announceSetupCode } from '../services/setupService.js';

try {
  const code = await announceSetupCode({ query });
  if (!code) {
    console.log('qrating: Die Ersteinrichtung ist abgeschlossen, es gibt schon ein Konto. Melde dich im Adminbereich an; ein vergessenes Passwort setzt du dort über „Passwort zurücksetzen“ neu.');
  }
} catch (error) {
  console.error(`qrating: Der Einrichtungscode ließ sich nicht erzeugen. ${error.message} Prüfe mit „docker compose ps“, ob Backend und Datenbank laufen, und versuche es dann erneut.`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
