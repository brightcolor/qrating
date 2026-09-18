// Labels for the public texts of the guest flow. The keys come from the backend defaults.
export const textLabels = {
  headline: ['Überschrift der ersten Frage', '{event_name} setzt den Eventnamen ein.'],
  subtitle: ['Zeile unter der Überschrift'],
  rating_label: ['Gesamtbewertung, Beschriftung für Screenreader'],
  rating_reaction_1: ['Reaktion auf 1 Stern'],
  rating_reaction_2: ['Reaktion auf 2 Sterne'],
  rating_reaction_3: ['Reaktion auf 3 Sterne'],
  rating_reaction_4: ['Reaktion auf 4 Sterne'],
  rating_reaction_5: ['Reaktion auf 5 Sterne'],
  stars_value: ['Sterne in Worten', '{wert} setzt die Zahl ein.'],
  progress_label: ['Fortschritt', '{nummer} und {gesamt} setzen die Zahlen ein.'],
  next_label: ['Knopf „Weiter“'],
  skip_label: ['Knopf „Überspringen“'],
  back_label: ['Knopf „Zurück“'],
  multi_hint: ['Hinweis bei Mehrfachauswahl'],
  detail_label: ['Link für einen zusätzlichen Satz'],
  required_hint: ['Hinweis bei Pflichtfragen'],
  yes_label: ['Antwort „Ja“'],
  no_label: ['Antwort „Nein“'],
  nps_low_label: ['Weiterempfehlung, linkes Ende'],
  nps_high_label: ['Weiterempfehlung, rechtes Ende'],
  nps_value: ['Weiterempfehlung in der Zusammenfassung', '{wert} setzt die Zahl ein.'],
  positive_label: ['Offene Frage: Was war gut?'],
  positive_placeholder: ['Platzhalter dazu'],
  improvement_label: ['Offene Frage: Was soll besser werden?'],
  improvement_placeholder: ['Platzhalter dazu'],
  low_rating_contact_headline: ['Überschrift bei 1 oder 2 Sternen'],
  low_rating_contact_text: ['Text bei 1 oder 2 Sternen'],
  low_rating_phone_label: ['Feld für die Rückrufnummer'],
  low_rating_phone_placeholder: ['Platzhalter dazu'],
  low_rating_note_label: ['Feld für das Anliegen'],
  low_rating_note_placeholder: ['Platzhalter dazu'],
  phone_invalid: ['Meldung bei ungültiger Telefonnummer'],
  newsletter_question: ['Frage nach Infos zu kommenden Events'],
  newsletter_help: ['Erklärung unter der Frage'],
  newsletter_yes: ['Antwort Zustimmung'],
  newsletter_no: ['Antwort Ablehnung'],
  newsletter_label: ['Einwilligungstext über dem E-Mail-Feld'],
  newsletter_offers_label: ['Zweites Häkchen: Frühbucher, Verlosungen, Exklusives'],
  newsletter_offers_summary: ['Kurzform davon in der Zusammenfassung'],
  newsletter_privacy_note: ['Zeile zur Weitergabe der Daten'],
  newsletter_privacy_link: ['Beschriftung des Verweises zur Datenschutzseite'],
  newsletter_email_label: ['Feld für die E-Mail-Adresse'],
  email_invalid: ['Meldung bei ungültiger E-Mail-Adresse'],
  summary_headline: ['Überschrift der Zusammenfassung'],
  summary_text: ['Zeile darunter'],
  summary_rating_label: ['Zeile Gesamtbewertung'],
  summary_contact_label: ['Zeile Rückruf'],
  summary_newsletter_label: ['Zeile Event-Infos'],
  summary_skipped: ['Text für übersprungene Antworten'],
  edit_label: ['Knopf „Ändern“'],
  privacy_short: ['Datenschutzhinweis auf der Karte'],
  submit: ['Knopf zum Abschicken'],
  sending_label: ['Knopf während des Sendens'],
  stamp_label: ['Stempel auf der Karte'],
  upcoming_headline: ['Überschrift über den kommenden Events'],
  upcoming_text: ['Text, solange kein Event zur Bewertung offen ist'],
  upcoming_more_headline: ['Überschrift über den weiteren Events'],
  upcoming_shop_label: ['Beschriftung des Ticket-Links'],
  preview_hint: ['Hinweis in der Vorschau'],
  thank_headline: ['Dank, Überschrift'],
  thank_text: ['Dank, Text'],
  no_event_headline: ['Kein Event offen, Überschrift'],
  no_event_text: ['Kein Event offen, Text'],
  expired_headline: ['Bewertung beendet, Überschrift'],
  expired_text: ['Bewertung beendet, Text'],
  not_found_headline: ['Unbekannter Link, Überschrift'],
  not_found_text: ['Unbekannter Link, Text'],
  not_started_headline: ['Bewertung startet später, Überschrift'],
  not_started_text: ['Bewertung startet später, Text', '{datum} setzt den Starttermin ein.'],
  general_label: ['Allgemeine Anmerkung']
};

export const textGroups = [
  ['Einstieg und Bewertung', [
    'headline', 'subtitle', 'rating_label', 'stars_value',
    'rating_reaction_1', 'rating_reaction_2', 'rating_reaction_3', 'rating_reaction_4', 'rating_reaction_5'
  ]],
  ['Fragen und Knöpfe', [
    'progress_label', 'next_label', 'skip_label', 'back_label', 'multi_hint', 'detail_label', 'required_hint',
    'yes_label', 'no_label', 'nps_low_label', 'nps_high_label', 'nps_value',
    'positive_label', 'positive_placeholder', 'improvement_label', 'improvement_placeholder'
  ]],
  ['Rückruf bei Kritik', [
    'low_rating_contact_headline', 'low_rating_contact_text', 'low_rating_phone_label', 'low_rating_phone_placeholder',
    'low_rating_note_label', 'low_rating_note_placeholder', 'phone_invalid'
  ]],
  ['Infos zu kommenden Events', [
    'newsletter_question', 'newsletter_help', 'newsletter_yes', 'newsletter_no', 'newsletter_label',
    'newsletter_offers_label', 'newsletter_offers_summary', 'newsletter_privacy_note', 'newsletter_privacy_link',
    'newsletter_email_label', 'email_invalid'
  ]],
  ['Zusammenfassung und Dank', [
    'summary_headline', 'summary_text', 'summary_rating_label', 'summary_contact_label', 'summary_newsletter_label',
    'summary_skipped', 'edit_label', 'privacy_short', 'submit', 'sending_label', 'stamp_label',
    'upcoming_headline', 'upcoming_text', 'upcoming_more_headline', 'upcoming_shop_label',
    'thank_headline', 'thank_text', 'preview_hint'
  ]],
  ['Seiten ohne offene Bewertung', [
    'no_event_headline', 'no_event_text', 'expired_headline', 'expired_text',
    'not_found_headline', 'not_found_text', 'not_started_headline', 'not_started_text'
  ]]
];

// Groups the keys the backend delivers; unknown keys land in the last group.
export function groupTextKeys(keys) {
  const available = new Set(keys);
  const groups = textGroups
    .map(([title, groupKeys]) => [title, groupKeys.filter((key) => available.has(key))])
    .filter(([, groupKeys]) => groupKeys.length > 0);
  const known = new Set(groups.flatMap(([, groupKeys]) => groupKeys));
  const rest = keys.filter((key) => !known.has(key));
  return rest.length ? [...groups, ['Weitere Texte', rest]] : groups;
}
