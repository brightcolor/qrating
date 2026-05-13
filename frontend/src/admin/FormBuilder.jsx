import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { linesToOptions, makeKey, optionsToLines, promptIdeas, typeCards } from './formBuilderUtils.js';

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
  return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message || String(error)}</div>;
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
        <h1 className="text-3xl font-bold tracking-tight">Form builder</h1>
        <p className="mt-1 text-neutral-600">Start with a profile, adjust the questions, and save your own version for the next event.</p>
      </div>
      <button onClick={() => setReload(reload + 1)} className="button-secondary"><RefreshCw size={16} /> Refresh</button>
    </div>
    {error && <div className="mt-4"><ErrorBox error={error} /></div>}
    <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <ProfileLauncher events={events || []} profiles={profiles} onCreated={(form) => { setSelected(form.id); setReload(reload + 1); }} />
        <Panel title="Your forms">
          <CreateBlankForm events={events || []} onCreated={(form) => { setSelected(form.id); setReload(reload + 1); }} />
          <div className="mt-4 space-y-2">
            {loading && <p className="text-sm text-neutral-500">Loading forms ...</p>}
            {(forms || []).map((form) => <button key={form.id} onClick={() => setSelected(form.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === form.id ? 'bg-neutral-950 text-white' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
              <span className="font-medium">{form.name}</span>
              <span className="mt-1 block text-xs opacity-75">{form.is_template ? 'Question profile' : 'Event form'}</span>
            </button>)}
          </div>
        </Panel>
      </div>
      {selected ? <FormEditor key={selected} formId={selected} form={selectedForm} onChanged={() => setReload(reload + 1)} /> : <Panel><p className="text-neutral-600">Choose a form or create one from a profile.</p></Panel>}
    </div>
  </div>;
}

function ProfileLauncher({ events, profiles, onCreated }) {
  const builtIn = profiles?.builtIn || [];
  const saved = profiles?.saved || [];
  const [draft, setDraft] = useState({ profileId: '', templateFormId: '', eventId: '', name: '' });
  const selected = builtIn.find((item) => item.id === draft.profileId) || saved.find((item) => item.id === draft.templateFormId);

  async function createFromProfile() {
    if (!draft.profileId && !draft.templateFormId) return;
    const created = await api('/admin/forms/from-profile', {
      method: 'POST',
      body: JSON.stringify({ ...draft, name: draft.name || selected?.name || 'New feedback form', isTemplate: !draft.eventId })
    });
    setDraft({ profileId: '', templateFormId: '', eventId: '', name: '' });
    onCreated(created);
  }

  return <Panel title="Question profiles" action={<Sparkles className="text-blue-600" size={20} />}>
    <div className="grid gap-3">
      {builtIn.map((profile) => <ProfileCard key={profile.id} profile={profile} active={draft.profileId === profile.id} onPick={() => setDraft({ ...draft, profileId: profile.id, templateFormId: '', name: profile.name })} />)}
      {saved.map((profile) => <ProfileCard key={profile.id} profile={{ ...profile, questionCount: profile.question_count, badge: 'Saved', summary: profile.description || 'Your reusable question set.' }} active={draft.templateFormId === profile.id} onPick={() => setDraft({ ...draft, profileId: '', templateFormId: profile.id, name: profile.name })} />)}
    </div>
    <div className="mt-4 space-y-3 rounded-md bg-blue-50 p-3">
      <input className="input" placeholder="Name for this form" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <select className="input" value={draft.eventId} onChange={(e) => setDraft({ ...draft, eventId: e.target.value })}>
        <option value="">Save as reusable profile</option>
        {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>
      <button type="button" onClick={createFromProfile} className="button-blue w-full" disabled={!selected}><Sparkles size={16} /> Use selected profile</button>
    </div>
  </Panel>;
}

function ProfileCard({ profile, active, onPick }) {
  return <button type="button" onClick={onPick} className={`rounded-lg border p-3 text-left transition ${active ? 'border-blue-600 bg-blue-50' : 'border-neutral-200 bg-white hover:border-blue-300'}`}>
    <div className="flex items-center justify-between gap-3">
      <strong>{profile.name}</strong>
      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{profile.badge || `${profile.questionCount} questions`}</span>
    </div>
    <p className="mt-1 text-sm text-neutral-600">{profile.summary}</p>
    <p className="mt-2 text-xs font-medium text-blue-700">{profile.questionCount} editable questions</p>
  </button>;
}

function CreateBlankForm({ events, onCreated }) {
  const [name, setName] = useState('New feedback form');
  const [eventId, setEventId] = useState('');
  async function submit(e) {
    e.preventDefault();
    const form = await api('/admin/forms', { method: 'POST', body: JSON.stringify({ name, eventId: eventId || null, isTemplate: !eventId }) });
    onCreated(form);
  }
  return <form onSubmit={submit} className="space-y-2">
    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
    <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
      <option value="">Reusable profile</option>
      {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
    </select>
    <button className="button-primary w-full"><Plus size={16} /> Start blank</button>
  </form>;
}

function FormEditor({ formId, form, onChanged }) {
  const [reload, setReload] = useState(0);
  const [profileName, setProfileName] = useState(`${form?.name || 'Feedback form'} profile`);
  const [message, setMessage] = useState('');
  const { data, loading, error } = useAsync(() => api(`/admin/forms/${formId}`), [formId, reload]);
  if (loading) return <Panel><p>Loading form ...</p></Panel>;
  if (error) return <ErrorBox error={error} />;

  async function refresh() {
    setReload(reload + 1);
    onChanged();
  }
  async function remove(questionId) {
    await api(`/admin/forms/${formId}/questions/${questionId}`, { method: 'DELETE' });
    refresh();
  }
  async function saveProfile() {
    const saved = await api(`/admin/forms/${formId}/save-profile`, { method: 'POST', body: JSON.stringify({ name: profileName }) });
    setMessage(`Saved as "${saved.name}".`);
    onChanged();
  }

  const activeQuestions = data.questions.filter((question) => question.active);
  return <div className="space-y-6">
    <Panel title={data.form.name} action={<span className="rounded-full bg-neutral-100 px-3 py-1 text-sm">{activeQuestions.length} active questions</span>}>
      {message && <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
        <button onClick={saveProfile} className="button-secondary"><Save size={16} /> Save as profile</button>
      </div>
      <QuestionCreate formId={formId} nextOrder={(data.questions.length + 1) * 10} onCreated={refresh} />
    </Panel>
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {data.questions.map((question) => <QuestionRow key={question.id} formId={formId} question={question} onSaved={refresh} onDelete={() => remove(question.id)} />)}
        {!data.questions.length && <Panel><p className="text-sm text-neutral-500">No custom questions yet. Pick an idea above or start with a profile.</p></Panel>}
      </div>
      <PublicPreview questions={data.questions} />
    </div>
  </div>;
}

function QuestionCreate({ formId, nextOrder, onCreated }) {
  const [draft, setDraft] = useState({ label: '', internalName: '', questionType: 'text_long', helpText: '', placeholder: '', options: '', required: false });
  const selectedType = typeCards.find((type) => type.value === draft.questionType);
  async function submit(e) {
    e.preventDefault();
    await api(`/admin/forms/${formId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ ...draft, internalName: draft.internalName || makeKey(draft.label), sortOrder: nextOrder, options: linesToOptions(draft.options) })
    });
    setDraft({ label: '', internalName: '', questionType: 'text_long', helpText: '', placeholder: '', options: '', required: false });
    onCreated();
  }
  return <form onSubmit={submit} className="mt-5 space-y-4 rounded-lg bg-neutral-50 p-4">
    <div>
      <label className="text-sm font-medium">Question guests will see</label>
      <input className="input mt-1" placeholder="What should guests answer?" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value, internalName: draft.internalName || makeKey(e.target.value) })} required />
      <div className="mt-2 flex flex-wrap gap-2">{promptIdeas.map((idea) => <button key={idea} type="button" className="rounded-full bg-white px-3 py-1 text-xs text-neutral-700 ring-1 ring-neutral-200 hover:bg-blue-50" onClick={() => setDraft({ ...draft, label: idea, internalName: makeKey(idea) })}>{idea}</button>)}</div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{typeCards.map((type) => <TypeCard key={type.value} type={type} active={draft.questionType === type.value} onPick={() => setDraft({ ...draft, questionType: type.value })} />)}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <input className="input" placeholder="Helpful hint, optional" value={draft.helpText} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} />
      <input className="input" placeholder="Placeholder, optional" value={draft.placeholder} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} />
    </div>
    {['checkboxes', 'multiple_choice'].includes(draft.questionType) && <textarea className="input min-h-24" placeholder="One option per line" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Make it required</label>
      <button className="button-blue"><Plus size={16} /> Add {selectedType?.label || 'question'}</button>
    </div>
  </form>;
}

function TypeCard({ type, active, onPick }) {
  const Icon = type.icon;
  return <button type="button" onClick={onPick} className={`rounded-lg border p-3 text-left ${active ? 'border-blue-600 bg-white shadow-sm' : 'border-neutral-200 bg-white/70 hover:bg-white'}`}>
    <Icon size={18} className={active ? 'text-blue-600' : 'text-neutral-500'} />
    <strong className="mt-2 block text-sm">{type.label}</strong>
    <span className="text-xs text-neutral-500">{type.hint}</span>
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
  const type = typeCards.find((item) => item.value === draft.questionType) || typeCards[0];
  const Icon = type.icon;

  async function save(nextDraft = draft) {
    await api(`/admin/forms/${formId}/questions/${question.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...nextDraft, options: linesToOptions(nextDraft.options) })
    });
    onSaved();
  }
  async function duplicate() {
    await api(`/admin/forms/${formId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ ...draft, label: `${draft.label} copy`, internalName: `${draft.internalName}_copy`, sortOrder: Number(draft.sortOrder || 0) + 1, options: linesToOptions(draft.options) })
    });
    onSaved();
  }

  return <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="rounded-md bg-blue-50 p-2 text-blue-700"><Icon size={18} /></span>
        <span>
          <strong className="block">{draft.label}</strong>
          <span className="text-sm text-neutral-500">{type.label} · order {draft.sortOrder} · {draft.active ? 'visible' : 'hidden'}</span>
        </span>
      </button>
      <div className="flex flex-wrap gap-2">
        <button onClick={duplicate} className="button-secondary"><Copy size={16} /> Duplicate</button>
        <button onClick={() => save()} className="button-primary"><Save size={16} /> Save</button>
        <button onClick={onDelete} className="button-secondary" title="Delete"><Trash2 size={16} /></button>
      </div>
    </div>
    {open && <div className="mt-4 grid gap-3">
      <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{typeCards.map((item) => <TypeCard key={item.value} type={item} active={draft.questionType === item.value} onPick={() => setDraft({ ...draft, questionType: item.value })} />)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="Guest hint" value={draft.helpText} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} />
        <input className="input" placeholder="Placeholder" value={draft.placeholder} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} />
      </div>
      {['checkboxes', 'multiple_choice'].includes(draft.questionType) && <textarea className="input min-h-24" placeholder="One option per line" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />}
      <div className="grid gap-3 md:grid-cols-[1fr_160px_auto_auto]">
        <input className="input" placeholder="Advanced key" value={draft.internalName} onChange={(e) => setDraft({ ...draft, internalName: e.target.value })} />
        <input className="input" type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Required</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Visible</label>
      </div>
    </div>}
  </div>;
}

function PublicPreview({ questions }) {
  const visible = useMemo(() => questions.filter((question) => question.active).slice(0, 8), [questions]);
  return <Panel title="Guest preview" action={<Eye size={18} className="text-blue-600" />}>
    <div className="rounded-2xl bg-neutral-950 p-3">
      <div className="rounded-xl bg-white p-4">
        <div className="h-24 rounded-lg bg-gradient-to-br from-blue-600 to-neutral-900" />
        <p className="mt-4 text-sm text-neutral-500">How was your evening?</p>
        <div className="mt-2 flex gap-1 text-blue-600"> {[1, 2, 3, 4, 5].map((item) => <Star key={item} size={24} fill="currentColor" />)}</div>
        {visible.map((question) => <div key={question.id} className="mt-4 rounded-md border border-neutral-200 p-3">
          <div className="text-sm font-medium">{question.label}</div>
          <div className="mt-2 h-9 rounded-md bg-neutral-100" />
        </div>)}
      </div>
    </div>
  </Panel>;
}
