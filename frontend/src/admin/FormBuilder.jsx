import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { buildSteps, questionType } from '../guest/flow.js';
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
import { Button, ErrorBox, Field, Icon, Input, Loading, Notice, Panel, Select, errorNotice, useAsync } from './ui.jsx';

// Die Vorschau zieht die Gästeseite samt ihrem CSS herein. Sie lädt erst, wenn
// jemand eine Frage aufklappt, damit der Adminbereich schlank bleibt.
const LazyQuestionPreview = React.lazy(() => import('./QuestionPreview.jsx').then((module) => ({ default: module.QuestionPreview })));

// Ein Event hat einen Fragensatz. Das ist die ganze Zuordnung. Hat es noch keinen, steht
// hier die Auswahl, womit es anfängt. Gemerkte Fragensätze sind Startpunkte; bearbeiten
// lassen sie sich unten auf derselben Seite.
export function EventQuestions({ event, onChanged }) {
  const [reload, setReload] = useState(0);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const { data: forms, loading, error } = useAsync(() => api('/admin/forms'), [reload]);
  const { data: profiles } = useAsync(() => api('/admin/forms/profiles'), [reload]);

  useEffect(() => {
    setManual(false);
    setMessage('');
  }, [event.id]);

  const form = (forms || []).find((item) => item.event_id === event.id && item.active) || null;
  const templates = (forms || []).filter((item) => item.is_template);
  const template = templates.find((item) => item.id === templateId) || null;
  const changed = () => {
    setReload((value) => value + 1);
    onChanged?.();
  };

  // Ein Event aus Pretix bringt gar keinen Fragensatz mit, ein von Hand angelegtes einen
  // leeren. Beide Fälle enden hier: vorhandenen füllen, sonst einen anlegen. Ein zweiter
  // Satz neben einem vorhandenen würde die Gästeseite beide zeigen lassen.
  async function startFrom({ profileId, templateFormId }) {
    setMessage('');
    try {
      if (form) {
        await api(`/admin/forms/${form.id}/apply-profile`, { method: 'POST', body: JSON.stringify({ profileId: profileId || '', templateFormId: templateFormId || '' }) });
      } else {
        await api('/admin/forms/from-profile', {
          method: 'POST',
          body: JSON.stringify({ profileId: profileId || '', templateFormId: templateFormId || '', eventId: event.id, name: `Fragen für ${event.name}`, isTemplate: false })
        });
      }
      changed();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function startBlank() {
    if (form) {
      setManual(true);
      return;
    }
    setMessage('');
    try {
      await api('/admin/forms', { method: 'POST', body: JSON.stringify({ name: `Fragen für ${event.name}`, eventId: event.id }) });
      setManual(true);
      changed();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  let main;
  if (loading && !forms) main = <Loading />;
  else if (form && (form.question_count > 0 || manual)) main = <FormEditor key={form.id} formId={form.id} form={form} onChanged={changed} />;
  else if (manual) main = <Panel><p className="text-q-muted">Der Fragensatz wird angelegt …</p></Panel>;
  else main = <StartingPoints event={event} profiles={profiles} onStart={startFrom} onBlank={startBlank} />;

  return <div className="grid gap-4">
    <ErrorBox error={error} />
    <Notice message={message} />
    {main}
    {templates.length > 0 && <Panel>
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left font-semibold" aria-expanded={showTemplates} onClick={() => setShowTemplates(!showTemplates)}>
        <span>Gemerkte Fragensätze ({templates.length})</span>
        <Icon name="chevronDown" size={16} className={showTemplates ? 'rotate-180' : ''} />
      </button>
      {showTemplates && <div className="mt-3 grid gap-3">
        <p className="q-hint">Fragensätze, die du dir gemerkt hast. Für ein neues Event wählst du sie oben als Startpunkt; hier bearbeitest du sie selbst.</p>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((item) => <button key={item.id} type="button" className="q-chip" aria-pressed={templateId === item.id} onClick={() => setTemplateId(templateId === item.id ? '' : item.id)}>{item.name}</button>)}
        </div>
        {template && <FormEditor key={template.id} formId={template.id} form={template} onChanged={changed} />}
      </div>}
    </Panel>}
  </div>;
}

// Solange ein Event keine Fragen hat, steht hier die einzige Entscheidung, die zu
// treffen ist: womit es anfängt. Ein Klick legt den Fragensatz für dieses Event an.
function StartingPoints({ event, profiles, onStart, onBlank }) {
  const builtIn = profiles?.builtIn || [];
  const saved = profiles?.saved || [];
  return <Panel title={`Womit fängt „${event?.name || 'dieser Fragensatz'}“ an?`}>
    <p className="text-q-muted">Ein Klick legt die Fragen für dieses Event an. Ändern kannst du danach alles.</p>
    <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
      {builtIn.map((profile) => <ProfileCard key={profile.id} profile={profile} onPick={() => onStart({ profileId: profile.id })} />)}
      {saved.map((profile) => <ProfileCard
        key={profile.id}
        icon="questions"
        profile={{ ...profile, questionCount: profile.question_count, badge: 'Gemerkt', summary: profile.description || 'Deine gemerkten Fragen.' }}
        onPick={() => onStart({ templateFormId: profile.id })}
      />)}
    </div>
    <Button className="mt-3" icon="plus" onClick={onBlank}>Lieber selbst schreiben</Button>
  </Panel>;
}

function ProfileCard({ profile, icon, onPick }) {
  const Symbol = icon ? null : profileIcons[profile.id];
  const preview = (profile.questions || []).slice(0, 3).map((item) => item.label).join(', ');
  const count = profile.questionCount ?? (profile.questions || []).length;
  return <button type="button" onClick={onPick} className="profile-card">
    <span className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-2">
        {Symbol ? <Symbol size={18} className="text-q-accent-text" aria-hidden="true" /> : <Icon name={icon || 'questions'} size={18} className="text-q-accent-text" />}
        <strong>{profile.name}</strong>
      </span>
      {profile.badge && <span className={`q-pill ${profile.badge === 'Empfohlen' ? 'q-pill-live' : 'q-pill-soon'}`}>{profile.badge}</span>}
    </span>
    <span className="mt-1.5 block text-q-muted">{profile.summary}</span>
    {preview && <span className="mt-1.5 block q-hint">{preview}</span>}
    <span className="mt-1.5 block font-semibold text-q-accent-text" style={{ fontSize: 12.5 }}>{count} Fragen, alle anpassbar</span>
  </button>;
}

// Der Zustand, den der Editor die ganze Zeit anzeigt. Ohne ihn weiss niemand,
// ob eine Änderung beim Server angekommen ist.
function SaveState({ state }) {
  if (state === 'speichert') return <span className="text-q-muted">Wird gespeichert …</span>;
  if (state === 'fehler') return <span role="alert" className="text-q-danger">Nicht gespeichert. Prüfe deine Verbindung.</span>;
  return <span className="flex items-center gap-1 text-q-muted"><Icon name="check" size={15} />Alle Änderungen gespeichert</span>;
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
  const [profileName, setProfileName] = useState(`${form?.name || 'Fragen'}`);
  const [message, setMessage] = useState('');
  const [draftOfOpen, setDraftOfOpen] = useState(null);

  useEffect(() => {
    if (data?.questions) setQuestions(data.questions);
  }, [data]);

  // Die Texte der Gästeseite, damit die Vorschau dieselben Worte zeigt wie der Abend selbst.
  const texts = useMemo(() => {
    const defaults = textData?.defaults || {};
    const own = {};
    for (const row of textData?.templates || []) {
      if (!row.event_id && row.value) own[row.key] = row.value;
    }
    return { ...defaults, ...own };
  }, [textData]);

  if (loading) return <Panel><Loading text="Lade Fragen …" /></Panel>;
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
    const before = questions;
    setQuestions((current) => current.filter((item) => item.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await api(`/admin/forms/${formId}/questions/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      // Die Frage kommt zurück, damit niemand eine Zeile verliert, die es noch gibt.
      setQuestions(before);
      setMessage(errorNotice(err));
    }
  }

  async function reorder(next) {
    const before = questions;
    setQuestions(next);
    setSaveState('speichert');
    try {
      const saved = await api(`/admin/forms/${formId}/question-order`, { method: 'PUT', body: JSON.stringify({ order: next.map((item) => item.id) }) });
      setQuestions(saved);
      setSaveState('gespeichert');
      onChanged();
    } catch (err) {
      setQuestions(before);
      setSaveState('fehler');
      setMessage(errorNotice(err));
    }
  }

  async function saveProfile() {
    setMessage('');
    try {
      const saved = await api(`/admin/forms/${formId}/save-profile`, { method: 'POST', body: JSON.stringify({ name: profileName }) });
      setMessage(`Gemerkt als „${saved.name}“. Du findest die Fragen beim nächsten Event unter den Startpunkten.`);
      onChanged();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const active = questions.filter((question) => question.active);
  const open = questions.find((question) => question.id === openId);

  return <div className="grid gap-4">
    <Notice message={message} />
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="grid content-start gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="q-panel-title">{data.form.name} <span className="q-panel-note">{active.length} aktive Fragen</span></h2>
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
        {!questions.length && <Panel><p className="text-q-muted">Noch keine Fragen. Wähle unten eine Antwortart, dann steht die erste Frage da.</p></Panel>}
        <AddQuestion onAdd={addQuestion} />
        <Panel>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Diese Fragen merken unter dem Namen"><Input value={profileName} onChange={(e) => setProfileName(e.target.value)} /></Field>
            <Button icon="questions" onClick={saveProfile}>Fragen merken</Button>
          </div>
        </Panel>
      </div>
      <div className="grid content-start gap-4 lg:sticky lg:top-4 lg:self-start">
        {open
          ? <Panel title="So sieht der Gast sie">
            <React.Suspense fallback={<p className="text-q-muted">Vorschau wird geladen …</p>}>
              <LazyQuestionPreview
                key={`${open.id}:${draftOfOpen?.questionType || open.question_type}`}
                question={toPreviewQuestion(draftOfOpen || toDraft(open))}
                brandColor={branding?.primaryColor || branding?.primary_color}
                texts={texts}
              />
            </React.Suspense>
            <p className="mt-2 q-hint">Die Vorschau ist bedienbar. Was du hier antippst, wird nirgends gespeichert.</p>
          </Panel>
          : <GuestFlowPreview questions={active} />}
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
  const TypeIcon = type.icon;
  const problemId = `frage-${question.id}-fehler`;

  useEffect(() => { onDraft(draft); }, [draft, onDraft]);

  // Gespeichert wird von selbst, kurz nachdem die Eingabe steht. Was die Gästeseite
  // zerbrechen würde, geht nicht raus — der Grund steht stattdessen an der Frage.
  useEffect(() => {
    if (!touched) return undefined;
    const found = questionProblems(draft);
    setProblems(found);
    if (found.length) return undefined;
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

  const iconButton = 'q-btn q-btn-ghost q-btn-icon';
  return <article
    className={`question-card ${open ? 'open' : ''}`}
    draggable={!open}
    onDragStart={(event) => event.dataTransfer.setData('text/plain', question.id)}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); onDropOn(event.dataTransfer.getData('text/plain')); }}
  >
    <div className="flex items-start gap-2 p-2.5">
      <span className="mt-2.5 hidden cursor-grab text-q-faint sm:block" aria-hidden="true" title="Zum Sortieren ziehen"><Icon name="grip" size={18} /></span>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="type-badge"><TypeIcon size={17} aria-hidden="true" /></span>
        <span className="min-w-0">
          <strong className="block truncate">{position + 1}. {question.label}</strong>
          <span className="block text-q-muted">{questionSummary(question)}</span>
        </span>
      </button>
      <div className="flex flex-none items-center gap-0.5">
        <button type="button" onClick={() => onMove('up')} disabled={position === 0} className={iconButton} style={{ width: 44, height: 44 }} aria-label={`„${question.label}“ nach oben`}><Icon name="chevronDown" size={16} className="rotate-180" /></button>
        <button type="button" onClick={() => onMove('down')} disabled={position === total - 1} className={iconButton} style={{ width: 44, height: 44 }} aria-label={`„${question.label}“ nach unten`}><Icon name="chevronDown" size={16} /></button>
        <button type="button" onClick={onToggle} className={iconButton} style={{ width: 44, height: 44 }} aria-label={open ? 'Frage zuklappen' : 'Frage bearbeiten'}><Icon name="settings" size={16} /></button>
      </div>
    </div>

    {problems.length > 0 && <ul id={problemId} role="alert" className="q-notice q-notice-error mx-3 mb-3 grid gap-1">
      {problems.map((problem) => <li key={problem}>{problem}</li>)}
    </ul>}

    {open && <div className="grid gap-3 border-t border-q-line p-3.5">
      <Field label="Frage, die Gäste sehen">
        <Input ref={labelRef} value={draft.label} aria-describedby={problems.length ? problemId : undefined} onChange={(event) => change({ label: event.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {promptIdeas.slice(0, 3).map((idea) => <button key={idea} type="button" className="q-chip" onClick={() => change({ label: idea })}>{idea}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Antwortart">
          <Select value={draft.questionType} onChange={(event) => {
            const next = event.target.value;
            change({ questionType: next, options: needsOptions(next) && !draft.options.length ? ['Erste Antwort', 'Zweite Antwort'] : draft.options });
          }}>
            {unknownTypeOption(draft.questionType) && <option value={draft.questionType}>{unknownTypeOption(draft.questionType).label}, {unknownTypeOption(draft.questionType).hint}</option>}
            {typeCards.map((item) => <option key={item.value} value={item.value}>{item.label}, {item.hint}</option>)}
          </Select>
        </Field>
        <Field label="Hinweis unter der Frage"><Input placeholder="Optional" value={draft.helpText} onChange={(event) => change({ helpText: event.target.value })} /></Field>
      </div>

      {needsOptions(draft.questionType) && <OptionRows options={draft.options} onChange={(options) => change({ options })} />}

      {['text_short', 'text_long'].includes(draft.questionType) && <Field label="Platzhalter im Feld">
        <Input placeholder="Optional" value={draft.placeholder} onChange={(event) => change({ placeholder: event.target.value })} />
      </Field>}

      <div className="flex flex-wrap items-center gap-5">
        <label className="q-check"><input type="checkbox" checked={draft.required} onChange={(event) => change({ required: event.target.checked })} /><span>Pflichtfrage</span></label>
        <label className="q-check"><input type="checkbox" checked={draft.active} onChange={(event) => change({ active: event.target.checked })} /><span>Gästen zeigen</span></label>
      </div>

      <div className="border-t border-q-line pt-2.5">
        <button type="button" className="text-q-muted underline" onClick={() => setShowKey(!showKey)}>{showKey ? 'Technisches ausblenden' : 'Technisches anzeigen'}</button>
        {showKey && <Field label="Interner Schlüssel" hint="Steht so in CSV, Excel und Webhooks. Ändere ihn nur, solange noch keine Antworten da sind." className="mt-2.5">
          <Input value={draft.internalName} onChange={(event) => change({ internalName: event.target.value })} style={{ fontFamily: 'ui-monospace, monospace' }} />
        </Field>}
      </div>

      <div className="flex justify-end border-t border-q-line pt-2.5">
        {confirming
          ? <span className="flex flex-wrap items-center gap-2">
            <span>Frage samt Antworten löschen?</span>
            <Button variant="danger" icon="trash" onClick={onDelete}>Ja, löschen</Button>
            <Button onClick={() => setConfirming(false)}>Abbrechen</Button>
          </span>
          : <Button icon="trash" onClick={() => setConfirming(true)}>Frage löschen</Button>}
      </div>
    </div>}
  </article>;
}

// Jede Antwortmöglichkeit hat ihre eigene Zeile: anlegen, umsortieren, entfernen.
function OptionRows({ options, onChange }) {
  const iconButton = 'q-btn q-btn-ghost q-btn-icon';
  return <div>
    <span className="q-label">Antwortmöglichkeiten</span>
    <ol className="mt-1.5 grid gap-1.5">
      {options.map((option, position) => <li key={position} className="flex flex-wrap items-center gap-1.5">
        <span className="w-5 flex-none text-q-faint">{position + 1}</span>
        <input className="q-input min-w-[9rem] flex-1" value={option} aria-label={`Antwortmöglichkeit ${position + 1}`} onChange={(event) => onChange(options.map((item, index) => (index === position ? event.target.value : item)))} />
        <button type="button" className={iconButton} style={{ width: 44, height: 44 }} disabled={position === 0} onClick={() => onChange(moveItem(options, position, position - 1))} aria-label={`Antwort ${position + 1} nach oben`}><Icon name="chevronDown" size={15} className="rotate-180" /></button>
        <button type="button" className={iconButton} style={{ width: 44, height: 44 }} disabled={position === options.length - 1} onClick={() => onChange(moveItem(options, position, position + 1))} aria-label={`Antwort ${position + 1} nach unten`}><Icon name="chevronDown" size={15} /></button>
        <button type="button" className={iconButton} style={{ width: 44, height: 44 }} onClick={() => onChange(options.filter((item, index) => index !== position))} aria-label={`Antwort ${position + 1} entfernen`}><Icon name="trash" size={15} /></button>
      </li>)}
    </ol>
    <Button size="sm" className="mt-1.5" icon="plus" onClick={() => onChange([...options, ''])}>Antwort hinzufügen</Button>
  </div>;
}

// Neue Fragen entstehen unten, dort wo die Liste endet.
function AddQuestion({ onAdd }) {
  return <div className="add-question">
    <p className="font-semibold">Frage hinzufügen</p>
    <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
      {typeCards.map((type) => {
        const TypeIcon = type.icon;
        return <button key={type.value} type="button" onClick={() => onAdd(type.value)} className="type-option">
          <TypeIcon size={18} className="flex-none text-q-muted" aria-hidden="true" />
          <span className="min-w-0"><strong className="block">{type.label}</strong><span className="block truncate text-q-muted" style={{ fontSize: 12 }}>{type.hint}</span></span>
        </button>;
      })}
    </div>
  </div>;
}

const stepHints = {
  rating: 'Sterne von 1 bis 5, springt direkt weiter',
  contact: 'Erscheint bei 1 oder 2 Sternen: Rückrufnummer und Anliegen',
  newsletter: 'Ja oder Nein, bei Ja folgt das Feld für die E-Mail-Adresse',
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
  return parts.join(', ');
}

function GuestFlowPreview({ questions }) {
  const steps = useMemo(() => buildSteps(questions, 0), [questions]);
  return <Panel title="Ablauf für Gäste">
    <p className="text-q-muted">Gäste sehen eine Frage pro Schritt. Klapp eine Frage auf, dann steht hier ihr echtes Gästebild.</p>
    <ol className="mt-3 grid gap-1.5">
      {steps.map((step, index) => <li key={step.id} className="flex items-start gap-2.5 rounded-lg bg-q-sunken p-2">
        <span className="step-dot">{index + 1}</span>
        <span className="min-w-0"><span className="block font-semibold">{stepTitle(step)}</span><span className="block q-hint">{stepHint(step)}</span></span>
      </li>)}
      <li className="flex items-start gap-2.5 rounded-lg border border-dashed border-q-line p-2">
        <Icon name="star" size={16} className="mt-0.5 text-q-star" />
        <span className="q-hint">{stepHints.contact}</span>
      </li>
    </ol>
  </Panel>;
}
