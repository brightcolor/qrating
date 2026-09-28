import crypto from 'crypto';
import { env } from '../config/env.js';
import { hashValue } from '../utils/crypto.js';

// The first setup of an installation asks for a code only the operator can read: in the log of
// the backend or through a command in the container. So whoever reaches a freshly published
// instance first cannot make it theirs. The code is kept as a hash; a new code replaces the old.

// Letters and digits without the ones people mix up (0 and O, 1, I and L).
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Once an account exists the setup stays closed, so the answer is kept for the life of the process.
let closed = false;

export function normalizeSetupCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function generateSetupCode(length = env.setupCodeLength) {
  let code = '';
  for (let index = 0; index < length; index += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  // Groups of four read aloud and type more easily.
  return code.match(/.{1,4}/g).join('-');
}

export async function setupOpen(db) {
  if (closed) return false;
  const present = (await db.query('SELECT EXISTS (SELECT 1 FROM users) AS present')).rows[0]?.present;
  if (present) closed = true;
  return !present;
}

export function markSetupClosed() {
  closed = true;
}

export async function issueSetupCode(db) {
  const code = generateSetupCode();
  await db.query(
    `INSERT INTO setup_codes (id, code_hash, created_at)
     VALUES (true, $1, now())
     ON CONFLICT (id) DO UPDATE SET code_hash = EXCLUDED.code_hash, created_at = now()`,
    [hashValue(normalizeSetupCode(code))]
  );
  return code;
}

export async function setupCodeMatches(db, candidate) {
  const given = normalizeSetupCode(candidate);
  if (!given) return false;
  const stored = (await db.query('SELECT code_hash FROM setup_codes WHERE id = true')).rows[0];
  if (!stored) return false;
  const expected = Buffer.from(stored.code_hash, 'hex');
  const actual = Buffer.from(hashValue(given), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function setupCodeAnnouncement(code) {
  return [
    `qrating: Die Ersteinrichtung ist offen. Einrichtungscode: ${code}`,
    `qrating: Öffne ${env.adminAppUrl}/admin und gib den Code dort ein. Einen neuen Code zeigt: ${env.setupCodeCommand}`
  ].join('\n');
}

// At the start of the backend, and from the command in the container: while no account exists,
// a fresh code replaces the old one and goes to the log.
export async function announceSetupCode(db, log = console.log) {
  if (!(await setupOpen(db))) return null;
  const code = await issueSetupCode(db);
  log(setupCodeAnnouncement(code));
  return code;
}
