// A stand-in for Cloudflare's D1, made from the SQLite that comes with Node: the few calls the
// store uses (prepare, bind, all, first, run, batch), in memory. For checks only.
import { DatabaseSync } from 'node:sqlite';

export function standInD1(){
  const sql = new DatabaseSync(':memory:');
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    all: async () => ({ results: /^\s*(SELECT|INSERT[^;]*RETURNING)/i.test(q) ? sql.prepare(q).all(...args) : (sql.prepare(q).run(...args), []) }),
    first: async () => sql.prepare(q).get(...args) ?? null,
    run: async () => { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: q => stmt(q), batch: async list => { const out = []; for (const s of list) out.push(await s.all()); return out; } };
}
