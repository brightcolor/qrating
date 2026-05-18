import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, buildOtpAuthUrl, generateRecoveryCodes, totpCode, verifyTotp } from '../src/services/twoFactorService.js';

describe('twoFactorService', () => {
  it('round-trips base32 secrets', () => {
    const input = Buffer.from('qrating-security');
    expect(base32Decode(base32Encode(input)).toString()).toBe('qrating-security');
  });

  it('generates and verifies TOTP codes', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = 60_000;
    const code = totpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, { now, window: 0 })).toBe(true);
    expect(verifyTotp(secret, '000000', { now, window: 0 })).toBe(false);
  });

  it('builds provisioning URIs and recovery codes', () => {
    const uri = buildOtpAuthUrl({ account: 'admin@example.com', secret: 'ABCDEF' });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('issuer=qrating');
    expect(generateRecoveryCodes()).toHaveLength(8);
  });
});
