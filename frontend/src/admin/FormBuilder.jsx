import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  ChevronDown,
  Eye,
  GripVertical,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react';
import { api } from '../lib/api.js';
import { buildSteps, questionType } from '../guest/flow.js';
import { eventLabel } from './eventLabel.js';
import {
  makeKey,
  moveById,
  moveItem,
  needsOptions,
  profileIcons,
  promptIdeas,
  questionPayload,
  questionProblems,
  questionSummary,
  unknownTypeOption,
  typeCards
} from './formBuilderUtils.js';

// Die Vorschau zieht die Gästeseite samt ihrem CSS herein. Sie lädt erst, wenn
// jemand eine Frage aufklappt, damit der Adminbereich schlank bleibt.
const LazyQuestionPreview = React.lazy(() => import('./QuestionPreview.jsx').then((module) => ({ default: module.QuestionPreview })));

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
      <div className="order-2 space-y-6 xl:order-none">
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
      <div className="order-1 xl:order-none">{selected ? <FormEditor key={selected} formId={selected} form={selectedForm} onChanged={() => setReload(reload + 1)} /> : <Panel><p className="text-neutral-600">Wähle ein Formular aus oder lege eines aus einer Vorlage an.</p></Panel>}</div>
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
        {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
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
      {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
    </select>
    <button className="button-primary w-full"><Plus size={16} /> Leer beginnen</button>
    <Notice message={message} />
  </form>;
}

// Der Zustand, den der Editor die ganze Zeit anzeigt. Ohne ihn weiss niemand,
// ob eine Änderung beim Server angekommen ist.
function SaveState({ state }) {
  if (state === 'speichert') return <span className="text-sm text-neutral-500">Wird gespeichert …</span>;
  if (state === 'fehler') return <span role="alert" className="text-sm text-red-700">Nicht gespeichert. Prüfe deine Verbindung.</span>;
  return <span className="flex items-center gap-1 text-sm text-neutral-500"><Check size={15} /> Alle Änderungen gespeichert</span>;
}

function toDraft(question) {
  return {
    label: question.label || '',
    internalName: question.internal_name || '',
    questionType: question.question_type || 'text_long',
    helpText: question.help_text || '',
    placeholder: question.placeholder || '',
    required: Boolean(question.required),
    active: question.active !== false,
    options: Array.isArray(question.options) ? question.options.map(String) : []
  };
}

// Was die Vorschau sieht: der Entwurf in der Form, die auch die Gästeseite bekommt.
function toPreviewQuestion(draft) {
  return {
    internal_name: draft.internalName || 'vorschau',
    label: draft.label,
    question_type: draft.questionType,
    help_text: draft.helpText,
    placeholder: draft.placeholder,
    required: draft.required,
    options: draft.options
  };
}

function FormEditor({ formId, form, onChanged }) {
  const { data, loading, error } = useAsync(() => api(`/admin/forms/${formId}`), [formId]);
  const { data: textData } = useAsync(() => api('/admin/text-templates'), []);
  const { data: branding } = useAsync(() => api('/admin/branding').catch(() => null), []);
  const [questions, setQuestions] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [saveState, setSaveState] = useState('gespeichert');
  const [profileName, setProfileName] = useState(`${form?.name || 'Feedbackformular'} Vorlage`);
  const [message, setMessage] = useState('');
  const [draftOfOpen, setDraftOfOpen] = useState(null);

  useEffect(() => {
    if (data?.questions) setQuestions(data.questions);
  }, [data]);

  // Die Texte der Gästeseite, damit die Vorschau dieselben Worte zeigt wie der Abend selbst.
  const texts = useMemo(() => {
    const defaults = textData?.defaults || {};
    const eigene = {};
    for (const row of textData?.templates || []) {
      if (!row.event_id && row.value) eigene[row.key] = row.value;
    }
    return { ...defaults, ...eigene };
  }, [textData]);

  if (loading) return <Panel><p>Lade Formular …</p></Panel>;
  if (error) return <ErrorBox error={error} />;

  async function saveQuestion(id, payload) {
    setSaveState('speichert');
    try {
      const saved = await api(`/admin/forms/${formId}/questions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setQuestions((current) => current.map((item) => (item.id === id ? saved : item)));
      setSaveState('gespeichert');
      onChanged();
    } catch (err) {
      setSaveState('fehler');
      setMessage(errorNotice(err));
    }
  }

  async function addQuestion(type) {
    setSaveState('speichert');
    try {
      const label = 'Neue Frage';
      const created = await api(`/admin/forms/${formId}/questions`, {
        method: 'POST',
        body: JSON.stringify({
          label,
          internalName: `${makeKey(label)}_${Date.now().toString(36)}`,
          questionType: type,
          sortOrder: (questions.length + 1) * 10,
          required: false,
          options: needsOptions(type) ? ['Erste Antwort', 'Zweite Antwort'] : []
        })
      });
      setQuestions((current) => [...current, created]);
      setOpenId(created.id);
      setSaveState('gespeichert');
      onChanged();
    } catch (err) {
      setSaveState('fehler');
      setMessage(errorNotice(err));
    }
  }

  async function removeQuestion(id) {
    const vorher = questions;
    setQuestions((current) => current.filter((item) => item.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await api(`/admin/forms/${formId}/questions/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      // Die Frage kommt zurück, damit niemand eine Zeile verliert, die es noch gibt.
      setQuestions(vorher);
      setMessage(errorNotice(err));
    }
  }

  async function reorder(next) {
    const vorher = questions;
    setQuestions(next);
    setSaveState('speichert');
    try {
      const saved = await api(`/admin/forms/${formId}/question-order`, {
        method: 'PUT',
        body: JSON.stringify({ order: next.map((item) => item.id) })
      });
      setQuestions(saved);
      setSaveState('gespeichert');
      onChanged();
    } catch (err) {
      setQuestions(vorher);
      setSaveState('fehler');
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

  const aktive = questions.filter((question) => question.active);
  const offen = questions.find((question) => question.id === openId);

  return <div className="space-y-6">
    <Panel title={data.form.name} action={<span className="rounded-full bg-neutral-100 px-3 py-1 text-sm">{aktive.length} aktive Fragen</span>}>
      <Notice message={message} className="mb-4" />
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="text-sm font-medium">Name der Vorlage</span>
          <input className="input mt-1" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
        </label>
        <button onClick={saveProfile} className="button-secondary self-end"><Bookmark size={16} /> Als Vorlage speichern</button>
      </div>
    </Panel>

    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Fragen</h2>
          <SaveState state={saveState} />
        </div>
        {questions.map((question, position) => <QuestionCard
          key={question.id}
          question={question}
          position={position}
          total={questions.length}
          open={openId === question.id}
          onToggle={() => setOpenId(openId === question.id ? null : question.id)}
          onSave={(payload) => saveQuestion(question.id, payload)}
          onDraft={(draft) => { if (openId === question.id) setDraftOfOpen(draft); }}
          onDelete={() => removeQuestion(question.id)}
          onMove={(direction) => reorder(moveById(questions, question.id, direction))}
          onDropOn={(fromId) => {
            const from = questions.findIndex((item) => item.id === fromId);
            if (from === -1 || from === position) return;
            reorder(moveItem(questions, from, position));
          }}
        />)}
        {!questions.length && <Panel><p className="text-sm text-neutral-500">Noch keine Fragen. Wähle unten einen Typ, dann steht die erste Frage da.</p></Panel>}
        <AddQuestion onAdd={addQuestion} />
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {offen
          ? <Panel title="So sieht der Gast sie" action={<Eye size={18} className="text-blue-600" />}>
            <React.Suspense fallback={<p className="text-sm text-neutral-500">Vorschau wird geladen …</p>}>
              <LazyQuestionPreview
                key={`${offen.id}:${draftOfOpen?.questionType || offen.question_type}`}
                question={toPreviewQuestion(draftOfOpen || toDraft(offen))}
                brandColor={branding?.primaryColor || branding?.primary_color}
                texts={texts}
              />
            </React.Suspense>
            <p className="mt-3 text-xs text-neutral-500">Die Vorschau ist bedienbar. Was du hier antippst, wird nirgends gespeichert.</p>
          </Panel>
          : <GuestFlowPreview questions={aktive} />}
      </div>
    </div>
  </div>;
}

// Eine Karte je Frage. Zugeklappt sagt sie den Stand des Servers, aufgeklappt ist sie der Editor.
function QuestionCard({ question, position, total, open, onToggle, onSave, onDraft, onDelete, onMove, onDropOn }) {
  const [draft, setDraft] = useState(() => toDraft(question));
  const [touched, setTouched] = useState(false);
  const [problems, setProblems] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const labelRef = useRef(null);
  const type = typeCards.find((item) => item.value === draft.questionType) || typeCards[0];
  const Icon = type.icon;
  const fehlerId = `frage-${question.id}-fehler`;

  useEffect(() => { onDraft(draft); }, [draft, onDraft]);

  // Gespeichert wird von selbst, kurz nachdem die Eingabe steht. Was die Gästeseite
  // zerbrechen würde, geht nicht raus — der Grund steht stattdessen an der Frage.
  useEffect(() => {
    if (!touched) return undefined;
    const gefunden = questionProblems(draft);
    setProblems(gefunden);
    if (gefunden.length) return undefined;
    const timer = setTimeout(() => onSave(questionPayload(draft)), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, touched]);

  useEffect(() => {
    if (open && question.label === 'Neue Frage') {
      labelRef.current?.focus();
      labelRef.current?.select();
    }
  }, [open, question.label]);

  function change(patch) {
    setTouched(true);
    setDraft((current) => ({ ...current, ...patch }));
  }

  return <article
    className={`rounded-lg border bg-white shadow-sm ${open ? 'border-blue-300 ring-1 ring-blue-100' : 'border-neutral-200'}`}
    draggable={!open}
    onDragStart={(event) => event.dataTransfer.setData('text/plain', question.id)}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); onDropOn(event.dataTransfer.getData('text/plain')); }}
  >
    <div className="flex items-start gap-2 p-3">
      <span className="mt-1 hidden cursor-grab text-neutral-400 sm:block" aria-hidden="true" title="Zum Sortieren ziehen"><GripVertical size={18} /></span>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-blue-50 text-blue-700"><Icon size={17} /></span>
        <span className="min-w-0">
          <strong className="block truncate">{position + 1}. {question.label}</strong>
          <span className="block text-sm text-neutral-500">{questionSummary(question)}</span>
        </span>
      </button>
      <div className="flex flex-none items-center gap-1">
        <button type="button" onClick={() => onMove('up')} disabled={position === 0} className="focus-ring flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" aria-label={`„${question.label}“ nach oben`}><ArrowUp size={16} /></button>
        <button type="button" onClick={() => onMove('down')} disabled={position === total - 1} className="focus-ring flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" aria-label={`„${question.label}“ nach unten`}><ArrowDown size={16} /></button>
        <button type="button" onClick={onToggle} className="focus-ring flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100" aria-label={open ? 'Frage zuklappen' : 'Frage bearbeiten'}>
          <ChevronDown size={18} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>
    </div>

    {problems.length > 0 && <ul id={fehlerId} role="alert" className="mx-3 mb-3 space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-700">
      {problems.map((problem) => <li key={problem}>{problem}</li>)}
    </ul>}

    {open && <div className="space-y-4 border-t border-neutral-200 p-4">
      <label className="block">
        <span className="text-sm font-medium">Frage, die Gäste sehen</span>
        <input
          ref={labelRef}
          className="input mt-1"
          value={draft.label}
          aria-describedby={problems.length ? fehlerId : undefined}
          onChange={(event) => change({ label: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {promptIdeas.slice(0, 3).map((idea) => <button key={idea} type="button" className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 hover:bg-blue-50" onClick={() => change({ label: idea })}>{idea}</button>)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Antwortart</span>
          <select className="input mt-1" value={draft.questionType} onChange={(event) => {
            const next = event.target.value;
            change({ questionType: next, options: needsOptions(next) && !draft.options.length ? ['Erste Antwort', 'Zweite Antwort'] : draft.options });
          }}>
            {unknownTypeOption(draft.questionType) && <option value={draft.questionType}>{unknownTypeOption(draft.questionType).label} — {unknownTypeOption(draft.questionType).hint}</option>}
            {typeCards.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Hinweis unter der Frage</span>
          <input className="input mt-1" placeholder="Optional" value={draft.helpText} onChange={(event) => change({ helpText: event.target.value })} />
        </label>
      </div>

      {needsOptions(draft.questionType) && <OptionRows options={draft.options} onChange={(options) => change({ options })} />}

      {['text_short', 'text_long'].includes(draft.questionType) && <label className="block">
        <span className="text-sm font-medium">Platzhalter im Feld</span>
        <input className="input mt-1" placeholder="Optional" value={draft.placeholder} onChange={(event) => change({ placeholder: event.target.value })} />
      </label>}

      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.required} onChange={(event) => change({ required: event.target.checked })} /> Pflichtfrage
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.active} onChange={(event) => change({ active: event.target.checked })} /> Gästen zeigen
        </label>
      </div>

      <div className="border-t border-neutral-100 pt-3">
        <button type="button" className="text-sm text-neutral-500 underline" onClick={() => setShowKey(!showKey)}>
          {showKey ? 'Technisches ausblenden' : 'Technisches anzeigen'}
        </button>
        {showKey && <label className="mt-3 block">
          <span className="text-sm font-medium">Interner Schlüssel</span>
          <input className="input mt-1 font-mono text-sm" value={draft.internalName} onChange={(event) => change({ internalName: event.target.value })} />
          <span className="mt-1 block text-xs text-neutral-500">Steht so in CSV, Excel und Webhooks. Ändere ihn nur, solange noch keine Antworten da sind.</span>
        </label>}
      </div>

      <div className="flex justify-end border-t border-neutral-100 pt-3">
        {confirming
          ? <span className="flex flex-wrap items-center gap-3 text-sm">
            <span>Frage samt Antworten löschen?</span>
            <button type="button" onClick={onDelete} className="button-primary bg-red-700 hover:bg-red-800"><Trash2 size={16} /> Ja, löschen</button>
            <button type="button" onClick={() => setConfirming(false)} className="button-secondary">Abbrechen</button>
          </span>
          : <button type="button" onClick={() => setConfirming(true)} className="button-secondary"><Trash2 size={16} /> Frage löschen</button>}
      </div>
    </div>}
  </article>;
}

// Jede Antwortmöglichkeit hat ihre eigene Zeile: anlegen, umsortieren, entfernen.
function OptionRows({ options, onChange }) {
  return <div>
    <span className="text-sm font-medium">Antwortmöglichkeiten</span>
    <ol className="mt-2 space-y-2">
      {options.map((option, position) => <li key={position} className="flex flex-wrap items-center gap-2">
        <span className="w-5 flex-none text-sm text-neutral-400">{position + 1}</span>
        <input
          className="input min-w-[9rem] flex-1"
          value={option}
          aria-label={`Antwortmöglichkeit ${position + 1}`}
          onChange={(event) => onChange(options.map((item, index) => (index === position ? event.target.value : item)))}
        />
        <button type="button" className="focus-ring flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" disabled={position === 0}
          onClick={() => onChange(moveItem(options, position, position - 1))} aria-label={`Antwort ${position + 1} nach oben`}><ArrowUp size={15} /></button>
        <button type="button" className="focus-ring flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" disabled={position === options.length - 1}
          onClick={() => onChange(moveItem(options, position, position + 1))} aria-label={`Antwort ${position + 1} nach unten`}><ArrowDown size={15} /></button>
        <button type="button" className="focus-ring flex h-11 w-11 flex-none items-center justify-center rounded-md text-neutral-500 hover:bg-red-50 hover:text-red-700"
          onClick={() => onChange(options.filter((item, index) => index !== position))} aria-label={`Antwort ${position + 1} entfernen`}><Trash2 size={15} /></button>
      </li>)}
    </ol>
    <button type="button" className="button-secondary mt-2" onClick={() => onChange([...options, ''])}><Plus size={16} /> Antwort hinzufügen</button>
  </div>;
}

// Neue Fragen entstehen unten, dort wo die Liste endet.
function AddQuestion({ onAdd }) {
  return <div className="rounded-lg border border-dashed border-neutral-300 p-4">
    <p className="text-sm font-medium">Frage hinzufügen</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {typeCards.map((type) => {
        const Icon = type.icon;
        return <button key={type.value} type="button" onClick={() => onAdd(type.value)} className="focus-ring flex items-center gap-3 rounded-md border border-neutral-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50">
          <Icon size={18} className="flex-none text-neutral-500" />
          <span className="min-w-0">
            <strong className="block text-sm">{type.label}</strong>
            <span className="block truncate text-xs text-neutral-500">{type.hint}</span>
          </span>
        </button>;
      })}
    </div>
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
    <p className="text-sm text-neutral-600">Gäste sehen eine Frage pro Schritt. Klapp eine Frage auf, dann steht hier ihr echtes Gästebild.</p>
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
