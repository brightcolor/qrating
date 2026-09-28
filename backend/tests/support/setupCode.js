// The first setup asks for the code the operator reads in the log. Tests fetch a fresh one the
// same way the backend does at its start; the database is the one the test file mocks.
import { query } from '../../src/db/pool.js';
import { issueSetupCode } from '../../src/services/setupService.js';

export function freshSetupCode() {
  return issueSetupCode({ query });
}
