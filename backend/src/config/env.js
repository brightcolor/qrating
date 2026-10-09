import dotenv from 'dotenv';

dotenv.config();

const normalizeUrl = (value) => String(value || '').replace(/\/+$/, '');
const nodeEnv = process.env.NODE_ENV || 'development';
const defaultAdminAppUrl = nodeEnv === 'production' ? 'https://app.qrating.de' : 'http://localhost:8080';
const defaultFeedbackAppUrl = nodeEnv === 'production' ? 'https://qrat.ing' : 'http://localhost:8080';

// A time zone the runtime knows by its name, such as "Europe/Berlin".
export function knownTimezone(value) {
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: value });
    return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(value);
  } catch {
    return false;
  }
}

// Express "trust proxy": a hop count (the frontend nginx is one hop), true/false, or an address list.
export function parseTrustProxy(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true' || raw === 'false') return raw === 'true';
  return raw;
}

// Every value that shapes what qrating does is a setting: its name in the environment, a
// default, its bounds and a sentence on what it does. The defaults live here and nowhere else;
// the rest of the code reads `env`. A value outside its bounds stops the start with a message
// that names the setting, so a typo never turns into a silent NaN.
export const numberSettings = [
  // Server and public pages
  { key: 'port', name: 'PORT', fallback: 4000, min: 1, max: 65535, hint: 'Port, auf dem die API lauscht.' },
  { key: 'rateLimitWindowMs', name: 'RATE_LIMIT_WINDOW_MS', fallback: 60000, min: 1000, max: 86400000, hint: 'Zeitfenster der Ratenbegrenzung für Bewertungen, in Millisekunden.' },
  { key: 'rateLimitMax', name: 'RATE_LIMIT_MAX', fallback: 30, min: 1, max: 100000, hint: 'So viele Bewertungen nimmt qrating je Anschluss im Zeitfenster an.' },
  { key: 'progressRateLimitMax', name: 'PROGRESS_RATE_LIMIT_MAX', fallback: 600, min: 1, max: 1000000, hint: 'So viele Schrittmeldungen der Gästeseite nimmt qrating je Anschluss im Zeitfenster von RATE_LIMIT_WINDOW_MS an; jeder Gast meldet jeden Schritt.' },
  { key: 'pageRateLimitMax', name: 'PAGE_RATE_LIMIT_MAX', fallback: 300, min: 1, max: 1000000, hint: 'So viele Aufrufe der öffentlichen Seiten (Gästeseite, Website, Datenschutzseite) nimmt qrating je Anschluss im Zeitfenster von RATE_LIMIT_WINDOW_MS an; jeder Gast ruft die Gästeseite meist ein- bis dreimal auf.' },
  { key: 'imageCacheMaxBytes', name: 'IMAGE_CACHE_MAX_BYTES', fallback: 5242880, min: 1024, max: 104857600, hint: 'Größtes Eventbild, das qrating zwischenspeichert, in Byte.' },
  { key: 'workerIntervalMs', name: 'WORKER_INTERVAL_MS', fallback: 5000, min: 500, max: 600000, hint: 'Takt, in dem der Hintergrunddienst nach Aufgaben sieht, in Millisekunden.' },
  { key: 'pretixSchedulerIntervalMs', name: 'PRETIX_SCHEDULER_INTERVAL_MS', fallback: 60000, min: 5000, max: 86400000, hint: 'Takt, in dem der Planer Pretix-Abgleiche und Löschläufe ansetzt, in Millisekunden.' },

  // Sign-in and sessions
  { key: 'adminSessionHours', name: 'ADMIN_SESSION_HOURS', fallback: 12, min: 1, max: 720, hint: 'So lange gilt eine Anmeldung im Adminbereich, in Stunden.' },
  { key: 'twoFactorChallengeMinutes', name: 'TWO_FACTOR_CHALLENGE_MINUTES', fallback: 10, min: 1, max: 60, hint: 'So lange wartet die Anmeldung auf den Code aus der Authenticator-App, in Minuten.' },
  { key: 'passwordResetValidHours', name: 'PASSWORD_RESET_VALID_HOURS', fallback: 2, min: 1, max: 72, hint: 'So lange gilt ein Link zum Zurücksetzen des Passworts, in Stunden.' },
  { key: 'inviteValidDays', name: 'INVITE_VALID_DAYS', fallback: 7, min: 1, max: 90, hint: 'So lange gilt eine Einladung ins Team, in Tagen.' },
  // bcrypt reads the first 72 bytes of a password, so a longer minimum would promise more than it keeps.
  { key: 'passwordMinLength', name: 'PASSWORD_MIN_LENGTH', fallback: 10, min: 8, max: 72, hint: 'Mindestlänge eines Passworts, in Zeichen.' },
  { key: 'passwordHashCost', name: 'PASSWORD_HASH_COST', fallback: 12, min: 10, max: 14, hint: 'Aufwand beim Speichern und Prüfen eines Passworts (bcrypt-Kostenfaktor); jede Stufe verdoppelt die Rechenarbeit.' },
  { key: 'authRateLimitWindowMinutes', name: 'AUTH_RATE_LIMIT_WINDOW_MINUTES', fallback: 15, min: 1, max: 1440, hint: 'Zeitfenster für Anmeldeversuche je Anschluss, in Minuten.' },
  { key: 'authRateLimitMax', name: 'AUTH_RATE_LIMIT_MAX', fallback: 20, min: 1, max: 100000, hint: 'So viele Anmeldeversuche nimmt qrating je Anschluss im Zeitfenster an.' },
  { key: 'passwordResetRateLimitWindowMinutes', name: 'PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES', fallback: 60, min: 1, max: 1440, hint: 'Zeitfenster für Anfragen zum Zurücksetzen des Passworts je Anschluss, in Minuten.' },
  { key: 'passwordResetRateLimitMax', name: 'PASSWORD_RESET_RATE_LIMIT_MAX', fallback: 5, min: 1, max: 100000, hint: 'So viele Anfragen zum Zurücksetzen nimmt qrating je Anschluss im Zeitfenster an.' },
  { key: 'setupCodeLength', name: 'SETUP_CODE_LENGTH', fallback: 16, min: 12, max: 64, hint: 'Länge des Einrichtungscodes für die Ersteinrichtung, in Zeichen.' },

  // Mail server of the installation. It alone carries the mails that open an account, links to
  // reset a password and invitations, because whoever controls the mail server of an
  // organization could read those.
  { key: 'systemSmtpPort', name: 'SYSTEM_SMTP_PORT', fallback: 587, min: 1, max: 65535, hint: 'Port des Mailservers der Installation.' },

  // Deletion periods and background jobs
  { key: 'retentionMinDays', name: 'RETENTION_MIN_DAYS', fallback: 1, min: 1, max: 365, hint: 'Kürzeste Löschfrist, die eine Organisation eintragen kann, in Tagen.' },
  { key: 'retentionMaxDays', name: 'RETENTION_MAX_DAYS', fallback: 3650, min: 1, max: 36500, hint: 'Längste Löschfrist, die eine Organisation eintragen kann, in Tagen.' },
  { key: 'retentionPhoneDefaultDays', name: 'RETENTION_PHONE_DEFAULT_DAYS', fallback: 90, min: 1, max: 36500, hint: 'Löschfrist für Rückrufnummern, mit der eine neue Organisation beginnt, in Tagen; jede Organisation kann ihre eigene eintragen.' },
  { key: 'retentionIntervalHours', name: 'RETENTION_INTERVAL_HOURS', fallback: 12, min: 1, max: 720, hint: 'Abstand zwischen zwei Löschläufen je Organisation, in Stunden.' },
  { key: 'jobRetryMinutes', name: 'JOB_RETRY_MINUTES', fallback: 2, min: 1, max: 1440, hint: 'Wartezeit, bevor eine gescheiterte Hintergrundaufgabe erneut läuft, in Minuten.' },
  { key: 'jobMaxAttempts', name: 'JOB_MAX_ATTEMPTS', fallback: 5, min: 1, max: 50, hint: 'Versuche einer Hintergrundaufgabe, bevor sie als gescheitert gilt.' },
  { key: 'pretixSyncMaxAttempts', name: 'PRETIX_SYNC_MAX_ATTEMPTS', fallback: 3, min: 1, max: 50, hint: 'Versuche eines Pretix-Abgleichs, bevor er als gescheitert gilt.' },
  { key: 'retentionJobMaxAttempts', name: 'RETENTION_JOB_MAX_ATTEMPTS', fallback: 2, min: 1, max: 50, hint: 'Versuche eines Löschlaufs, bevor er als gescheitert gilt.' },
  { key: 'schedulerBatchSize', name: 'SCHEDULER_BATCH_SIZE', fallback: 20, min: 1, max: 1000, hint: 'So viele Abgleiche und Löschläufe setzt der Planer je Takt höchstens an.' },
  { key: 'jobHistoryDays', name: 'JOB_HISTORY_DAYS', fallback: 30, min: 1, max: 3650, hint: 'So lange bleiben erledigte Hintergrundaufgaben in der Liste, in Tagen.' },
  { key: 'failedJobHistoryDays', name: 'FAILED_JOB_HISTORY_DAYS', fallback: 90, min: 1, max: 3650, hint: 'So lange bleiben gescheiterte Hintergrundaufgaben zur Durchsicht in der Liste, in Tagen.' },
  { key: 'lowRatingGraceMinutes', name: 'LOW_RATING_GRACE_MINUTES', fallback: 30, min: 0, max: 1440, hint: 'So lange wartet die Meldung nach einem Tipp auf wenige Sterne auf den Rest des Formulars, in Minuten; bei 0 geht sie sofort hinaus.' },

  // Spam on the guest page. A form sent faster than the organization allows, or one that fills the
  // hidden field, collects points; from the threshold on it counts as suspicious.
  { key: 'antiSpamMinSecondsDefault', name: 'ANTI_SPAM_MIN_SECONDS_DEFAULT', fallback: 3, min: 0, max: 3600, hint: 'Mindestzeit vom Öffnen bis zum Absenden des Formulars, solange eine Organisation keine eigene einträgt, in Sekunden.' },
  { key: 'antiSpamMinSecondsMax', name: 'ANTI_SPAM_MIN_SECONDS_MAX', fallback: 60, min: 1, max: 3600, hint: 'Längste Mindestzeit bis zum Absenden, die eine Organisation eintragen kann, in Sekunden.' },
  { key: 'spamScoreHoneypot', name: 'SPAM_SCORE_HONEYPOT', fallback: 80, min: 0, max: 1000, hint: 'Spam-Punkte für ein Formular, das das versteckte Fangfeld ausfüllt.' },
  { key: 'spamScoreTooFast', name: 'SPAM_SCORE_TOO_FAST', fallback: 20, min: 0, max: 1000, hint: 'Spam-Punkte für ein Formular, das schneller kommt als die Mindestzeit der Organisation.' },
  { key: 'spamSuspiciousScore', name: 'SPAM_SUSPICIOUS_SCORE', fallback: 20, min: 1, max: 2000, hint: 'Ab so vielen Spam-Punkten gilt eine Bewertung als verdächtig.' },

  // Lists in the admin area and the report
  { key: 'analyticsVoicesLimit', name: 'ANALYTICS_VOICES_LIMIT', fallback: 100, min: 1, max: 5000, hint: 'So viele Stimmen zeigt die Auswertung eines Events.' },
  { key: 'analyticsCommentsLimit', name: 'ANALYTICS_COMMENTS_LIMIT', fallback: 100, min: 1, max: 5000, hint: 'So viele Kommentare liefert die Auswertung eines Events.' },
  { key: 'analyticsAbandonedLimit', name: 'ANALYTICS_ABANDONED_LIMIT', fallback: 200, min: 1, max: 5000, hint: 'So viele abgebrochene Besuche zeigt die Auswertung eines Events.' },
  { key: 'callbacksListLimit', name: 'CALLBACKS_LIST_LIMIT', fallback: 200, min: 1, max: 5000, hint: 'So viele Fälle zeigt die Liste der Rückrufe.' },
  { key: 'reportCommentsLimit', name: 'REPORT_COMMENTS_LIMIT', fallback: 50, min: 1, max: 1000, hint: 'So viele Kommentare stehen im PDF-Report.' },

  // QR places. The short name travels in the address of the code and comes back from the guest
  // page in a field of at most 80 characters, so it can never be longer than that.
  { key: 'qrSourceLabelMaxLength', name: 'QR_SOURCE_LABEL_MAX_LENGTH', fallback: 60, min: 10, max: 200, hint: 'Längster Name eines QR-Platzes, in Zeichen.' },
  { key: 'qrSourceSlugMaxLength', name: 'QR_SOURCE_SLUG_MAX_LENGTH', fallback: 40, min: 3, max: 80, hint: 'Längster Kurzname eines QR-Platzes in der Adresse, in Zeichen.' },

  // Events and the wallboard
  { key: 'upcomingEventsMax', name: 'UPCOMING_EVENTS_MAX', fallback: 5, min: 1, max: 20, hint: 'So viele kommende Events lassen sich nach dem Feedback von Hand auswählen, und so viele zeigt die Gästeseite dann.' },
  { key: 'upcomingEventsAutoCount', name: 'UPCOMING_EVENTS_AUTO_COUNT', fallback: 3, min: 1, max: 20, hint: 'So viele kommende Events zeigt die Gästeseite nach dem Feedback, solange keine von Hand gewählt sind.' },
  { key: 'organizationPageUpcomingCount', name: 'ORGANIZATION_PAGE_UPCOMING_COUNT', fallback: 5, min: 1, max: 50, hint: 'So viele kommende Events nennt die Seite einer Organisation, solange keine Runde läuft.' },
  { key: 'feedbackWindowMaxDays', name: 'FEEDBACK_WINDOW_MAX_DAYS', fallback: 365, min: 1, max: 3650, hint: 'Längste Bewertungsrunde nach dem Ende eines Events, Tage-Anteil.' },
  { key: 'feedbackWindowMaxHours', name: 'FEEDBACK_WINDOW_MAX_HOURS', fallback: 8760, min: 1, max: 87600, hint: 'Längste Bewertungsrunde nach dem Ende eines Events, Stunden-Anteil.' },
  { key: 'wallboardRefreshDefaultSeconds', name: 'WALLBOARD_REFRESH_DEFAULT_SECONDS', fallback: 15, min: 1, max: 86400, hint: 'So oft lädt das Wallboard neu, solange eine Organisation nichts anderes einträgt, in Sekunden.' },
  { key: 'wallboardRefreshMinSeconds', name: 'WALLBOARD_REFRESH_MIN_SECONDS', fallback: 5, min: 1, max: 86400, hint: 'Kürzester Abstand, in dem das Wallboard neu laden darf, in Sekunden.' },
  { key: 'wallboardRefreshMaxSeconds', name: 'WALLBOARD_REFRESH_MAX_SECONDS', fallback: 3600, min: 1, max: 86400, hint: 'Längster Abstand, in dem das Wallboard neu laden darf, in Sekunden.' }
];

export const textSettings = [
  { key: 'organizationName', name: 'ORGANIZATION_NAME', fallback: 'Demo Events', rule: 'höchstens 120 Zeichen lang sein', test: (value) => value.length <= 120, hint: 'Name der Organisation, die beim ersten Start angelegt wird.' },
  { key: 'organizationSlug', name: 'ORGANIZATION_SLUG', fallback: 'demo-events', rule: 'aus Kleinbuchstaben, Ziffern und Bindestrichen bestehen', test: (value) => /^[a-z0-9-]{1,80}$/.test(value), hint: 'Kurzname dieser Organisation, er steht im QR-Link.' },
  { key: 'adminCookieName', name: 'ADMIN_COOKIE_NAME', fallback: 'qrating_admin', rule: 'aus Buchstaben, Ziffern, _ und - bestehen und höchstens 64 Zeichen lang sein', test: (value) => /^[A-Za-z0-9_-]{1,64}$/.test(value), hint: 'Name des Cookies, das die Anmeldung im Adminbereich trägt.' },
  { key: 'setupCodeCommand', name: 'SETUP_CODE_COMMAND', fallback: 'docker compose exec backend node src/cli/setup-code.js', rule: 'höchstens 300 Zeichen lang sein', test: (value) => value.length <= 300, hint: 'Befehl, den die Ersteinrichtung nennt, um einen neuen Einrichtungscode zu zeigen.' },
  { key: 'resetLinkCommand', name: 'RESET_LINK_COMMAND', fallback: 'docker compose exec backend node src/cli/reset-link.js <E-Mail>', rule: 'höchstens 300 Zeichen lang sein', test: (value) => value.length <= 300, hint: 'Befehl, den das Log nennt, um einen Link zum Zurücksetzen ohne Mail zu erzeugen.' },
  { key: 'systemSmtpHost', name: 'SYSTEM_SMTP_HOST', fallback: '', optional: true, rule: 'ein Rechnername aus Buchstaben, Ziffern, Punkten und Bindestrichen sein', test: (value) => /^[A-Za-z0-9.-]{1,253}$/.test(value), hint: 'Mailserver der Installation für Links zum Zurücksetzen und Einladungen; leer verschickt diese Mails nicht.' },
  { key: 'systemSmtpSecure', name: 'SYSTEM_SMTP_SECURE', fallback: 'false', rule: 'true oder false sein', test: (value) => /^(true|false)$/.test(value), hint: 'true verschlüsselt die Verbindung von Anfang an (meist Port 465); false nutzt STARTTLS, sobald der Server es anbietet.' },
  { key: 'systemSmtpUser', name: 'SYSTEM_SMTP_USER', fallback: '', optional: true, rule: 'höchstens 200 Zeichen lang sein', test: (value) => value.length <= 200, hint: 'Benutzername am Mailserver der Installation; leer meldet sich nicht an.' },
  { key: 'systemMailFrom', name: 'SYSTEM_MAIL_FROM', fallback: '', optional: true, rule: 'eine E-Mail-Adresse sein, gern mit Namen wie „qrating <noreply@example.com>“', test: (value) => /^([^<>@]{1,100}<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/.test(value), hint: 'Absender der Mails über den Mailserver der Installation.' },
  { key: 'defaultTimezone', name: 'DEFAULT_TIMEZONE', fallback: 'Europe/Berlin', rule: 'eine Zeitzone wie „Europe/Berlin“ sein', test: knownTimezone, hint: 'Zeitzone eines neuen Events ohne eigene Angabe und aller Zeitangaben, die zu keinem Event gehören.' },
  { key: 'newOrganizationColor', name: 'NEW_ORGANIZATION_COLOR', fallback: '#2563eb', rule: 'eine Farbe im Format #RRGGBB sein', test: (value) => /^#[0-9a-fA-F]{6}$/.test(value), hint: 'Farbe einer neu angelegten Organisation.' },
  { key: 'newOrganizationPrivacyText', name: 'NEW_ORGANIZATION_PRIVACY_TEXT', fallback: 'Feedback ist anonym möglich. E-Mail-Adressen werden nur für den gewählten Zweck gespeichert.', rule: 'höchstens 2000 Zeichen lang sein', test: (value) => value.length <= 2000, hint: 'Datenschutzhinweis einer neu angelegten Organisation.' }
];

// Lists of single characters, written side by side with a space between them. \t, \r and \n
// stand for the tab, the carriage return and the line feed, which an environment file can hardly
// hold as they are; an environment that already turned them into the characters works as well.
export const characterSettings = [
  // Exports
  { key: 'csvFormulaStartCharacters', name: 'CSV_FORMULA_START_CHARACTERS', fallback: '= + - @ \\t \\r', maxCharacters: 32, hint: 'Zeichen, mit denen eine Tabellenkalkulation eine Zelle als Formel liest. Eine Zelle im CSV-Export, die mit einem davon beginnt, bekommt ein Apostroph vorangestellt.' }
];

const characterEscapes = { '\\t': '\t', '\\r': '\r', '\\n': '\n' };
const shownCharacters = (text) => text.replace(/[\t\r\n]/g, (character) => ({ '\t': '\\t', '\r': '\\r', '\n': '\\n' })[character]);

// The characters of such a list, each once, or a sentence on the first entry that breaks its rules.
export function readCharacterList(raw, setting) {
  const characters = [];
  for (const entry of raw.split(' ').filter(Boolean)) {
    const character = characterEscapes[entry] ?? entry;
    if ([...character].length !== 1) {
      return { problem: `${setting.name} muss einzelne Zeichen mit einem Leerzeichen dazwischen nennen, eingetragen ist „${shownCharacters(entry).slice(0, 40)}“. \\t steht für den Tabulator, \\r für den Wagenrücklauf, \\n für den Zeilenumbruch.` };
    }
    if (/[\p{L}\p{N}]/u.test(character)) {
      return { problem: `${setting.name} muss aus Satz-, Sonder- oder Steuerzeichen bestehen, eingetragen ist „${character}“.` };
    }
    if (!characters.includes(character)) characters.push(character);
  }
  if (characters.length > setting.maxCharacters) {
    return { problem: `${setting.name} darf höchstens ${setting.maxCharacters} Zeichen nennen, eingetragen sind ${characters.length}.` };
  }
  return { characters };
}

// Settings that only make sense together: a lower bound below the upper one, and a default inside
// both where there is one.
const settingPairs = [
  ['retentionMinDays', 'retentionMaxDays', 'retentionPhoneDefaultDays'],
  ['wallboardRefreshMinSeconds', 'wallboardRefreshMaxSeconds', 'wallboardRefreshDefaultSeconds'],
  ['antiSpamMinSecondsDefault', 'antiSpamMinSecondsMax']
];

const settingName = (key) => numberSettings.find((setting) => setting.key === key).name;

// Reads every setting from a source such as process.env. Nothing throws here; the caller decides
// what an error means, so tests can read other values than the defaults.
export function readSettings(source = process.env) {
  const values = {};
  const errors = [];
  for (const setting of numberSettings) {
    const raw = String(source[setting.name] ?? '').trim();
    values[setting.key] = setting.fallback;
    if (raw === '') continue;
    const number = Number(raw);
    if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(number) || number < setting.min || number > setting.max) {
      errors.push(`${setting.name} muss eine ganze Zahl von ${setting.min} bis ${setting.max} sein, eingetragen ist „${raw}“. ${setting.hint}`);
      continue;
    }
    values[setting.key] = number;
  }
  for (const setting of textSettings) {
    const raw = String(source[setting.name] ?? '').trim();
    values[setting.key] = setting.fallback;
    if (raw === '') continue;
    if (!setting.test(raw)) {
      errors.push(`${setting.name} muss ${setting.rule}, eingetragen ist „${raw.slice(0, 80)}“. ${setting.hint}`);
      continue;
    }
    values[setting.key] = raw;
  }
  for (const setting of characterSettings) {
    const raw = String(source[setting.name] ?? '');
    values[setting.key] = readCharacterList(setting.fallback, setting).characters;
    // Only spaces leave such a list empty: a tab or a line break is an entry of its own.
    if (raw.replaceAll(' ', '') === '') continue;
    const { characters, problem } = readCharacterList(raw, setting);
    if (problem) {
      errors.push(`${problem} ${setting.hint}`);
      continue;
    }
    values[setting.key] = characters;
  }
  for (const [low, high, fallback] of settingPairs) {
    if (values[low] > values[high]) {
      errors.push(`${settingName(low)} (${values[low]}) liegt über ${settingName(high)} (${values[high]}). ${fallback ? 'Die Untergrenze muss unter der Obergrenze liegen.' : 'Die Vorgabe muss innerhalb der Obergrenze liegen.'}`);
    } else if (fallback && (values[fallback] < values[low] || values[fallback] > values[high])) {
      errors.push(`${settingName(fallback)} (${values[fallback]}) muss zwischen ${settingName(low)} (${values[low]}) und ${settingName(high)} (${values[high]}) liegen.`);
    }
  }
  if (values.systemSmtpHost && !values.systemMailFrom) {
    errors.push('SYSTEM_MAIL_FROM fehlt. Mit SYSTEM_SMTP_HOST braucht der Mailserver der Installation einen Absender, etwa „qrating <noreply@example.com>“.');
  }
  errors.push(...secretProblems(source));
  return { values, errors };
}

// Values from the examples that ship with qrating. Whoever knows them could sign sessions or read
// stored tokens, so a production installation does not start with them.
const exampleSecrets = ['change-me-at-least-32-chars', 'change-me-32-byte-secret-value!!', 'dev-secret-change-me', 'change-me-32-byte-secret-value'];
const secretMinLength = 32;

function secretProblems(source) {
  if ((source.NODE_ENV || 'development') !== 'production') return [];
  return ['SESSION_SECRET', 'PRETIX_TOKEN_SECRET'].flatMap((name) => {
    const value = String(source[name] ?? '');
    if (!value || exampleSecrets.includes(value)) {
      return [`${name} fehlt oder steht noch auf dem Beispielwert. Trage einen zufälligen Wert mit mindestens ${secretMinLength} Zeichen ein, etwa aus „openssl rand -hex 32“.`];
    }
    if (value.length < secretMinLength) {
      return [`${name} ist ${value.length} Zeichen lang und damit zu kurz. Trage einen zufälligen Wert mit mindestens ${secretMinLength} Zeichen ein, etwa aus „openssl rand -hex 32“.`];
    }
    return [];
  });
}

export function settingsFailure(errors) {
  const count = errors.length === 1 ? 'eine Einstellung ungültig ist' : `${errors.length} Einstellungen ungültig sind`;
  return `qrating startet nicht, weil ${count}. Korrigiere die Werte in der .env-Datei und starte neu:\n- ${errors.join('\n- ')}`;
}

const { values: settings, errors: settingErrors } = readSettings();
if (settingErrors.length) {
  // Operators read this in the log or the console; the message says everything, a stack trace
  // with internal paths adds nothing.
  console.error(settingsFailure(settingErrors));
  process.exit(1);
}

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
  databaseUrl: process.env.DATABASE_URL || 'postgres://qrating:qrating@localhost:5432/qrating',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  pretixTokenSecret: process.env.PRETIX_TOKEN_SECRET || 'change-me-32-byte-secret-value!!',
  adminAppUrl,
  feedbackAppUrl,
  ...settings,
  // A secret like the ones above, so it stays out of the settings list and its messages.
  systemSmtpPassword: process.env.SYSTEM_SMTP_PASSWORD || '',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  corsAllowedOrigins
};
