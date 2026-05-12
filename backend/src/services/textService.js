export const defaultTextsByLanguage = {
  de: {
    headline: 'Wie war dein Abend bei {event_name}?',
    subtitle: 'Dein Feedback hilft uns, kommende Events noch schöner, entspannter und besser zu machen.',
    rating_label: 'Wie würdest du den Abend insgesamt bewerten?',
    positive_label: 'Was ist dir besonders positiv in Erinnerung geblieben?',
    positive_placeholder: 'Zum Beispiel Musik, Stimmung, Menschen, Location oder ein besonderer Moment ...',
    improvement_label: 'Was können wir beim nächsten Mal besser machen?',
    improvement_placeholder: 'Sag es uns gern ehrlich - wir lesen jede Rückmeldung.',
    general_label: 'Möchtest du uns noch etwas mitgeben?',
    newsletter_label: 'Ich möchte Infos zu kommenden Events erhalten.',
    newsletter_help: 'Wir schicken dir nur relevante Infos zu kommenden Veranstaltungen. Kein Spam.',
    low_rating_contact_headline: 'Das tut uns leid.',
    low_rating_contact_text: 'Wenn du magst, hinterlass uns deine Handynummer. Wir melden uns sehr zeitnah und klären persönlich, was passiert ist.',
    low_rating_phone_label: 'Handynummer für Rückruf',
    low_rating_phone_placeholder: '+49 ...',
    low_rating_note_label: 'Worum ging es kurz?',
    low_rating_note_placeholder: 'Ein Satz reicht. Wir melden uns dann mit mehr Ruhe bei dir.',
    privacy_short: 'Du kannst dein Feedback anonym abgeben. Wenn du deine E-Mail-Adresse einträgst, verwenden wir sie nur für den gewählten Zweck.',
    submit: 'Feedback senden',
    thank_headline: 'Danke dir.',
    thank_text: 'Dein Feedback ist angekommen. Schön, dass du dir einen Moment Zeit genommen hast.',
    no_event_headline: 'Gerade ist kein Event zur Bewertung geöffnet.',
    no_event_text: 'Schau gerne später nochmal vorbei.',
    expired_headline: 'Die Feedbackrunde ist beendet.',
    expired_text: 'Danke für dein Interesse. Für dieses Event ist die Bewertungszeit leider bereits abgelaufen.'
  },
  en: {
    headline: 'How was your night at {event_name}?',
    subtitle: 'Your feedback helps us make upcoming events smoother, warmer and better.',
    rating_label: 'How would you rate the event overall?',
    positive_label: 'What stood out in a positive way?',
    positive_placeholder: 'Music, atmosphere, people, location or a special moment ...',
    improvement_label: 'What should we improve next time?',
    improvement_placeholder: 'Be honest - we read every response.',
    general_label: 'Anything else you want to tell us?',
    newsletter_label: 'I would like to receive updates about upcoming events.',
    newsletter_help: 'We only send relevant event updates. No spam.',
    low_rating_contact_headline: 'We are sorry.',
    low_rating_contact_text: 'If you like, leave your mobile number. We will get back to you very soon and talk through what happened.',
    low_rating_phone_label: 'Mobile number for a callback',
    low_rating_phone_placeholder: '+49 ...',
    low_rating_note_label: 'What happened, briefly?',
    low_rating_note_placeholder: 'One sentence is enough. We will follow up with more time and care.',
    privacy_short: 'You can submit feedback anonymously. If you enter your email address, we only use it for the selected purpose.',
    submit: 'Send feedback',
    thank_headline: 'Thank you.',
    thank_text: 'Your feedback has arrived. Thank you for taking a moment.',
    no_event_headline: 'No event is open for feedback right now.',
    no_event_text: 'Please check back later.',
    expired_headline: 'This feedback round has ended.',
    expired_text: 'Thanks for your interest. Feedback for this event is already closed.'
  }
};

export const defaultTexts = defaultTextsByLanguage.de;

export function renderText(value, event = {}) {
  return String(value || '').replaceAll('{event_name}', event.name || 'diesem Event');
}

export async function loadResolvedTexts(db, organizationId, eventId = null, language = 'de', event = {}) {
  const requestedLanguage = defaultTextsByLanguage[language] ? language : 'de';
  const languages = requestedLanguage === 'de' ? ['de'] : ['de', requestedLanguage];
  const result = await db.query(
    `SELECT key, value, event_id, language
     FROM text_templates
     WHERE organization_id = $1
       AND language = ANY($4)
       AND (event_id IS NULL OR event_id = $3)
     ORDER BY CASE WHEN language = 'de' THEN 0 ELSE 1 END, event_id NULLS FIRST`,
    [organizationId, requestedLanguage, eventId, languages]
  );
  const merged = { ...defaultTexts, ...defaultTextsByLanguage[requestedLanguage] };
  for (const row of result.rows) {
    merged[row.key] = row.value;
  }
  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, renderText(value, event)])
  );
}
