import net from 'node:net';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SmtpService } from '../src/services/smtpService.js';

// A mail server that says yes to everything and keeps what it received.
// It proves that the mail library really speaks SMTP, beyond a mocked transport.
function createMailbox() {
  const received = [];
  const server = net.createServer((socket) => {
    let body = null;
    socket.write('220 qrating-test ESMTP\r\n');
    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (body !== null) {
        body += text;
        if (body.includes('\r\n.\r\n')) {
          received.push(body.slice(0, body.indexOf('\r\n.\r\n')));
          body = null;
          socket.write('250 OK: queued\r\n');
        }
        return;
      }
      for (const line of text.split('\r\n').filter(Boolean)) {
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO' || command === 'HELO') socket.write('250-qrating-test\r\n250 8BITMIME\r\n');
        else if (command === 'MAIL' || command === 'RCPT') socket.write('250 OK\r\n');
        else if (command === 'DATA') {
          body = '';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else socket.write('250 OK\r\n');
      }
    });
  });
  return { server, received };
}

let server;
let received;
let port;

describe('sending mail through the mail library', () => {
  beforeAll(async () => {
    ({ server, received } = createMailbox());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = server.address().port;
  });

  afterAll(() => {
    server?.close();
  });

  it('delivers subject, recipient and German text to the mail server', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          organization_id: 'org-1',
          host: '127.0.0.1',
          port,
          secure: false,
          username: null,
          password_encrypted: null,
          from_email: 'feedback@example.com',
          from_name: 'qrating Gäste',
          reply_to: null,
          enabled: true
        }]
      })
    };

    const result = await new SmtpService(db).sendMail('org-1', {
      to: 'team@example.com',
      subject: 'Bewertung für das Sommerfest',
      text: 'Die Gäste grüßen aus Wismar.'
    });

    expect(result.accepted).toEqual(['team@example.com']);
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('To: team@example.com');
    expect(received[0]).toContain('From: =?UTF-8?');
    // Umlauts travel encoded; decoded again they are the text that was sent.
    const body = received[0].slice(received[0].indexOf('\r\n\r\n') + 4).trim();
    const decoded = Buffer.from(body.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'binary').toString('utf8');
    expect(decoded).toContain('Die Gäste grüßen aus Wismar.');
  });
});
