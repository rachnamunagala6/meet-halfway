const { Pool } = require('pg');

// Neon (and most hosted Postgres) require SSL; rejectUnauthorized:false is the
// standard workaround for their auto-generated certs not chaining to a local CA.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function initSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      code TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Added after launch: hash of the trip creator's admin token. Kept out of the
  // JSON blob because every member can read that. NULL on trips created before
  // admin controls existed -- see the claim-admin route.
  await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS admin_hash TEXT');
}

async function tripExists(code) {
  const { rows } = await pool.query('SELECT 1 FROM trips WHERE code = $1', [code]);
  return rows.length > 0;
}

async function getTrip(code) {
  const { rows } = await pool.query('SELECT data FROM trips WHERE code = $1', [code]);
  return rows[0] ? rows[0].data : null;
}

async function getTripRow(code) {
  const { rows } = await pool.query('SELECT data, admin_hash FROM trips WHERE code = $1', [code]);
  return rows[0] ? { data: rows[0].data, adminHash: rows[0].admin_hash } : null;
}

async function insertTrip(code, data, adminHash = null) {
  await pool.query('INSERT INTO trips (code, data, admin_hash) VALUES ($1, $2, $3)', [
    code,
    data,
    adminHash,
  ]);
}

// Runs fn(data, adminHash) inside a transaction with the trip row locked, so
// two people joining at the same moment can't overwrite each other's change.
// fn returns an object: { data } to save new trip JSON, { adminHash } to set the
// admin hash, and any other keys are passed back to the caller untouched.
// Resolves to { notFound: true } when the code doesn't exist.
async function withTrip(code, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT data, admin_hash FROM trips WHERE code = $1 FOR UPDATE',
      [code]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return { notFound: true };
    }
    const result = (await fn(rows[0].data, rows[0].admin_hash)) || {};
    if (result.data) {
      await client.query('UPDATE trips SET data = $2, updated_at = now() WHERE code = $1', [
        code,
        result.data,
      ]);
    }
    if (result.adminHash) {
      await client.query('UPDATE trips SET admin_hash = $2 WHERE code = $1', [
        code,
        result.adminHash,
      ]);
    }
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* connection already gone */
    }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema, tripExists, getTrip, getTripRow, insertTrip, withTrip };
