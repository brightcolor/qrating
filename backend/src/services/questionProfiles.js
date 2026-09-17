export const questionTypes = ['text_short', 'text_long', 'checkboxes', 'multiple_choice', 'yes_no', 'nps', 'rating'];

function question({
  internalName,
  label,
  questionType = 'text_long',
  helpText = '',
  placeholder = '',
  required = false,
  sortOrder = 0,
  options = null,
  category = 'experience',
  showInDashboard = true
}) {
  return {
    internalName,
    label,
    questionType,
    helpText,
    placeholder,
    required,
    sortOrder,
    active: true,
    category,
    privacyRelevant: false,
    showInExport: true,
    showInDashboard,
    anonymousAnswer: true,
    visibilityRules: null,
    options
  };
}

// The guest page adds an optional sentence to the questions named positive_tags and improvement_tags.
function positiveTags(label, options, sortOrder) {
  return question({ internalName: 'positive_tags', label, questionType: 'checkboxes', options, sortOrder });
}

function improvementTags(label, options, sortOrder) {
  return question({ internalName: 'improvement_tags', label, questionType: 'checkboxes', options, sortOrder });
}

function recommendation(label, sortOrder) {
  return question({ internalName: 'recommendation_nps', label, questionType: 'nps', sortOrder });
}

export const questionProfiles = [
  {
    id: 'quick-vibe',
    name: 'Schnellfeedback',
    summary: 'Drei leichte Fragen für den Ausgang: was gepasst hat, was besser werden darf und der Moment des Abends.',
    badge: 'Kurz',
    questions: [
      positiveTags('Was hat für dich gepasst?', ['Tolle Stimmung', 'Gute Musik', 'Schöne Location', 'Nettes Team', 'Guter Sound', 'Gerne wieder'], 10),
      improvementTags('Wo dürfen wir besser werden?', ['Einlass', 'Wartezeiten', 'Sound', 'Getränke', 'Preise', 'Toiletten', 'Zu voll'], 20),
      question({
        internalName: 'favorite_moment',
        label: 'Was war dein Moment des Abends?',
        placeholder: 'Ein Song, ein Mensch, die Stimmung …',
        sortOrder: 30
      })
    ]
  },
  {
    id: 'club-party',
    name: 'Party & Club',
    summary: 'Für Clubnächte und Partys: Musik, Stimmung, Einlass, Bar und der Moment der Nacht.',
    badge: 'Party',
    questions: [
      question({ internalName: 'music_rating', label: 'Wie war die Musik?', questionType: 'rating', sortOrder: 10 }),
      positiveTags('Was hat die Nacht besonders gemacht?', ['DJ-Set', 'Stimmung', 'Lichtshow', 'Crowd', 'Drinks', 'Location'], 20),
      improvementTags('Wo hat es gehakt?', ['Einlass', 'Garderobe', 'Wartezeit an der Bar', 'Sound', 'Zu voll', 'Toiletten', 'Preise'], 30),
      question({ internalName: 'come_again', label: 'Kommst du zur nächsten Party wieder?', questionType: 'yes_no', sortOrder: 40 }),
      question({
        internalName: 'night_moment',
        label: 'Was war dein Track oder Moment der Nacht?',
        questionType: 'text_short',
        placeholder: 'Ein Song, eine Szene, ein Gefühl …',
        sortOrder: 50
      })
    ]
  },
  {
    id: 'festival',
    name: 'Festival',
    summary: 'Für Open Airs über einen oder mehrere Tage: Line-up, Gelände, Versorgung, Sicherheit und Weiterempfehlung.',
    badge: 'Festival',
    questions: [
      question({ internalName: 'lineup_rating', label: 'Wie hat dir das Line-up gefallen?', questionType: 'rating', sortOrder: 10 }),
      positiveTags('Was war richtig gut?', ['Line-up', 'Stimmung', 'Gelände', 'Essen', 'Camping', 'Deko & Licht'], 20),
      improvementTags('Wo sollen wir nachlegen?', ['Anreise & Parken', 'Einlass', 'Wartezeiten', 'Toiletten & Duschen', 'Wasserstellen', 'Wegweiser', 'Preise'], 30),
      question({ internalName: 'felt_safe', label: 'Hast du dich auf dem Gelände sicher gefühlt?', questionType: 'yes_no', sortOrder: 40 }),
      question({ internalName: 'highlight_act', label: 'Welcher Act war dein Highlight?', questionType: 'text_short', sortOrder: 50 }),
      recommendation('Wie wahrscheinlich empfiehlst du das Festival weiter?', 60)
    ]
  },
  {
    id: 'concert',
    name: 'Konzert',
    summary: 'Für Konzerte und Live-Shows: Auftritt, Sound, Sicht auf die Bühne und Preis-Leistung.',
    badge: 'Live',
    questions: [
      question({ internalName: 'show_rating', label: 'Wie hat dir der Auftritt gefallen?', questionType: 'rating', sortOrder: 10 }),
      question({ internalName: 'sound_rating', label: 'Wie war der Sound?', questionType: 'rating', sortOrder: 20 }),
      question({
        internalName: 'stage_view',
        label: 'Wie gut hast du die Bühne gesehen?',
        questionType: 'multiple_choice',
        options: ['Richtig gut', 'Geht so', 'Kaum'],
        sortOrder: 30
      }),
      improvementTags('Wo können wir nachbessern?', ['Einlass', 'Garderobe', 'Getränke', 'Toiletten', 'Merch', 'Heimweg', 'Preise'], 40),
      question({ internalName: 'value_rating', label: 'Wie fandest du das Preis-Leistungs-Verhältnis?', questionType: 'rating', sortOrder: 50 })
    ]
  },
  {
    id: 'birthday-party',
    name: 'Geburtstagsfeier',
    summary: 'Für private Feiern: Stimmung, Essen, Musik und ein paar liebe Worte an das Geburtstagskind.',
    badge: 'Privat',
    questions: [
      question({ internalName: 'mood_rating', label: 'Wie war die Stimmung?', questionType: 'rating', sortOrder: 10 }),
      positiveTags('Was hat dir besonders gefallen?', ['Essen', 'Getränke', 'Musik', 'Deko', 'Leute', 'Überraschungen', 'Location'], 20),
      improvementTags('Was hätte noch gefehlt?', ['Mehr Musik', 'Mehr Essen', 'Mehr Sitzplätze', 'Mehr Zeit', 'Alles war perfekt'], 30),
      question({ internalName: 'danced', label: 'Hast du getanzt?', questionType: 'yes_no', sortOrder: 40 }),
      question({
        internalName: 'birthday_wishes',
        label: 'Deine Glückwünsche an das Geburtstagskind',
        placeholder: 'Ein paar liebe Worte …',
        sortOrder: 50
      })
    ]
  },
  {
    id: 'wedding',
    name: 'Hochzeit',
    summary: 'Für Hochzeiten: Trauung, Essen, Feier und Wünsche für das Brautpaar.',
    badge: 'Privat',
    questions: [
      question({ internalName: 'ceremony_rating', label: 'Wie hat dir die Trauung gefallen?', questionType: 'rating', sortOrder: 10 }),
      question({ internalName: 'food_rating', label: 'Wie hat dir das Essen geschmeckt?', questionType: 'rating', sortOrder: 20 }),
      positiveTags('Was war besonders schön?', ['Trauung', 'Reden', 'Essen', 'Musik & Tanz', 'Location', 'Deko', 'Fotobox'], 30),
      improvementTags('Was hätte es noch gebraucht?', ['Mehr Sitzplätze', 'Kürzere Wartezeiten', 'Mehr vegetarische Gerichte', 'Mehr Tanzmusik', 'Alles war perfekt'], 40),
      question({
        internalName: 'couple_wishes',
        label: 'Deine Wünsche für das Brautpaar',
        placeholder: 'Ein paar Zeilen für die beiden …',
        sortOrder: 50
      })
    ]
  },
  {
    id: 'company-party',
    name: 'Firmen- & Weihnachtsfeier',
    summary: 'Für Teamevents: Organisation, Programm, Essen und Wünsche für das nächste Mal.',
    badge: 'Team',
    questions: [
      question({ internalName: 'organization_rating', label: 'Wie gut war die Feier organisiert?', questionType: 'rating', sortOrder: 10 }),
      question({
        internalName: 'program_amount',
        label: 'Wie fandest du das Programm?',
        questionType: 'multiple_choice',
        options: ['Genau richtig', 'Zu viel', 'Zu wenig'],
        sortOrder: 20
      }),
      positiveTags('Was hat dir gefallen?', ['Essen', 'Getränke', 'Programm', 'Musik', 'Location', 'Zeit mit dem Team'], 30),
      improvementTags('Was wünschst du dir für das nächste Mal?', ['Anderer Termin', 'Andere Location', 'Mehr Programm', 'Kürzere Reden', 'Mehr Musik', 'Einfachere Anreise'], 40),
      question({ internalName: 'join_again', label: 'Bist du beim nächsten Mal wieder dabei?', questionType: 'yes_no', sortOrder: 50 })
    ]
  },
  {
    id: 'city-festival',
    name: 'Stadt- & Vereinsfest',
    summary: 'Für Straßenfeste, Vereinsfeiern und Familientage: Programm, Versorgung, Kinderangebot und Anreise.',
    badge: 'Community',
    questions: [
      question({ internalName: 'program_rating', label: 'Wie hat dir das Programm gefallen?', questionType: 'rating', sortOrder: 10 }),
      positiveTags('Was hat dir gefallen?', ['Bühnenprogramm', 'Essen & Trinken', 'Kinderangebot', 'Stände', 'Atmosphäre', 'Wetterglück'], 20),
      improvementTags('Was können wir verbessern?', ['Anreise & Parken', 'Sitzplätze', 'Toiletten', 'Sauberkeit', 'Wartezeiten', 'Barrierefreiheit', 'Preise'], 30),
      question({ internalName: 'with_children', label: 'Warst du mit Kindern da?', questionType: 'yes_no', sortOrder: 40 }),
      question({
        internalName: 'heard_from',
        label: 'Wie hast du vom Fest erfahren?',
        questionType: 'multiple_choice',
        options: ['Freunde & Familie', 'Social Media', 'Plakat', 'Zeitung', 'Verein'],
        sortOrder: 50
      })
    ]
  },
  {
    id: 'conference-b2b',
    name: 'Konferenz & Messe',
    summary: 'Für Fachveranstaltungen: Inhalte, Vorträge, Organisation und Weiterempfehlung.',
    badge: 'Business',
    questions: [
      question({ internalName: 'content_rating', label: 'Wie wertvoll waren die Inhalte für dich?', questionType: 'rating', sortOrder: 10 }),
      question({ internalName: 'speaker_rating', label: 'Wie überzeugend waren die Vorträge?', questionType: 'rating', sortOrder: 20 }),
      positiveTags('Was hat dir am meisten gebracht?', ['Vorträge', 'Workshops', 'Networking', 'Aussteller', 'Location', 'Catering'], 30),
      improvementTags('Wo sollen wir nachbessern?', ['Zeitplan', 'Raumwechsel', 'WLAN', 'Technik', 'Catering', 'Beschilderung'], 40),
      recommendation('Wie wahrscheinlich empfiehlst du die Veranstaltung weiter?', 50),
      question({
        internalName: 'business_takeaway',
        label: 'Was nimmst du mit?',
        questionType: 'text_short',
        placeholder: 'Eine Erkenntnis, ein Kontakt, ein nächster Schritt …',
        sortOrder: 60
      })
    ]
  },
  {
    id: 'workshop-seminar',
    name: 'Workshop & Seminar',
    summary: 'Für Kurse und Schulungen: Inhalt, Tempo, was geholfen hat und Weiterempfehlung.',
    badge: 'Lernen',
    questions: [
      question({ internalName: 'content_rating', label: 'Wie hilfreich war der Inhalt?', questionType: 'rating', sortOrder: 10 }),
      question({
        internalName: 'pace',
        label: 'Wie war das Tempo?',
        questionType: 'multiple_choice',
        options: ['Zu langsam', 'Genau richtig', 'Zu schnell'],
        sortOrder: 20
      }),
      positiveTags('Was hat dir geholfen?', ['Beispiele', 'Übungen', 'Unterlagen', 'Fragerunde', 'Gruppe', 'Kursleitung'], 30),
      improvementTags('Was hätte dir noch geholfen?', ['Mehr Übungen', 'Mehr Pausen', 'Bessere Unterlagen', 'Mehr Zeit für Fragen', 'Kleinere Gruppe'], 40),
      recommendation('Wie wahrscheinlich empfiehlst du den Kurs weiter?', 50)
    ]
  },
  {
    id: 'culture-show',
    name: 'Theater, Lesung & Comedy',
    summary: 'Für Bühnenabende: Vorstellung, Saal, Länge und Wünsche für das Programm.',
    badge: 'Kultur',
    questions: [
      question({ internalName: 'show_rating', label: 'Wie hat dir die Vorstellung gefallen?', questionType: 'rating', sortOrder: 10 }),
      positiveTags('Was hat dich begeistert?', ['Darbietung', 'Humor', 'Geschichte', 'Musik', 'Bühnenbild', 'Saal'], 20),
      improvementTags('Was können wir verbessern?', ['Sicht', 'Akustik', 'Sitzkomfort', 'Pause', 'Einlass', 'Gastronomie'], 30),
      question({
        internalName: 'show_length',
        label: 'Wie fandest du die Länge?',
        questionType: 'multiple_choice',
        options: ['Zu kurz', 'Genau richtig', 'Zu lang'],
        sortOrder: 40
      }),
      question({
        internalName: 'next_show',
        label: 'Wen oder was möchtest du hier als Nächstes sehen?',
        questionType: 'text_short',
        sortOrder: 50
      })
    ]
  },
  {
    id: 'emotional-night',
    name: 'Emotionaler Rückblick',
    summary: 'Warme Fragen für echte Erinnerungen, Lob und ehrliche Ideen.',
    badge: 'Persönlich',
    questions: [
      question({
        internalName: 'evening_feeling',
        label: 'Wie hat sich der Abend für dich angefühlt?',
        questionType: 'multiple_choice',
        options: ['Entspannt', 'Energiegeladen', 'Besonders', 'Ganz okay', 'Anstrengend'],
        required: true,
        sortOrder: 10
      }),
      question({
        internalName: 'best_memory',
        label: 'Was ist deine schönste Erinnerung an das Event?',
        placeholder: 'Erzähl uns von einem Moment, der geblieben ist.',
        sortOrder: 20
      }),
      question({
        internalName: 'next_time_better',
        label: 'Was soll sich beim nächsten Mal noch besser anfühlen?',
        placeholder: 'Sag es ehrlich, das hilft uns weiter.',
        sortOrder: 30
      })
    ]
  },
  {
    id: 'low-rating-recovery',
    name: 'Nachfassen bei Kritik',
    summary: 'Einfühlsame Fragen für unzufriedene Gäste und eine schnelle Klärung.',
    badge: 'Nachsorge',
    questions: [
      question({
        internalName: 'problem_summary',
        label: 'Was ist aus deiner Sicht schiefgelaufen?',
        placeholder: 'Eine kurze Beschreibung reicht.',
        required: true,
        sortOrder: 10
      }),
      question({
        internalName: 'resolution_wish',
        label: 'Was würde dir jetzt helfen?',
        questionType: 'multiple_choice',
        options: ['Ein kurzer Anruf', 'Eine Antwort per E-Mail', 'Ein Gutschein oder eine Geste', 'Ich wollte es nur loswerden'],
        sortOrder: 20
      }),
      question({
        internalName: 'contact_time',
        label: 'Wann erreichen wir dich am besten?',
        questionType: 'text_short',
        placeholder: 'Heute, morgen früh, ab 18 Uhr …',
        sortOrder: 30
      })
    ]
  }
];

export function getQuestionProfile(profileId) {
  return questionProfiles.find((profile) => profile.id === profileId) || null;
}

export function toProfileQuestionRows(questions = []) {
  return questions.map((item, index) => ({
    questionType: questionTypes.includes(item.questionType) ? item.questionType : 'text_long',
    internalName: item.internalName || `question_${index + 1}`,
    label: item.label || `Frage ${index + 1}`,
    helpText: item.helpText || null,
    placeholder: item.placeholder || null,
    required: Boolean(item.required),
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : (index + 1) * 10,
    active: item.active !== false,
    category: item.category || null,
    privacyRelevant: Boolean(item.privacyRelevant),
    showInExport: item.showInExport !== false,
    showInDashboard: item.showInDashboard !== false,
    anonymousAnswer: item.anonymousAnswer !== false,
    visibilityRules: item.visibilityRules || null,
    options: Array.isArray(item.options) ? item.options : null
  }));
}
