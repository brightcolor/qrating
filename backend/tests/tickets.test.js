import { describe, expect, it } from 'vitest';
import { publicUpcoming, ticketsAvailable } from '../src/services/upcomingService.js';

const now = new Date('2026-09-18T12:00:00.000Z');

function pretixEvent(payload, overrides = {}) {
  return {
    id: 'event-1',
    name: 'Wismar tanzt',
    date_from: '2026-09-19T15:30:00.000Z',
    pretix_public_url: 'https://www.hsp-tickets.de/hsp-events/gag-wismar-2026/',
    raw_source_payload: payload,
    ...overrides
  };
}

describe('the ticket link of a coming event', () => {
  it('leads to the shop while the sale runs', () => {
    const event = pretixEvent({ live: true, presale_start: '2026-05-26T00:00:00+02:00', presale_end: '2026-09-18T23:59:59+02:00' });

    expect(ticketsAvailable(event, now)).toBe(true);
    expect(publicUpcoming(event, {}, now)).toMatchObject({
      ticketsAvailable: true,
      shopUrl: 'https://www.hsp-tickets.de/hsp-events/gag-wismar-2026/'
    });
  });

  it('stays away before the sale starts and after it ended', () => {
    const early = pretixEvent({ live: true, presale_start: '2026-09-19T21:30:00+02:00', presale_end: '2027-09-18T23:59:59+02:00' });
    const over = pretixEvent({ live: true, presale_start: '2026-06-04T00:00:00+02:00', presale_end: '2026-07-07T23:59:59+02:00' });

    expect(ticketsAvailable(early, now)).toBe(false);
    expect(ticketsAvailable(over, now)).toBe(false);
    expect(publicUpcoming(early, {}, now).shopUrl).toBe(null);
    expect(publicUpcoming(over, {}, now).shopUrl).toBe(null);
  });

  it('stays away while the shop is not public', () => {
    const hidden = pretixEvent({ live: false, presale_start: '2026-05-26T00:00:00+02:00', presale_end: '2026-12-24T23:59:59+01:00' });

    expect(ticketsAvailable(hidden, now)).toBe(false);
  });

  it('follows the switch of the event', () => {
    const event = pretixEvent({ live: true }, { ticket_link_enabled: false });

    expect(ticketsAvailable(event, now)).toBe(false);
    expect(publicUpcoming(event, {}, now).shopUrl).toBe(null);
  });

  it('trusts an event without Pretix data and takes the shop of the organization', () => {
    const own = { id: 'event-2', name: 'Sommerfest', date_from: '2026-10-01T18:00:00.000Z', raw_source_payload: null };

    expect(ticketsAvailable(own, now)).toBe(true);
    expect(publicUpcoming(own, { ticketshop_url: 'https://shop.example.test' }, now)).toMatchObject({
      ticketsAvailable: true,
      shopUrl: 'https://shop.example.test'
    });
  });

  it('reads the data of the sync even as text', () => {
    const asText = pretixEvent(JSON.stringify({ live: true, presale_end: '2026-07-07T23:59:59+02:00' }));

    expect(ticketsAvailable(asText, now)).toBe(false);
  });

  it('says nothing about tickets without any address', () => {
    const noShop = { id: 'event-3', name: 'Offene Bühne', date_from: '2026-10-01T18:00:00.000Z' };

    expect(publicUpcoming(noShop, {}, now)).toMatchObject({ ticketsAvailable: false, shopUrl: null });
  });
});
