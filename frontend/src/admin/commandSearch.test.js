import { describe, expect, it } from 'vitest';
import { commandEntries, normalize, searchCommands } from './commandSearch.js';

const events = [
  { id: 'e1', name: 'Wismar tanzt – Gestört aber GeiL', location: 'Wismar' },
  { id: 'e2', name: 'Herbstnacht' }
];

describe('the search bar of the command look', () => {
  const entries = commandEntries({ events });

  it('finds an event by the start of a word and offers its tabs', () => {
    const labels = searchCommands(entries, 'wis').map((entry) => entry.label);

    expect(labels[0]).toBe('Wismar tanzt – Gestört aber GeiL');
    expect(labels).toContain('Fragen von Wismar tanzt – Gestört aber GeiL');
    expect(labels).toContain('QR & Aushang von Wismar tanzt – Gestört aber GeiL');
  });

  it('finds a settings page by what it contains', () => {
    expect(searchCommands(entries, 'pretix').map((entry) => entry.label)).toContain('Verbindungen');
    expect(searchCommands(entries, 'impressum').map((entry) => entry.label)).toContain('Organisation');
  });

  it('ignores accents, so a quick search finds the page', () => {
    expect(normalize('Rückrufe')).toBe('ruckrufe');
    expect(searchCommands(entries, 'ruckruf').map((entry) => entry.label)).toContain('Rückrufe');
  });

  it('offers events and pages before anyone types, the tabs only on a search', () => {
    const offered = searchCommands(entries, '', 50);

    expect(offered.some((entry) => entry.group === 'Direkt zu')).toBe(false);
    expect(offered[0].group).toBe('Events');
  });

  it('keeps the platform pages for the platform role', () => {
    expect(searchCommands(entries, 'mandanten')).toEqual([]);
    expect(searchCommands(commandEntries({ events, platformAdmin: true }), 'mandanten').map((entry) => entry.label)).toEqual(['Mandanten']);
  });

  it('finds nothing for words nobody uses', () => {
    expect(searchCommands(entries, 'xylophon')).toEqual([]);
  });
});
