// S_19 Tournament — database adapter
// Two engines behind one small async API (get / all / run):
// - Postgres, when DATABASE_URL is set (Neon free tier on Render).
//   The connection string comes from the environment only.
// - SQLite (local file data/s19-tournament.db), when DATABASE_URL is
//   unset — for local tests. On Render free tier the disk is ephemeral,
//   so the local file is lost on redeploy; use Neon for live data.
// Callers keep writing `?` placeholders: the Postgres path converts
// them to $1, $2, ... automatically.
'use strict';
const fs = require('fs');
const path = require('path');

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY,
  account_id INTEGER UNIQUE NOT NULL,
  username TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  ign TEXT NOT NULL DEFAULT '',
  uid TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  password_salt TEXT,
  last_spin_date TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  mode TEXT NOT NULL,
  match_type TEXT NOT NULL,
  map TEXT NOT NULL DEFAULT 'Bermuda',
  pov TEXT NOT NULL DEFAULT 'TPP',
  match_date TEXT NOT NULL,
  match_time TEXT NOT NULL,
  total_slots INTEGER NOT NULL,
  entry_fee INTEGER NOT NULL DEFAULT 0,
  prize_pool INTEGER NOT NULL DEFAULT 0,
  per_kill_prize INTEGER NOT NULL DEFAULT 0,
  per_kill_points INTEGER NOT NULL DEFAULT 0,
  room_id TEXT NOT NULL DEFAULT '',
  room_password TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'upcoming'
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  tournament_id INTEGER NOT NULL,
  profile_id INTEGER NOT NULL,
  slot_number INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE (tournament_id, slot_number)
);
CREATE TABLE IF NOT EXISTS wallet_tx (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  trx_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY,
  tournament_id INTEGER NOT NULL,
  profile_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  placement INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  prize INTEGER NOT NULL DEFAULT 0,
  prize_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (tournament_id, profile_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`;

// Postgres equivalent. Same tables; SERIAL keys, TEXT/INTEGER types.
const PG_SCHEMA = SQLITE_SCHEMA
  .replace(/INTEGER PRIMARY KEY/g, 'SERIAL PRIMARY KEY')
  .replace(/TEXT NOT NULL DEFAULT ''/g, "TEXT NOT NULL DEFAULT ''");

function qToPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

let engine = null;
let pgPool = null;
let sqliteDb = null;

function stripChannelBinding(url) {
  return url.replace(/[?&]channel_binding=require/g, '').replace(/\?$/, '');
}

async function init() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const { Pool, types } = require('pg');
    types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 -> number
    pgPool = new Pool({
      connectionString: stripChannelBinding(databaseUrl),
      ssl: { rejectUnauthorized: false },
    });
    await pgPool.query(PG_SCHEMA);
    engine = 'postgres';
    return engine;
  }
  const { DatabaseSync } = require('node:sqlite');
  const dir = path.join(__dirname, 'data');
  fs.mkdirSync(dir, { recursive: true });
  sqliteDb = new DatabaseSync(path.join(dir, 's19-tournament.db'));
  sqliteDb.exec(SQLITE_SCHEMA);
  engine = 'sqlite';
  return engine;
}

function getEngine() { return engine; }

async function get(sql, params = []) {
  if (engine === 'postgres') {
    const r = await pgPool.query(qToPg(sql), params);
    return r.rows[0] || null;
  }
  const row = sqliteDb.prepare(sql).get(...params);
  return row || null;
}

async function all(sql, params = []) {
  if (engine === 'postgres') {
    const r = await pgPool.query(qToPg(sql), params);
    return r.rows;
  }
  return sqliteDb.prepare(sql).all(...params);
}

async function run(sql, params = []) {
  if (engine === 'postgres') {
    const r = await pgPool.query(qToPg(sql), params);
    const idRow = r.rows && r.rows[0];
    return { id: idRow ? (idRow.id ?? null) : null, changes: r.rowCount || 0 };
  }
  const info = sqliteDb.prepare(sql).run(...params);
  return { id: info.lastInsertRowid ? Number(info.lastInsertRowid) : null, changes: info.changes };
}

// INSERT ... RETURNING id works on both engines via run() above when the
// SQL carries RETURNING; for SQLite use lastInsertRowid instead.
async function insert(sql, params = []) {
  if (engine === 'postgres') {
    const r = await pgPool.query(qToPg(sql + ' RETURNING id'), params);
    return r.rows[0] ? r.rows[0].id : null;
  }
  const info = sqliteDb.prepare(sql).run(...params);
  return info.lastInsertRowid ? Number(info.lastInsertRowid) : null;
}

module.exports = { init, getEngine, get, all, run, insert };
