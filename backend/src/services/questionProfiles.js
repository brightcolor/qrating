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

export const questionProfiles = [
  {
    id: 'quick-vibe',
    name: 'Quick vibe check',
    summary: 'Three light questions for fast feedback at the exit.',
    badge: '2 min',
    tone: 'light',
    questions: [
      question({
        internalName: 'favorite_moment',
        label: 'What stayed with you in a good way?',
        placeholder: 'A song, a person, the mood, the location ...',
        sortOrder: 10
      }),
      question({
        internalName: 'positive_tags',
        label: 'What worked well for you?',
        questionType: 'checkboxes',
        options: ['Great mood', 'Good music', 'Nice location', 'Friendly team', 'Good sound', 'Would come again'],
        sortOrder: 20
      }),
      question({
        internalName: 'improvement_tags',
        label: 'Where can we improve?',
        questionType: 'checkboxes',
        options: ['Entry', 'Waiting time', 'Sound', 'Drinks', 'Prices', 'Toilets', 'Too crowded'],
        sortOrder: 30
      })
    ]
  },
  {
    id: 'emotional-night',
    name: 'Emotional event recap',
    summary: 'Warm questions for real memories, praise, and honest improvement ideas.',
    badge: '4 min',
    tone: 'warm',
    questions: [
      question({
        internalName: 'evening_feeling',
        label: 'How did the evening feel for you?',
        questionType: 'multiple_choice',
        options: ['Relaxed', 'Energetic', 'Special', 'Okay', 'Difficult'],
        required: true,
        sortOrder: 10
      }),
      question({
        internalName: 'best_memory',
        label: 'What is your best memory from the event?',
        placeholder: 'Tell us about one moment that stayed with you.',
        sortOrder: 20
      }),
      question({
        internalName: 'next_time_better',
        label: 'What should feel better next time?',
        placeholder: 'Be honest. This helps us improve.',
        sortOrder: 30
      })
    ]
  },
  {
    id: 'club-party',
    name: 'Club and party feedback',
    summary: 'Focused on music, entry, bar, sound, and the moment of the night.',
    badge: '5 min',
    tone: 'energetic',
    questions: [
      question({ internalName: 'music_rating', label: 'How was the music?', questionType: 'rating', required: true, sortOrder: 10 }),
      question({ internalName: 'sound_rating', label: 'How was the sound?', questionType: 'rating', sortOrder: 20 }),
      question({ internalName: 'bar_rating', label: 'How was the bar experience?', questionType: 'rating', sortOrder: 30 }),
      question({ internalName: 'entry_rating', label: 'How did entry work for you?', questionType: 'rating', sortOrder: 40 }),
      question({
        internalName: 'night_moment',
        label: 'What was your moment of the night?',
        placeholder: 'A track, a scene, a person, a feeling ...',
        sortOrder: 50
      })
    ]
  },
  {
    id: 'concert-festival',
    name: 'Concert and festival',
    summary: 'For music events with sound, artists, safety, toilets, and value questions.',
    badge: '6 min',
    tone: 'structured',
    questions: [
      question({ internalName: 'artists_rating', label: 'How did you like the artists or acts?', questionType: 'rating', required: true, sortOrder: 10 }),
      question({ internalName: 'sound_rating', label: 'How was the sound?', questionType: 'rating', sortOrder: 20 }),
      question({ internalName: 'atmosphere_rating', label: 'How was the atmosphere?', questionType: 'rating', sortOrder: 30 }),
      question({ internalName: 'safety_rating', label: 'Did you feel safe?', questionType: 'yes_no', sortOrder: 40 }),
      question({ internalName: 'toilets_rating', label: 'How were the toilets?', questionType: 'rating', sortOrder: 50 }),
      question({ internalName: 'value_rating', label: 'How was the value for money?', questionType: 'rating', sortOrder: 60 })
    ]
  },
  {
    id: 'conference-b2b',
    name: 'Conference and B2B',
    summary: 'A clear profile for content, speakers, networking, location, and NPS.',
    badge: '7 min',
    tone: 'professional',
    questions: [
      question({ internalName: 'content_rating', label: 'How valuable were the contents?', questionType: 'rating', required: true, sortOrder: 10 }),
      question({ internalName: 'speaker_rating', label: 'How were the speakers?', questionType: 'rating', sortOrder: 20 }),
      question({ internalName: 'networking_rating', label: 'How useful was the networking?', questionType: 'rating', sortOrder: 30 }),
      question({ internalName: 'location_rating', label: 'How was the location?', questionType: 'rating', sortOrder: 40 }),
      question({ internalName: 'recommendation_nps', label: 'How likely are you to recommend this event?', questionType: 'nps', showInDashboard: true, sortOrder: 50 }),
      question({ internalName: 'business_takeaway', label: 'What is your main takeaway?', placeholder: 'One insight, contact, or next step ...', sortOrder: 60 })
    ]
  },
  {
    id: 'low-rating-recovery',
    name: 'Low-rating recovery',
    summary: 'Empathetic follow-up questions for unhappy guests and quick resolution.',
    badge: 'Care',
    tone: 'empathetic',
    questions: [
      question({
        internalName: 'problem_summary',
        label: 'What went wrong from your point of view?',
        placeholder: 'A short description is enough.',
        required: true,
        sortOrder: 10
      }),
      question({
        internalName: 'resolution_wish',
        label: 'What would help now?',
        questionType: 'multiple_choice',
        options: ['A quick call', 'A reply by email', 'A voucher or goodwill gesture', 'Just wanted to tell you'],
        sortOrder: 20
      }),
      question({
        internalName: 'contact_time',
        label: 'When is a good time to reach you?',
        questionType: 'text_short',
        placeholder: 'Today, tomorrow morning, after 18:00 ...',
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
    label: item.label || `Question ${index + 1}`,
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
