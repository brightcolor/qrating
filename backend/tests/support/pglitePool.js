import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Stand-in for src/db/pool.js that runs every statement in an in-process PostgreSQL.
export function createPglitePool() {
  const db = new PGlite({ extensions: { pgcrypto } });

  // Mirrors node-postgres: no parameters use the simple protocol (several statements allowed).
  const runner = (target) => async (text, params = []) => {
    if (!params.length) {
      const results = await target.exec(text);
      const last = results.at(-1) ?? { rows: [] };
      return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
    }
    const values = params.map((value) => (value === undefined ? null : value));
    const result = await target.query(text, values);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };

  const query = runner(db);
  return {
    db,
    query,
    pool: { query },
    withTransaction: (fn) => db.transaction((tx) => fn({ query: runner(tx) }))
  };
}
