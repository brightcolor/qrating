import nodemailer from 'nodemailer';
import { vi } from 'vitest';
import { env } from '../../src/config/env.js';

// Stands in for the mail server of the installation: every mail it would send lands in `sent`,
// so a test reads the link a person would get. `restore()` puts the settings back.
export function catchSystemMail({ host = 'mail.example.test', from = 'qrating <noreply@example.test>' } = {}) {
  const before = { systemSmtpHost: env.systemSmtpHost, systemMailFrom: env.systemMailFrom };
  Object.assign(env, { systemSmtpHost: host, systemMailFrom: from });
  const sent = [];
  const transports = [];
  const spy = vi.spyOn(nodemailer, 'createTransport').mockImplementation((options) => {
    transports.push(options);
    return {
      sendMail: async (message) => {
        sent.push({ transport: options, ...message });
        return { messageId: `test-${sent.length}` };
      }
    };
  });
  return {
    sent,
    transports,
    linkTo(address) {
      const mail = [...sent].reverse().find((item) => item.to === address);
      return mail?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
    },
    restore() {
      spy.mockRestore();
      Object.assign(env, before);
    }
  };
}
