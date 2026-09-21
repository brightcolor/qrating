// The privacy page of an organization, written from what this installation really does.
// Every sentence follows a setting or a table, so the page and the software stay in step.

export const processorLine = 'qrating, ein Produkt von bright color (siehe qrating.de/impressum)';

function trimmed(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

// Days as a sentence; an organization without a limit keeps the data until it deletes it itself.
function periodSentence(days, subject) {
  const number = Number(days);
  if (!Number.isFinite(number) || number <= 0) {
    return `${subject} bleiben gespeichert, bis die Veranstalterin sie löscht.`;
  }
  return `${subject} werden ${number} Tage nach ihrem Eingang automatisch gelöscht.`;
}

export function controllerOf(organization = {}) {
  const name = trimmed(organization.legal_name) || trimmed(organization.name);
  const address = trimmed(organization.legal_address);
  const email = trimmed(organization.legal_email);
  return { name, address, email, complete: Boolean(name && address && email) };
}

export function privacySections(organization = {}, { newsletter = null, mailHost = null } = {}) {
  const controller = controllerOf(organization);
  const host = newsletter?.api_url ? safeHost(newsletter.api_url) : null;
  const mail = trimmed(mailHost);

  const collected = [
    'Deine Sterne und die Antworten auf die Fragen des Formulars.',
    'Was du in die freien Felder schreibst.',
    'Den Zeitpunkt der Abgabe und die Sprache der Seite.',
    'Einen Kennwert deiner Adresse und deines Browsers. Er entsteht als Einwegwert, aus dem sich weder Adresse noch Gerät zurückrechnen lassen, und hält Mehrfachabgaben auseinander.',
    'Welchen Schritt du zuletzt gesehen hast. Daraus lesen wir, an welcher Stelle Gäste aufhören.',
    'Deine Sterne in dem Moment, in dem du sie antippst, und deine übrigen Antworten beim Wechsel jedes Schritts – auch dann, wenn du die Bewertung abbrichst. So zählt deine Stimme auch ohne den letzten Knopf, und wir sehen, woran es hakt. Rufnummer, Anliegen und E-Mail-Adresse sind davon ausgenommen: Die übermitteln wir erst, wenn du abschickst.'
  ];
  const voluntary = [
    'Deine E-Mail-Adresse, wenn du Infos zu kommenden Events möchtest. Sie liegt verschlüsselt.',
    'Deine Telefonnummer und dein Anliegen, wenn du nach einer kritischen Bewertung einen Rückruf möchtest.'
  ];

  const receivers = [
    `Die Seite läuft auf einem Server in Deutschland. Betrieb und Wartung übernimmt ${processorLine} als Auftragsverarbeiter.`
  ];
  if (host) {
    receivers.push(`Meldest du dich für Infos an, geht deine Adresse an das Newslettersystem unter ${host}, aus dem die E-Mails verschickt werden.`);
  }
  if (mail) {
    receivers.push(`Hinterlässt du eine Rückrufnummer, geht sie als E-Mail an die Veranstalterin über den Mailserver ${mail}.`);
  }
  receivers.push('Darüber hinaus geben wir deine Daten an niemanden weiter. Verkauft oder für Werbung Dritter genutzt werden sie nie.');

  return [
    {
      id: 'verantwortlich',
      title: 'Wer für diese Daten geradesteht',
      paragraphs: controller.complete
        ? [[controller.name, controller.address, controller.email].filter(Boolean).join('\n')]
        : ['Die Angaben zur verantwortlichen Stelle stehen noch aus.'],
      items: []
    },
    {
      id: 'erhoben',
      title: 'Was beim Bewerten entsteht',
      paragraphs: ['Wenn du den Code scannst und das Formular ausfüllst, entsteht Folgendes:'],
      items: collected
    },
    {
      id: 'freiwillig',
      title: 'Was du selbst dazugibst',
      paragraphs: ['Diese Angaben sind freiwillig und entstehen nur, wenn du sie einträgst:'],
      items: voluntary
    },
    {
      id: 'zweck',
      title: 'Wofür wir das nutzen',
      paragraphs: [
        'Die Bewertungen zeigen uns, wie ein Abend angekommen ist, und wir richten die nächsten danach aus. Ausgewertet wird in Summen und Durchschnitten.',
        'Deine E-Mail-Adresse nutzen wir für die Infos, für die du dich angemeldet hast. Deine Telefonnummer nutzen wir, um dich zu deinem Anliegen zurückzurufen.'
      ],
      items: []
    },
    {
      id: 'rechtsgrundlage',
      title: 'Worauf sich das stützt',
      paragraphs: [],
      items: [
        'Bewertung und Freitext: unser berechtigtes Interesse an der Verbesserung unserer Veranstaltungen, Art. 6 Abs. 1 lit. f DSGVO.',
        'E-Mail-Adresse und Newsletter: deine Einwilligung, Art. 6 Abs. 1 lit. a DSGVO.',
        'Telefonnummer für einen Rückruf: deine Einwilligung, Art. 6 Abs. 1 lit. a DSGVO.'
      ]
    },
    {
      id: 'empfaenger',
      title: 'Wer sie zu sehen bekommt',
      paragraphs: [],
      items: receivers
    },
    {
      id: 'dauer',
      title: 'Wie lange sie bleiben',
      paragraphs: [],
      items: [
        periodSentence(organization.retention_feedback_days, 'Bewertungen und Besuche der Gästeseite'),
        periodSentence(organization.retention_newsletter_days, 'Anmeldungen zum Newsletter'),
        periodSentence(organization.retention_low_rating_phone_days, 'Telefonnummern aus einem Rückrufwunsch')
      ]
    },
    {
      id: 'rechte',
      title: 'Was du verlangen kannst',
      paragraphs: [
        'Du kannst Auskunft über deine Daten verlangen, sie berichtigen oder löschen lassen, ihre Verarbeitung einschränken und der Verarbeitung widersprechen. Eine einmal gegebene Einwilligung kannst du jederzeit für die Zukunft widerrufen.',
        controller.email
          ? `Eine Nachricht an ${controller.email} genügt. Jede Newsletter-Mail trägt außerdem einen Abmeldelink.`
          : 'Jede Newsletter-Mail trägt außerdem einen Abmeldelink.',
        'Du kannst dich auch bei einer Datenschutz-Aufsichtsbehörde beschweren.'
      ],
      items: []
    }
  ];
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function privacyPage(organization = {}, { newsletter = null, mailHost = null } = {}) {
  return {
    organization: {
      name: organization.name,
      slug: organization.slug,
      primaryColor: organization.primary_color,
      logoUrl: organization.logo_url
    },
    controller: controllerOf(organization),
    ownText: trimmed(organization.privacy_text),
    sections: privacySections(organization, { newsletter, mailHost })
  };
}
