const crypto = require('crypto');

// ---------- Admin token ----------
// The trip creator gets a random token once, when the trip is created. Only its
// SHA-256 hash is stored (in its own column, never inside the trip JSON that
// every member can read), so a leaked database row can't be replayed as admin.

function newAdminToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Members ----------

function newMemberId() {
  return crypto.randomBytes(5).toString('hex');
}

// Validates and normalizes a member submitted from the browser. Returns
// { member } on success or { error } with a message that is safe to show.
function cleanMember(input) {
  const name = String((input && input.name) || '').trim();
  const city = String((input && input.city) || '').trim();
  const airportRaw = String((input && input.airport) || '').trim().toUpperCase();
  if (!name) return { error: 'Name is required' };
  if (!city) return { error: 'Home city is required' };
  if (name.length > 60) return { error: 'Name is too long (60 characters max)' };
  if (city.length > 80) return { error: 'City is too long (80 characters max)' };
  if (airportRaw && !/^[A-Z]{3}$/.test(airportRaw)) {
    return { error: 'Airport must be a 3-letter code like DEN, or left blank' };
  }
  return { member: { id: newMemberId(), name, city, airport: airportRaw } };
}

function addMember(group, member) {
  return { ...group, members: [...(group.members || []), member] };
}

// Removes a member and any prices that were recorded for them (estimate keys
// look like "<destinationId>:<memberId>"). Refuses to empty the trip.
function removeMember(group, memberId) {
  const members = group.members || [];
  if (!members.some((m) => m.id === memberId)) return { error: 'not_found' };
  if (members.length === 1) return { error: 'last_member' };
  const estimates = {};
  for (const [key, value] of Object.entries(group.estimates || {})) {
    if (!key.endsWith(':' + memberId)) estimates[key] = value;
  }
  return {
    group: { ...group, members: members.filter((m) => m.id !== memberId), estimates },
  };
}

// The browser saves the whole trip back on every change. Members are managed
// only through the member endpoints, so a stale copy in someone's browser can
// never bring back a removed person or drop a newly added one.
function mergeForUpdate(existing, incoming) {
  return { ...incoming, members: (existing && existing.members) || [] };
}

module.exports = {
  newAdminToken,
  hashToken,
  tokenMatches,
  cleanMember,
  addMember,
  removeMember,
  mergeForUpdate,
};
