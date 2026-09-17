import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Copy,
  Eye,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react';
import { api } from '../lib/api.js';
import { buildSteps, questionType } from '../guest/flow.js';
import { linesToOptions, makeKey, optionsToLines, profileIcons, promptIdeas, typeCards } from './formBuilderUtils.js';

function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let active = true;
    setState((old) => ({ ...old, loading: true, error: null }));
    fn().then((data) => active && setState({ loading: false, data, error: null })).catch((error) => active && setState({ loading: false, data: null, error }));
    return () => { active = false; };
  }, deps);
  return state;
}

function Panel({ title, children, action, className = '' }) {
  return <section className={`rounded-lg border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>
    {(title || action) && <div className="mb-4 flex items-start justify-between gap-3">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {action}
    </div>}
    {children}
  </section>;
}

function ErrorBox({ error }) {
  return <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message || String(error)}</div>;
}

// Messages are plain strings (information) or { tone: 'error', text } from errorNotice().
function errorNotice(error) {
  return { tone: 'error', text: error?.message || String(error) };
}

function Notice({ message, className = '' }) {
  if (!message) return null;
  const isError = typeof message === 'object' && message.tone === 'error';
  const text = typeof message === 'object' ? message.text : message;
  return <p role={isError ? 'alert' : 'status'} className={`${className} rounded-md p-3 text-sm ${isError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{text}</p>;
}

export function FormBuilder() {
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(null);
  const { data: events } = useAsync(() => api('/admin/events'), []);
  const { data: forms, loading, error } = useAsync(() => api('/admin/forms'), [reload]);
  const { data: profiles } = useAsync(() => api('/admin/forms/profiles'), [reload]);

  useEffect(() => {
    if (!selected && forms?.[0]) setSelected(forms[0].id);
  }, [forms, selected]);

  const selectedForm = forms?.find((form) => form.id === selected);

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Formulare</h1>
        <p className="mt-1 text-neutral-600">Starte mit einer Vorlage, passe die Fragen an und speichere deine eigene Fassung für das nächste Event.</p>
      </div>
      <button onClick={() => setReload(reload + 1)} className="button-secondary"><RefreshCw size={16} /> Neu laden</button>
    </div>
    {error && <div className="mt-4"><ErrorBox error={error} /></div>}
    <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <ProfileLauncher events={events || []} profiles={profiles} onCreated={(form) => { setSelected(form.id); setReload(reload + 1); }} />
        <Panel title="Deine Formulare">
          <CreateBlankForm events={events || []} onCreated={(form) => { setSelected(form.id); setReload(reload + 1); }} />
          <div className="mt-4 space-y-2">
            {loading && <p className="text-sm text-neutral-500">Lade Formulare …</p>}
            {(forms || []).map((form) => <button key={form.id} onClick={() => setSelected(form.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === form.id ? 'bg-neutral-950 text-white' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
              <span className="font-medium">{form.name}</span>
              <span className="mt-1 block text-xs opacity-75">{form.is_template ? 'Vorlage' : 'Eventformular'}</span>
            </button>)}
          </div>
        </Panel>
      </div>
      {selected ? <FormEditor key={selected} formId={selected} form={selectedForm} onChanged={() => setReload(reload + 1)} /> : <Panel><p className="text-neutral-600">Wähle ein Formular aus oder lege eines aus einer Vorlage an.</p></Panel>}
    </div>
  </div>;
}

function ProfileLauncher({ events, profiles, onCreated }) {
  const builtIn = profiles?.builtIn || [];
  const saved = profiles?.saved || [];
  const [draft, setDraft] = useState({ profileId: '', templateFormId: '', eventId: '', name: '' });
  const [message, setMessage] = useState('');
  const selected = builtIn.find((item) => item.id === draft.profileId) || saved.find((item) => item.id === draft.templateFormId);

  async function createFromProfile() {
    setMessage('');
    if (!draft.profileId && !draft.templateFormId) {
      setMessage(errorNotice({ message: 'Bitte wähle zuerst eine Vorlage aus.' }));
      return;
    }
    try {
      const created = await api('/admin/forms/from-profile', {
        method: 'POST',
        body: JSON.stringify({ ...draft, name: draft.name || selected?.name || 'Neues Feedbackformular', isTemplate: !draft.eventId })
      });
      setDraft({ profileId: '', templateFormId: '', eventId: '', name: '' });
      onCreated(created);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <Panel title="Vorlagen" action={<Sparkles className="text-blue-600" size={20} />}>
    <div className="grid gap-3">
      {builtIn.map((profile) => <ProfileCard key={profile.id} profile={profile} active={draft.profileId === profile.id} onPick={() => setDraft({ ...draft, profileId: profile.id, templateFormId: '', name: profile.name })} />)}
      {saved.map((profile) => <ProfileCard key={profile.id} icon={Bookmark} profile={{ ...profile, questionCount: profile.question_count, badge: 'Eigene', summary: profile.description || 'Deine wiederverwendbaren Fragen.' }} active={draft.templateFormId === profile.id} onPick={() => setDraft({ ...draft, profileId: '', templateFormId: profile.id, name: profile.name })} />)}
    </div>
    <div className="mt-4 space-y-3 rounded-md bg-blue-50 p-3">
      <input className="input" placeholder="Name des Formulars" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <select className="input" value={draft.eventId} onChange={(e) => setDraft({ ...draft, eventId: e.target.value })}>
        <option value="">Als wiederverwendbare Vorlage speichern</option>
        {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>
      <button type="button" onClick={createFromProfile} className="button-blue w-full" disabled={!selected}><Sparkles size={16} /> Vorlage verwenden</button>
      <Notice message={message} />
    </div>
  </Panel>;
}

function ProfileCard({ profile, active, icon, onPick }) {
  const Icon = icon || profileIcons[profile.id] || Sparkles;
  const preview = (profile.questions || []).slice(0, 3).map((item) => item.label).join(' · ');
  return <button type="button" onClick={onPick} className={`rounded-lg border p-3 text-left transition ${active ? 'border-blue-600 bg-blue-50' : 'border-neutral-200 bg-white hover:border-blue-300'}`}>
    <div className="flex items-center justify-between gap-3">
      <strong className="flex items-center gap-2"><Icon size={18} className={active ? 'text-blue-600' : 'text-neutral-500'} /> {profile.name}</strong>
      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{profile.badge || `${profile.questionCount} Fragen`}</span>
    </div>
    <p className="mt-1 text-sm text-neutral-600">{profile.summary}</p>
    {preview && <p className="mt-2 text-xs text-neutral-500">{preview}</p>}
    <p className="mt-2 text-xs font-medium text-blue-700">{profile.questionCount} Fragen, alle anpassbar</p>
  </button>;
}

function CreateBlankForm({ events, onCreated }) {
  const [name, setName] = useState('Neues Feedbackformular');
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault();
    setMessage('');
    try {
      const form = await api('/admin/forms', { method: 'POST', body: JSON.stringify({ name, eventId: eventId || null, isTemplate: !eventId }) });
      onCreated(form);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <form onSubmit={submit} className="space-y-2">
    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
    <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
      <option value="">Wiederverwendbare Vorlage</option>
      {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
    </select>
    <button className="button-primary w-full"><Plus size={16} /> Leer beginnen</button>
    <Notice message={message} />
  </form>;
}

function FormEditor({ formId, form, onChanged }) {
  const [reload, setReload] = useState(0);
  const [profileName, setProfileName] = useState(`${form?.name || 'Feedbackformular'} Vorlage`);
  const [message, setMessage] = useState('');
  const { data, loading, error } = useAsync(() => api(`/admin/forms/${formId}`), [formId, reload]);
  if (loading) return <Panel><p>Lade Formular …</p></Panel>;
  if (error) return <ErrorBox error={error} />;

  async function refresh() {
    setReload(reload + 1);
    onChanged();
  }
  async function remove(questionId) {
    setMessage('');
    try {
      await api(`/admin/forms/${formId}/questions/${questionId}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  async function saveProfile() {
    setMessage('');
    try {
      const saved = await api(`/admin/forms/${formId}/save-profile`, { method: 'POST', body: JSON.stringify({ name: profileName }) });
      setMessage(`Als Vorlage „${saved.name}“ gespeichert.`);
      onChanged();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const activeQuestions = data.questions.filter((question) => question.active);
  return <div className="space-y-6">
    <Panel title={data.form.name} action={<span className="rounded-full bg-neutral-100 px-3 py-1 text-sm">{activeQuestions.length} aktive Fragen</span>}>
      <Notice message={message} className="mb-4" />
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
        <button onClick={saveProfile} className="button-secondary"><Save size={16} /> Als Vorlage speichern</button>
      </div>
      <QuestionCreate formId={formId} nextOrder={(data.questions.length + 1) * 10} onCreated={refresh} />
    </Panel>
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {data.questions.map((question) => <QuestionRow key={question.id} formId={formId} question={question} onSaved={refresh} onDelete={() => remove(question.id)} />)}
        {!data.questions.length && <Panel><p className="text-sm text-neutral-500">Noch keine eigenen Fragen. Nimm eine Idee von oben oder starte mit einer Vorlage.</p></Panel>}
      </div>
      <GuestFlowPreview questions={activeQuestions} />
    </div>
  </div>;
}

function QuestionCreate({ formId, nextOrder, onCreated }) {
  const [draft, setDraft] = useState({ label: '', internalName: '', questionType: 'text_long', helpText: '', placeholder: '', options: '', required: false });
  const [message, setMessage] = useState('');
  const selectedType = typeCards.find((type) => type.value === draft.questionType);
  async function submit(e) {
    e.preventDefault();
    setMessage('');
    if (['checkboxes', 'multiple_choice'].includes(draft.questionType) && !linesToOptions(draft.options).length) {
      setMessage(errorNotice({ message: 'Für diesen Fragetyp brauchst du mindestens eine Antwortmöglichkeit, eine pro Zeile.' }));
      return;
    }
    try {
      await api(`/admin/forms/${formId}/questions`, {
        method: 'POST',
        body: JSON.stringify({ ...draft, internalName: draft.internalName || makeKey(draft.label), sortOrder: nextOrder, options: linesToOptions(draft.options) })
      });
      setDraft({ label: '', internalName: '', questionType: 'text_long', helpText: '', placeholder: '', options: '', required: false });
      onCreated();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <form onSubmit={submit} className="mt-5 space-y-4 rounded-lg bg-neutral-50 p-4">
    <div>
      <label className="text-sm font-medium">Frage, die Gäste sehen</label>
      <input className="input mt-1" placeholder="Was sollen die Gäste beantworten?" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value, internalName: draft.internalName || makeKey(e.target.value) })} required />
      <div className="mt-2 flex flex-wrap gap-2">{promptIdeas.map((idea) => <button key={idea} type="button" className="rounded-full bg-white px-3 py-1 text-xs text-neutral-700 ring-1 ring-neutral-200 hover:bg-blue-50" onClick={() => setDraft({ ...draft, label: idea, internalName: makeKey(idea) })}>{idea}</button>)}</div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{typeCards.map((type) => <TypeCard key={type.value} type={type} active={draft.questionType === type.value} onPick={() => setDraft({ ...draft, questionType: type.value })} />)}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <input className="input" placeholder="Hinweis für Gäste, optional" value={draft.helpText} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} />
      <input className="input" placeholder="Platzhalter, optional" value={draft.placeholder} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} />
    </div>
    {['checkboxes', 'multiple_choice'].includes(draft.questionType) && <textarea className="input min-h-24" placeholder="Eine Antwort pro Zeile" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Pflichtfrage</label>
      <button className="button-blue"><Plus size={16} /> {selectedType?.label || 'Frage'} hinzufügen</button>
    </div>
    <Notice message={message} />
  </form>;
}

function TypeCard({ type, active, onPick }) {
  const Icon = type.icon;
  return <button type="button" onClick={onPick} className={`rounded-lg border p-3 text-left ${active ? 'border-blue-600 bg-white shadow-sm' : 'border-neutral-200 bg-white/70 hover:bg-white'}`}>
    <Icon size={18} className={active ? 'text-blue-600' : 'text-neutral-500'} />
    <strong className="mt-2 block hyphens-auto break-words text-sm">{type.label}</strong>
    <span className="block hyphens-auto break-words text-xs text-neutral-500">{type.hint}</span>
  </button>;
}

function QuestionRow({ formId, question, onSaved, onDelete }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    label: question.label,
    internalName: question.internal_name,
    questionType: question.question_type,
    helpText: question.help_text || '',
    placeholder: question.placeholder || '',
    required: question.required,
    active: question.active,
    sortOrder: question.sort_order,
    options: optionsToLines(question.options)
  });
  const [message, setMessage] = useState('');
  const type = typeCards.find((item) => item.value === draft.questionType) || typeCards[0];
  const Icon = type.icon;

  async function save(nextDraft = draft) {
    setMessage('');
    try {
      await api(`/admin/forms/${formId}/questions/${question.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...nextDraft, options: linesToOptions(nextDraft.options) })
      });
      setMessage('Frage gespeichert.');
      onSaved();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  async function duplicate() {
    setMessage('');
    try {
      await api(`/admin/forms/${formId}/questions`, {
        method: 'POST',
        body: JSON.stringify({ ...draft, label: `${draft.label} (Kopie)`, internalName: `${draft.internalName}_kopie`, sortOrder: Number(draft.sortOrder || 0) + 1, options: linesToOptions(draft.options) })
      });
      onSaved();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="rounded-md bg-blue-50 p-2 text-blue-700"><Icon size={18} /></span>
        <span>
          <strong className="block">{draft.label}</strong>
          <span className="text-sm text-neutral-500">{type.label} · Position {draft.sortOrder} · {draft.active ? 'sichtbar' : 'ausgeblendet'}</span>
        </span>
      </button>
      <div className="flex flex-wrap gap-2">
        <button onClick={duplicate} className="button-secondary"><Copy size={16} /> Duplizieren</button>
        <button onClick={() => save()} className="button-primary"><Save size={16} /> Speichern</button>
        <button onClick={onDelete} className="button-secondary" title="Löschen"><Trash2 size={16} /></button>
      </div>
    </div>
    <Notice message={message} className="mt-3" />
    {open && <div className="mt-4 grid gap-3">
      <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{typeCards.map((item) => <TypeCard key={item.value} type={item} active={draft.questionType === item.value} onPick={() => setDraft({ ...draft, questionType: item.value })} />)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="Hinweis für Gäste" value={draft.helpText} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} />
        <input className="input" placeholder="Platzhalter" value={draft.placeholder} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} />
      </div>
      {['checkboxes', 'multiple_choice'].includes(draft.questionType) && <textarea className="input min-h-24" placeholder="Eine Antwort pro Zeile" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />}
      <div className="grid gap-3 md:grid-cols-[1fr_160px_auto_auto]">
        <input className="input" placeholder="Interner Schlüssel" value={draft.internalName} onChange={(e) => setDraft({ ...draft, internalName: e.target.value })} />
        <input className="input" type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Pflichtfrage</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Sichtbar</label>
      </div>
    </div>}
  </div>;
}

const stepHints = {
  rating: 'Sterne von 1 bis 5 · springt direkt weiter',
  contact: 'Erscheint bei 1 oder 2 Sternen: Rückrufnummer und Anliegen',
  newsletter: 'Ja oder Nein · bei Ja folgt das Feld für die E-Mail-Adresse',
  summary: 'Alle Antworten auf einen Blick, jede lässt sich noch ändern'
};

function stepTitle(step) {
  if (step.kind === 'rating') return 'Gesamtbewertung';
  if (step.kind === 'contact') return 'Rückruf anbieten';
  if (step.kind === 'question') return step.question.label;
  if (step.kind === 'comment') return step.field === 'commentPositive' ? 'Offene Frage: Was war gut?' : 'Offene Frage: Was soll besser werden?';
  if (step.kind === 'newsletter') return 'Infos zu kommenden Events';
  return 'Zusammenfassung und Abschicken';
}

function stepHint(step) {
  if (step.kind !== 'question') return stepHints[step.kind] || '';
  const type = typeCards.find((item) => item.value === questionType(step.question));
  const parts = [type?.label || 'Lange Antwort'];
  if (['rating', 'nps', 'yes_no', 'multiple_choice'].includes(questionType(step.question))) parts.push('springt direkt weiter');
  if (step.detailField) parts.push('mit optionalem Satz');
  if (step.question.required) parts.push('Pflichtfrage');
  return parts.join(' · ');
}

function GuestFlowPreview({ questions }) {
  const steps = useMemo(() => buildSteps(questions, 0), [questions]);
  return <Panel title="Ablauf für Gäste" action={<Eye size={18} className="text-blue-600" />}>
    <p className="text-sm text-neutral-600">Gäste sehen eine Frage pro Schritt. Am Ende steht die Zusammenfassung.</p>
    <ol className="mt-4 space-y-2">
      {steps.map((step, index) => <li key={step.id} className="flex items-start gap-3 rounded-md bg-neutral-50 p-2">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-neutral-950 text-xs font-semibold text-white">{index + 1}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{stepTitle(step)}</span>
          <span className="block text-xs text-neutral-500">{stepHint(step)}</span>
        </span>
      </li>)}
      <li className="flex items-start gap-3 rounded-md border border-dashed border-neutral-300 p-2">
        <Star size={16} className="mt-0.5 flex-none text-amber-500" />
        <span className="text-xs text-neutral-500">{stepHints.contact}</span>
      </li>
    </ol>
  </Panel>;
}
