import { defineConfig } from 'vitest/config';

// The tests sign in far more often than a person does, so the limits for sign-in stay out of
// their way. Every other setting keeps its default; tests that need another value say so.
// A test that sets several passwords hashes each one properly, which takes its time when all
// files run at once.
export default defineConfig({
  test: {
    testTimeout: 20_000,
    env: {
      AUTH_RATE_LIMIT_MAX: '100000',
      PASSWORD_RESET_RATE_LIMIT_MAX: '100000'
    }
  }
});
