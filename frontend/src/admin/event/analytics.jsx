import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDate } from '../eventLabel.js';
import { Button, Icon, Notice, Panel, Select, Stars, errorNotice, useAsync } from '../ui.jsx';
import {
  callbacksFirst,
  choiceQuestions,
  distributionRows,
  filterVoices,
  funnelSteps,
  hourColumns,
  kpis,
  voiceCounts,
  voiceFilters,
  voiceView
} from './model.js';

// The evaluation of an event in the ten looks. The blocks below read the same numbers; each
// look arranges them its own way, as in its draft.

// ------------------------------------------------------------------ numbers on top

export function kpiCells(k) {
  return [
    { id: 'votes', label: 'Stimmen', value: k.votes, note: k.onlyStars ? `davon ${k.onlyStars} nur mit Sternen` : 'alle mit Antworten', meter: k.opened ? k.votes / k.opened : 0, meterNote: `von ${k.opened}` },
    { id: 'average', label: 'Schnitt', value: k.average, note: 'von 5 Sternen', stars: Math.round(k.averageValue), meter: k.averageValue / 5, meterNote: 'von 5' },
    { id: 'sent', label: 'Abgeschickt', value: `${k.completion} %`, note: `${k.sent} von ${k.opened} geöffnet`, meter: k.completion / 100, meterNote: `${k.sent} Bögen`, cool: true },
    { id: 'scans', label: 'Scans in der Runde', short: 'Scans', value: k.scans, note: k.scansBefore ? `${k.scansBefore} vor dem Start` : 'keine vor dem Start', meter: k.scans + k.scansBefore ? k.scans / (k.scans + k.scansBefore) : 0, meterNote: k.scansBefore ? `+${k.scansBefore} vorher` : 'in der Runde', cool: true },
    { id: 'newsletter', label: 'Newsletter', value: k.newsletter, note: 'Anmeldungen', meter: k.votes ? k.newsletter / k.votes : 0, meterNote: 'Anmeldungen' },
    { id: 'callbacks', label: 'Rückrufe', value: k.openCases, note: k.openCases ? `offen, ${k.openWithPhone} mit Nummer` : 'nichts offen', hot: k.openCases > 0, meterNote: 'offen' }
  ];
}

function KpiStrip({ k }) {
  return <div className="kpi-strip">
    {kpiCells(k).map((cell) => <div key={cell.id} className={`kpi-cell ${cell.hot ? 'hot' : ''}`}>
      <div className="l">{cell.label}</div>
      <div className="v q-num">{cell.value}</div>
      <div className="n">{cell.stars ? <Stars rating={cell.stars} size={13} className="text-q-star" /> : cell.note}</div>
    </div>)}
  </div>;
}

function KpiLedger({ k }) {
  return <div className="kpi-ledger">
    {kpiCells(k).map((cell) => <div key={cell.id} className={cell.hot ? 'hl' : ''}>
      <div className="l">{cell.short || cell.label}</div>
      <div className="v q-num">{cell.hot ? <span>{cell.value} offen</span> : cell.value}</div>
      <div className="s">{cell.hot ? cell.note.replace(/^offen, /, '') : cell.note}</div>
    </div>)}
  </div>;
}

function Meter({ share, cool }) {
  const lit = Math.round(Math.max(0, Math.min(1, share)) * 16);
  return <div className={`meter ${cool ? 'cool' : ''}`} aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} className={index < lit ? 'on' : ''} />)}</div>;
}

function KpiChannels({ k }) {
  return <div className="kpi-channels">
    {kpiCells(k).map((cell) => <div key={cell.id} className="strip">
      {cell.id === 'callbacks' ? <div className={`lamp ${cell.hot ? 'on' : ''}`} aria-hidden="true" /> : <Meter share={cell.meter} cool={cell.cool} />}
      <div className="v q-num">{cell.id === 'sent' ? `${k.completion} %` : cell.value}</div>
      <div className="l">{cell.short || cell.label}<br />{cell.meterNote}</div>
    </div>)}
  </div>;
}

function KpiCards({ k, glow }) {
  return <div className={`kpi-cards ${glow ? 'glow' : ''}`}>
    {kpiCells(k).map((cell) => <div key={cell.id} className={`kpi-card ${cell.hot ? 'hot' : ''} ${cell.id === 'average' && glow ? 'star' : ''}`}>
      {!glow && <div className="l">{cell.short || cell.label}</div>}
      <div className="v q-num">{cell.hot && !glow ? `${cell.value} offen` : cell.value}</div>
      <div className="s">{glow ? `${cell.short || cell.label}, ${cell.note}` : cell.hot ? cell.note.replace(/^offen, /, '') : cell.note}</div>
    </div>)}
  </div>;
}

export function KpiInline({ k, className = 'ticket-nums' }) {
  return <div className={className}>
    {kpiCells(k).map((cell) => <div key={cell.id} className={cell.hot ? 'hot' : ''}>
      <div className="l">{cell.short || cell.label}</div>
      <div className="v q-num">{cell.value}</div>
      <div className="s">{cell.id === 'callbacks' ? 'offen' : cell.note}</div>
    </div>)}
  </div>;
}

function KpiNumbers({ k }) {
  return <div className="kpi-numbers">
    {kpiCells(k).map((cell) => <div key={cell.id} className={cell.hot ? 'hot' : ''}>
      <div className="v q-num">{cell.value}</div>
      <div className="l">{cell.short || cell.label}, {cell.note}</div>
    </div>)}
  </div>;
}

function KpiPoster({ k }) {
  return <div className="kpi-poster">
    {kpiCells(k).map((cell) => <div key={cell.id} className={cell.hot ? 'hot' : ''}>
      <div className="v q-num">{cell.value}</div>
      <div className="l">{cell.short || cell.label}</div>
      <div className="s">{cell.note}</div>
    </div>)}
  </div>;
}

// ------------------------------------------------------------------ stars

function DistBars({ rows, className = '' }) {
  return <div className={`dist-bars ${className}`.trim()}>
    {rows.map((row) => <div key={row.stars} className={`row ${row.stars <= 2 ? 'low' : ''}`}>
      <Stars rating={row.stars} size={12} className="text-q-star" />
      <div className="bar"><i style={{ width: `${row.share * 100}%` }} /></div>
      <span className="c q-num">{row.count}</span>
    </div>)}
  </div>;
}

function TallyMarks({ count }) {
  const groups = [];
  for (let left = count; left > 0; left -= 5) groups.push(Math.min(5, left));
  return <span className="marks" aria-hidden="true">
    {groups.map((size, index) => <svg key={index} className="grp" viewBox="0 0 22 16">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {Array.from({ length: Math.min(size, 4) }, (_, i) => <line key={i} x1={3 + i * 4} y1="2" x2={3 + i * 4} y2="14" />)}
        {size === 5 && <line x1="1" y1="12" x2="19" y2="4" />}
      </g>
    </svg>)}
  </span>;
}

function DistTally({ rows }) {
  return <div className="dist-tally">
    {rows.map((row) => <div key={row.stars} className="row">
      <Stars rating={row.stars} size={12} className="text-q-star" />
      {row.count > 60 ? <span className="marks" style={{ fontWeight: 700 }}>{row.count} Striche</span> : <TallyMarks count={row.count} />}
      <span className="c q-num">{row.count}</span>
    </div>)}
  </div>;
}

function DistFaders({ rows }) {
  return <div className="dist-faders">
    {[...rows].reverse().map((row) => <div key={row.stars} className={`fader ${row.stars <= 2 ? 'low' : ''}`}>
      <div className="track"><div className="lvl" style={{ height: `${row.share * 100}%` }} /><div className="knob" style={{ bottom: `${row.share * 100}%` }} /></div>
      <div className="c q-num">{row.count}</div>
      <div className="s">{row.stars} {row.stars === 1 ? 'Stern' : 'Sterne'}</div>
    </div>)}
  </div>;
}

const ratingColors = { 5: 'var(--r5)', 4: 'var(--r4)', 3: 'var(--r3)', 2: 'var(--r2)', 1: 'var(--r1)' };

function DistMini({ rows }) {
  return <div className="dist-mini">
    {rows.map((row) => <div key={row.stars} className="row">
      <span>{row.stars}★</span>
      <div className="bar"><i style={{ width: `${row.share * 100}%`, background: ratingColors[row.stars] }} /></div>
      <b className="q-num">{row.count}</b>
    </div>)}
  </div>;
}

function DistTable({ rows, question }) {
  return <table className="q-table dist-table">
    <tbody>
      {rows.map((row) => <tr key={row.stars}>
        <td className="text-q-star"><Stars rating={row.stars} size={11} /></td>
        <td><span className={`mini ${row.stars <= 2 ? 'low' : ''}`} style={{ width: `${Math.max(2, row.share * 150)}px` }} /></td>
        <td className="r q-num">{row.count}</td>
      </tr>)}
      {question?.answers.slice(0, 3).map((answer, index) => <tr key={answer.value} className={index === 0 ? 'first' : ''}>
        <td colSpan={2} className="text-q-muted">Schluss: {answer.value}</td>
        <td className="r q-num">{answer.count}</td>
      </tr>)}
    </tbody>
  </table>;
}

// ------------------------------------------------------------------ hours and places

function HourColumns({ columns }) {
  if (!columns.length) return <p className="text-q-muted">Noch keine Stimmen.</p>;
  return <div className="hours">
    {columns.map((column) => <div key={column.label} className={column.later ? 'later' : ''} title={`${column.count} Stimmen`}>
      <i style={{ height: `${Math.max(3, column.share * 86)}px` }} />{column.label}
    </div>)}
  </div>;
}

export function SourcesTable({ rows }) {
  if (!rows?.length) return <p className="text-q-muted">Noch keine Scans über QR-Plätze.</p>;
  return <table className="q-table">
    <thead><tr><th>Platz</th><th className="r">Scans</th><th className="r">Stimmen</th><th className="r">Schnitt</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.source_slug || row.label}>
      <td>{row.label}</td>
      <td className="r q-num">{row.scans_count || 0}</td>
      <td className="r q-num">{row.feedback_count || 0}</td>
      <td className="r q-num">{row.average_rating ? String(Number(row.average_rating).toFixed(1)).replace('.', ',') : '–'}</td>
    </tr>)}</tbody>
  </table>;
}

// ------------------------------------------------------------------ the way from the scan

function FunnelTracks({ funnel }) {
  return <div className="funnel-tracks">
    {funnel.steps.map((step, index) => <div key={`${step.kind}-${index}`} className="st">
      <span className="n">{index + 1}</span>
      <div className="track"><i style={{ width: `${step.share * 100}%` }} /><b>{step.label}</b></div>
      <span className="num"><span className="q-num">{step.count}</span> <small>{step.percent} %</small></span>
    </div>)}
  </div>;
}

function FunnelChecklist({ funnel }) {
  return <div className="funnel-check">
    {funnel.steps.map((step, index) => <div key={`${step.kind}-${index}`} className="row">
      <span className={`box ${step.count ? 'done' : ''}`}>{step.count ? <Icon name="check" size={12} /> : null}</span>
      <span>{step.label}</span>
      <span className="c q-num">{step.count}</span>
      <span className="p">{step.percent} %</span>
    </div>)}
  </div>;
}

function FunnelLeds({ funnel }) {
  return <div className="funnel-leds">
    {funnel.steps.map((step, index) => {
      const lit = Math.round(step.share * 20);
      return <div key={`${step.kind}-${index}`} className="hbar">
        <span>{step.label}</span>
        <div className="leds" aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < lit ? 'on' : ''} />)}</div>
        <span className="n"><span className="q-num">{step.count}</span> <small>{step.percent}%</small></span>
      </div>;
    })}
  </div>;
}

function FunnelBars({ funnel }) {
  return <div className="funnel-bars">
    {funnel.steps.map((step, index) => <div key={`${step.kind}-${index}`} className="r">
      <span>{step.label}</span><b className="q-num">{step.count}</b><small>{step.percent} %</small>
      <div className="bar"><i style={{ width: `${step.share * 100}%` }} /></div>
    </div>)}
  </div>;
}

function FunnelSteps({ funnel }) {
  return <div className="funnel-steps">
    {funnel.steps.map((step, index) => <div key={`${step.kind}-${index}`} className="st">
      <span className="dot">{index + 1}</span>
      <div className="min-w-0"><div className="truncate">{step.label}</div><div className="bar"><i style={{ width: `${step.share * 100}%` }} /></div></div>
      <b className="q-num">{step.count}</b>
    </div>)}
  </div>;
}

function FunnelRows({ funnel }) {
  return <div className="funnel-rows">
    {funnel.steps.map((step, index) => <div key={`${step.kind}-${index}`} className="r">
      <span>{step.label}</span><b className="q-num">{step.count}</b><small>{step.percent} %</small>
    </div>)}
  </div>;
}

function FunnelTable({ funnel }) {
  return <table className="q-table">
    <tbody>{funnel.steps.map((step, index) => <tr key={`${step.kind}-${index}`}>
      <td className="text-q-muted">{index + 1}</td>
      <td>{step.label}</td>
      <td className="r q-num">{step.count}</td>
      <td className="r text-q-muted">{step.percent} %</td>
    </tr>)}</tbody>
  </table>;
}

// ------------------------------------------------------------------ answers to choice questions

function ChoiceList({ question, percent }) {
  if (!question) return null;
  return <div className="choice-list">
    <b>{question.label}</b>
    {question.answers.map((answer) => <div key={answer.value} className="r">
      <span>{answer.value}</span>
      <b className="q-num">{answer.count}</b>
      {percent && <small>{Math.round((answer.count / question.total) * 100)} %</small>}
    </div>)}
  </div>;
}

// ------------------------------------------------------------------ voices

function useExpand(voices, count) {
  const [all, setAll] = useState(false);
  const shown = all ? voices : voices.slice(0, count);
  const more = voices.length > count && !all
    ? <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(true)}>Alle {voices.length} Stimmen zeigen</Button>
    : null;
  return [shown, more];
}

function CallbackTag({ voice, className = 'cb' }) {
  if (!voice.caseOpen) return null;
  return <span className={className}><Icon name="callbacks" size={12} />Rückruf offen</span>;
}

function VoiceCards({ voices }) {
  const [shown, more] = useExpand(voices.filter((voice) => voice.text), 6);
  if (!shown.length) return <p className="text-q-muted">Noch hat niemand etwas geschrieben.</p>;
  return <>
    <div className="voice-cards">
      {shown.map((voice) => <div key={voice.id} className={`voice ${voice.rating <= 2 ? 'low' : ''}`}>
        <div className="h"><Stars rating={voice.rating} size={12} className="text-q-star" /><span>{voice.place}, {voice.when}</span></div>
        <span className="k">{voice.kind}</span>
        <p>{voice.text}</p>
        {voice.more.map((extra) => <p key={extra.label} className="more"><span>{extra.label}:</span> {extra.value}</p>)}
        <CallbackTag voice={voice} />
      </div>)}
    </div>
    {more}
  </>;
}

function VoiceFilterChips({ voices, filter, setFilter }) {
  const counts = voiceCounts(voices);
  return <div className="flex flex-wrap gap-1.5">
    {voiceFilters.map((item) => <button key={item.id} type="button" className="q-chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} {counts[item.id]}</button>)}
  </div>;
}

function VoiceMarkerTable({ voices }) {
  const [filter, setFilter] = useState('all');
  const list = callbacksFirst(filterVoices(voices, filter));
  const [shown, more] = useExpand(list, 8);
  return <>
    <VoiceFilterChips voices={voices} filter={filter} setFilter={setFilter} />
    <table className="q-table voice-marker mt-2">
      <thead><tr><th>Sterne</th><th>Was der Gast schreibt</th><th>Platz</th><th>Zeit</th></tr></thead>
      <tbody>
        {shown.map((voice) => <tr key={voice.id} className={voice.caseOpen ? 'flag' : ''}>
          <td className="st"><Stars rating={voice.rating} size={12} /></td>
          <td>{voice.text || <span className="text-q-muted">nur Sterne</span>}{voice.caseOpen && <span className="cb">Rückruf offen, bitte klären</span>}</td>
          <td className="t">{voice.place}</td>
          <td className="t">{voice.when}</td>
        </tr>)}
        {!shown.length && <tr><td colSpan={4} className="text-q-muted">Keine Stimmen in dieser Auswahl.</td></tr>}
      </tbody>
    </table>
    {more}
  </>;
}

function VoiceList({ voices, count = 5, meta = 'right' }) {
  const [shown, more] = useExpand(voices.filter((voice) => voice.text), count);
  if (!shown.length) return <p className="text-q-muted">Noch hat niemand etwas geschrieben.</p>;
  return <>
    <div className={`voice-list meta-${meta}`}>
      {shown.map((voice) => <div key={voice.id} className={`voice ${voice.rating <= 2 ? 'low' : ''}`}>
        <span className="s"><Stars rating={voice.rating} size={12} /></span>
        <div className="body">{meta === 'top' && <span className="k">{voice.kind}</span>}<p>{voice.text}</p><CallbackTag voice={voice} /></div>
        <span className="m">{voice.place}, {voice.when}</span>
      </div>)}
    </div>
    {more}
  </>;
}

function VoiceTable({ voices, count = 6 }) {
  const [shown, more] = useExpand(voices.filter((voice) => voice.text), count);
  if (!shown.length) return <p className="text-q-muted">Noch hat niemand etwas geschrieben.</p>;
  return <>
    <table className="q-table voice-table">
      <tbody>{shown.map((voice) => <tr key={voice.id} className={voice.rating <= 2 ? 'low' : ''}>
        <td className="st"><Stars rating={voice.rating} size={12} /></td>
        <td>{voice.text}{voice.caseOpen && <span className="cb">Rückruf offen</span>}</td>
        <td className="m">{voice.place}<br />{voice.when}</td>
      </tr>)}</tbody>
    </table>
    {more}
  </>;
}

function VoiceGrid({ voices, count = 7 }) {
  const [shown, more] = useExpand(voices.filter((voice) => voice.text), count);
  return <>
    <table className="q-table voice-grid">
      <tbody>{shown.map((voice) => <tr key={voice.id} className={voice.caseOpen ? 'flag' : ''}>
        <td className="st"><Stars rating={voice.rating} size={11} /></td>
        <td className="txt">{voice.text}{voice.caseOpen && <b className="text-q-danger"> Rückruf offen</b>}</td>
        <td className="text-q-muted">{voice.place}</td>
        <td className="text-q-muted">{voice.when}</td>
      </tr>)}
      {!shown.length && <tr><td className="text-q-muted">Noch hat niemand etwas geschrieben.</td></tr>}</tbody>
    </table>
    {more}
  </>;
}

// ------------------------------------------------------------------ what else the evaluation holds

function Abandoned({ abandoned = [] }) {
  if (!abandoned.length) return <Panel title="Angefangen und nicht abgeschickt"><p className="text-q-muted">Bisher hat niemand unterwegs etwas eingegeben und dann aufgehört.</p></Panel>;
  return <Panel title="Angefangen und nicht abgeschickt" note={`${abandoned.length} Besuche`}>
    <p className="mb-3 text-q-muted">Diese Gäste haben unterwegs schon etwas gesagt und die Bewertung dann verlassen. Rufnummer, Anliegen und E-Mail-Adresse stehen hier nie, die gehören dem Gast, bis er abschickt.</p>
    <div className="grid gap-2">
      {abandoned.slice(0, 30).map((visit) => <div key={visit.id} className="border-b border-q-line pb-2 last:border-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <strong>{visit.rating ? `${visit.rating} von 5 Sternen` : 'ohne Sterne'}</strong>
          <span className="text-q-muted">{formatDate(visit.lastSeenAt)}, aufgehört bei {visit.stepLabel || visit.step}{visit.stepsTotal ? ` (Schritt ${visit.stepIndex + 1} von ${visit.stepsTotal})` : ''}</span>
        </div>
        {visit.entries?.length > 0 && <dl className="mt-1 grid gap-0.5">
          {visit.entries.map((entry, index) => <div key={index} className="flex flex-wrap gap-x-2"><dt className="text-q-muted">{entry.label}:</dt><dd className="m-0 font-semibold">{entry.value}</dd></div>)}
        </dl>}
      </div>)}
    </div>
  </Panel>;
}

function MoreAnswers({ questions }) {
  if (!questions.length) return null;
  return <Panel title="Antworten auf eure Fragen">
    <div className="answers-grid">
      {questions.map((question) => <div key={question.id}>
        <p className="mb-1.5 font-semibold">{question.label}</p>
        {question.answers.map((answer) => <div key={answer.value} className="flex items-center gap-2 py-0.5">
          <span className="min-w-0 flex-1 truncate">{answer.value}</span>
          <span className="choice-bar"><i style={{ width: `${(answer.count / question.answers[0].count) * 100}%` }} /></span>
          <b className="q-num w-8 text-right">{answer.count}</b>
        </div>)}
      </div>)}
    </div>
  </Panel>;
}

function Extras({ analytics, questions }) {
  return <div className="extras-grid">
    <MoreAnswers questions={questions} />
    <Abandoned abandoned={analytics.abandoned} />
  </div>;
}

// ------------------------------------------------------------------ the callback beside the stream

export function CallbackDetail({ voice, onChanged }) {
  const { data: users } = useAsync(() => api('/admin/users'), []);
  const [contact, setContact] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => { setContact(null); setMessage(''); }, [voice?.id]);
  if (!voice) return <Panel title="Rückruf"><p className="text-q-muted">Wähle links eine Stimme mit „Rückruf offen“, dann steht sie hier.</p></Panel>;

  async function run(action, success) {
    setMessage('');
    try {
      const result = await action();
      if (success) setMessage(success);
      onChanged?.();
      return result;
    } catch (err) {
      setMessage(errorNotice(err));
      return null;
    }
  }

  return <Panel title="Rückruf" note={`${voice.rating} ${voice.rating === 1 ? 'Stern' : 'Sterne'}, ${voice.when}`} className="case-detail">
    <p className="q">{voice.text ? `„${voice.text}“` : 'Ohne Text.'}</p>
    {voice.caseId ? <>
      <div className="meta">
        <div><small>Stand</small>{voice.caseOpen ? 'Offen' : 'Erledigt'}</div>
        <div><small>Nummer</small>{contact?.contactPhone || (voice.caseHasPhone ? 'hinterlegt' : 'keine')}</div>
        <div><small>Anliegen</small>{contact?.contactNote || '–'}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {voice.caseHasPhone && !contact && <Button variant="primary" icon="phone" onClick={async () => { const result = await run(() => api(`/admin/pii-vault/low-rating-cases/${voice.caseId}/reveal`, { method: 'POST', body: '{}' })); if (result) setContact(result); }}>Nummer anzeigen</Button>}
        {voice.caseOpen && <Button icon="check" onClick={() => run(() => api(`/admin/low-rating-cases/${voice.caseId}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }), 'Als geklärt vermerkt.')}>Erledigt</Button>}
        <Select value="" onChange={(e) => e.target.value && run(() => api(`/admin/low-rating-cases/${voice.caseId}`, { method: 'PATCH', body: JSON.stringify({ assignedUserId: e.target.value }) }), 'Zuständigkeit gespeichert.')} aria-label="Zuweisen" style={{ width: 'auto' }}>
          <option value="">Zuweisen …</option>
          {users?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </Select>
      </div>
    </> : <p className="text-q-muted">Zu dieser Stimme gibt es keinen Rückruf-Fall.</p>}
    <Notice message={message} className="mt-3" />
  </Panel>;
}

// ------------------------------------------------------------------ the arrangement of each look

export function useEvaluation(event, analytics) {
  return useMemo(() => {
    if (!analytics) return null;
    const zone = event?.event_timezone;
    const voices = (analytics.voices || []).map((voice) => voiceView(voice, zone));
    const questions = choiceQuestions(analytics.questionStats);
    return {
      k: kpis(analytics),
      rows: distributionRows(analytics.distribution),
      hours: hourColumns(analytics.timeline, { columns: 8, zone }),
      funnel: funnelSteps(analytics.funnel),
      questions,
      first: questions[0] || null,
      voices
    };
  }, [event?.event_timezone, analytics]);
}

function EmptyFunnel() {
  return <p className="text-q-muted">Für dieses Event ist noch kein Scan und kein Aufruf gezählt.</p>;
}

export function Analytics({ themeId, event, analytics, onChanged }) {
  const e = useEvaluation(event, analytics);
  const { data: qr } = useAsync(() => (themeId === 'baendchen' && event ? api(`/admin/events/${event.id}/qr-analytics`) : Promise.resolve(null)), [themeId, event?.id]);
  if (!e) return null;
  const funnel = e.funnel.steps.length ? e.funnel : null;
  const extras = <Extras analytics={analytics} questions={e.questions.slice(themeId === 'baendchen' || themeId === 'einlassliste' || themeId === 'mischpult' ? 0 : 1)} />;

  switch (themeId) {
    case 'einlassliste':
      return <>
        <KpiLedger k={e.k} />
        <div className="sheet-body">
          <div className="col"><h2 className="sheet-h">Stimmen <small>neueste zuerst</small></h2><VoiceMarkerTable voices={e.voices} /></div>
          <div className="col">
            <h2 className="sheet-h">Strichliste <small>{e.k.votes} Stimmen</small></h2>
            <DistTally rows={e.rows} />
            <h2 className="sheet-h next">Vom Scan bis zum Abschicken <small>von {e.funnel.basis}</small></h2>
            {funnel ? <FunnelChecklist funnel={funnel} /> : <EmptyFunnel />}
          </div>
        </div>
        <div className="sheet-extras">{extras}</div>
      </>;
    case 'mischpult':
      return <div className="grid gap-3.5">
        <div className="grid gap-3.5 xl:grid-cols-[1.35fr_1fr]">
          <Panel title="Kanäle" note={`Stand ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}><KpiChannels k={e.k} /></Panel>
          <Panel title="Sterne" note={`${e.k.votes} Stimmen`}><DistFaders rows={e.rows} /></Panel>
        </div>
        <div className="grid gap-3.5 xl:grid-cols-[1fr_1.25fr]">
          <Panel title="Vom Scan bis zum Abschicken" note={`von ${e.funnel.basis}`}>{funnel ? <FunnelLeds funnel={funnel} /> : <EmptyFunnel />}</Panel>
          <Panel title="Was Gäste geschrieben haben" note="neueste zuerst"><VoiceList voices={e.voices} /></Panel>
        </div>
        {extras}
      </div>;
    case 'ablaufplan':
      return <div className="grid gap-3">
        <KpiCards k={e.k} />
        <div className="grid gap-3 xl:grid-cols-[.9fr_1.05fr_1.25fr]">
          <Panel title="Sterne" note={`${e.k.votes} Stimmen`}><DistBars rows={e.rows} /><div className="choice-sep"><ChoiceList question={e.first} /></div></Panel>
          <Panel title="Vom Scan bis zum Abschicken" note={`von ${e.funnel.basis}`}>{funnel ? <FunnelBars funnel={funnel} /> : <EmptyFunnel />}</Panel>
          <Panel title="Was Gäste geschrieben haben" note="neueste zuerst"><VoiceList voices={e.voices} meta="top" /></Panel>
        </div>
        {extras}
      </div>;
    case 'eintrittskarte':
      return <div className="grid gap-3">
        <div className="grid gap-3 xl:grid-cols-[1fr_1.05fr_1.3fr]">
          <Panel title="Sterne" note={`${e.k.votes} Stimmen`}><DistBars rows={e.rows} /><div className="choice-sep"><ChoiceList question={e.first} /></div></Panel>
          <Panel title="Vom Scan bis zum Abschicken" note={`von ${e.funnel.basis} Scans`}>{funnel ? <FunnelSteps funnel={funnel} /> : <EmptyFunnel />}</Panel>
          <Panel title="Was Gäste geschrieben haben" note="neueste zuerst"><VoiceList voices={e.voices} meta="top" /></Panel>
        </div>
        {extras}
      </div>;
    case 'kommandozeile':
      return <>
        <KpiNumbers k={e.k} />
        <div className="cmd-cols">
          <div className="col"><h3 className="q-panel-title">Sterne <small className="q-panel-note">{e.k.votes} Stimmen</small></h3><DistBars rows={e.rows} /><div className="mt-4"><ChoiceList question={e.first} percent /></div></div>
          <div className="col"><h3 className="q-panel-title">Vom Scan bis zum Abschicken <small className="q-panel-note">von {e.funnel.basis}</small></h3>{funnel ? <FunnelRows funnel={funnel} /> : <EmptyFunnel />}</div>
          <div className="col"><h3 className="q-panel-title">Was Gäste geschrieben haben <small className="q-panel-note">neueste zuerst</small></h3><VoiceTable voices={e.voices} /></div>
        </div>
        <div className="mt-4">{extras}</div>
      </>;
    case 'plakat':
      return <div className="grid gap-4">
        <KpiPoster k={e.k} />
        <div className="grid gap-3.5 xl:grid-cols-[.95fr_1fr_1.3fr]">
          <Panel title="Sterne" note={`${e.k.votes} Stimmen`}><DistBars rows={e.rows} /><div className="choice-sep"><ChoiceList question={e.first} /></div></Panel>
          <Panel title="Vom Scan bis zum Abschicken" note={`von ${e.funnel.basis}`}>{funnel ? <FunnelRows funnel={funnel} /> : <EmptyFunnel />}</Panel>
          <Panel title="Was Gäste schreiben" note="neueste zuerst"><VoiceList voices={e.voices} meta="top" /></Panel>
        </div>
        {extras}
      </div>;
    case 'schwarzlicht':
      return <div className="grid gap-3">
        <KpiCards k={e.k} glow />
        <div className="grid gap-3 xl:grid-cols-[1fr_1.05fr_1.35fr]">
          <Panel title="Sterne" note={`${e.k.votes} Stimmen`}><DistBars rows={e.rows} /><div className="choice-sep"><ChoiceList question={e.first} /></div></Panel>
          <Panel title="Vom Scan zum Abschicken" note={`von ${e.funnel.basis}`}>{funnel ? <FunnelRows funnel={funnel} /> : <EmptyFunnel />}</Panel>
          <Panel title="Was Gäste schreiben" note="neueste zuerst"><VoiceList voices={e.voices} meta="top" /></Panel>
        </div>
        {extras}
      </div>;
    case 'tabellenwerk':
      return <>
        <div className="grid-cols-table">
          <div><h3 className="table-h">Sterne <span>{e.k.votes} Stimmen</span></h3><DistTable rows={e.rows} question={e.first} /></div>
          <div><h3 className="table-h">Vom Scan bis zum Abschicken <span>von {e.funnel.basis}</span></h3>{funnel ? <FunnelTable funnel={funnel} /> : <div className="p-3"><EmptyFunnel /></div>}</div>
          <div><h3 className="table-h">Stimmen <span>neueste zuerst</span></h3><VoiceGrid voices={e.voices} /></div>
        </div>
        <div className="mt-3 px-4 pb-4">{extras}</div>
      </>;
    case 'posteingang':
      return null; // The inbox look draws its own page around the stream (workspace.jsx).
    default:
      return <div className="grid gap-3.5">
        <KpiStrip k={e.k} />
        <div className="grid gap-3.5 lg:grid-cols-3">
          <Panel title="Sterne" note={`${e.k.votes} Stimmen`}><DistBars rows={e.rows} /></Panel>
          <Panel title="Wann bewertet wurde" note="Stimmen je Stunde"><HourColumns columns={e.hours} /></Panel>
          <Panel title="QR-Plätze" note="in der Runde"><SourcesTable rows={qr?.bySource} /></Panel>
          <Panel title="Vom Scan bis zum Abschicken">{funnel ? <FunnelTracks funnel={funnel} /> : <EmptyFunnel />}</Panel>
          <Panel title="Was Gäste geschrieben haben" note="neueste zuerst" className="lg:col-span-2"><VoiceCards voices={e.voices} /></Panel>
        </div>
        {extras}
      </div>;
  }
}

// ------------------------------------------------------------------ the inbox look

export function InboxStream({ event, analytics, onChanged, header }) {
  const e = useEvaluation(event, analytics);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const voices = e ? filterVoices(e.voices, filter) : [];
  useEffect(() => {
    if (!e) return;
    const open = e.voices.find((voice) => voice.caseOpen);
    setSelected((current) => (current && e.voices.some((voice) => voice.id === current) ? current : open?.id || null));
  }, [e]);
  const [shown, more] = useExpand(voices, 25);
  const chosen = e?.voices.find((voice) => voice.id === selected) || null;
  if (!e) return null;
  return <div className="inbox">
    <section className="inbox-stream">
      <div className="sh">
        {header}
        <VoiceFilterChips voices={e.voices} filter={filter} setFilter={setFilter} />
      </div>
      {shown.map((voice) => <button key={voice.id} type="button" className={`item ${voice.id === selected ? 'sel' : ''} ${voice.text ? '' : 'quiet'}`} style={{ '--edge': ratingColors[voice.rating] }} onClick={() => setSelected(voice.id)}>
        <span className="h"><b>{voice.rating} {voice.rating === 1 ? 'Stern' : 'Sterne'}</b><span className="s"><Stars rating={voice.rating} size={12} /></span><span>{voice.kind}, {voice.place}</span><span className="w">{voice.when}</span></span>
        <span className="p">{voice.text || 'Keine weiteren Antworten'}</span>
        {voice.more.map((extra) => <span key={extra.label} className="p more">{extra.label}: {extra.value}</span>)}
        {voice.caseOpen && <span className="tag"><Icon name="callbacks" size={12} />Rückruf offen</span>}
      </button>)}
      {!shown.length && <p className="p-4 text-q-muted">Keine Stimmen in dieser Auswahl.</p>}
      <div className="px-4 pb-4">{more}</div>
    </section>
    <section className="inbox-side">
      <div className="kpi-grid6">
        {kpiCells(e.k).map((cell) => <div key={cell.id} className={cell.hot ? 'hot' : ''}><div className="v q-num">{cell.value}</div><div className="l">{cell.short || cell.label}{cell.id === 'votes' && e.k.onlyStars ? `, ${e.k.onlyStars} nur Sterne` : ''}</div></div>)}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Sterne" note={String(e.k.votes)}><DistMini rows={e.rows} /></Panel>
        <Panel title="Vom Scan zum Abschicken">{e.funnel.steps.length ? <FunnelRows funnel={{ ...e.funnel, steps: [e.funnel.steps[0], e.funnel.steps[1], e.funnel.steps.at(-1)].filter(Boolean) }} /> : <EmptyFunnel />}</Panel>
      </div>
      <CallbackDetail voice={chosen} onChanged={onChanged} />
      <Extras analytics={analytics} questions={e.questions} />
    </section>
  </div>;
}
