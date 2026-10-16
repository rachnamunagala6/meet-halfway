const test = require('node:test');
const assert = require('node:assert/strict');
const {
  newAdminToken,
  hashToken,
  tokenMatches,
  cleanMember,
  addMember,
  removeMember,
  mergeForUpdate,
} = require('../lib/members');

test('tokenMatches accepts the right token and rejects wrong, empty, or missing ones', () => {
  const token = newAdminToken();
  const hash = hashToken(token);
  assert.equal(tokenMatches(token, hash), true);
  assert.equal(tokenMatches(newAdminToken(), hash), false);
  assert.equal(tokenMatches('', hash), false);
  assert.equal(tokenMatches(token, null), false);
  assert.equal(tokenMatches(token, 'not-hex'), false);
});

test('admin tokens are unique and the hash does not contain the token', () => {
  const a = newAdminToken();
  const b = newAdminToken();
  assert.notEqual(a, b);
  assert.ok(!hashToken(a).includes(a));
});

test('cleanMember trims, uppercases the airport, and assigns an id', () => {
  const { member, error } = cleanMember({ name: '  Priya ', city: ' Austin, TX ', airport: 'aus' });
  assert.equal(error, undefined);
  assert.equal(member.name, 'Priya');
  assert.equal(member.city, 'Austin, TX');
  assert.equal(member.airport, 'AUS');
  assert.ok(member.id && member.id.length >= 8);
});

test('cleanMember allows a blank airport but rejects a malformed one', () => {
  assert.equal(cleanMember({ name: 'A', city: 'B' }).member.airport, '');
  assert.match(cleanMember({ name: 'A', city: 'B', airport: 'DENV' }).error, /3-letter/);
  assert.match(cleanMember({ name: 'A', city: 'B', airport: '12' }).error, /3-letter/);
});

test('cleanMember requires a name and a city', () => {
  assert.match(cleanMember({ city: 'Denver' }).error, /Name/);
  assert.match(cleanMember({ name: 'Sam' }).error, /city/);
  assert.match(cleanMember(null).error, /Name/);
});

test('addMember appends without mutating the original trip', () => {
  const group = { name: 'T', members: [{ id: 'a' }] };
  const next = addMember(group, { id: 'b' });
  assert.deepEqual(next.members.map((m) => m.id), ['a', 'b']);
  assert.equal(group.members.length, 1);
});

test('removeMember drops the person and only their saved prices', () => {
  const group = {
    members: [{ id: 'a' }, { id: 'b' }],
    estimates: { 'd1:a': { price: 100 }, 'd1:b': { price: 200 }, 'd2:b': { price: 300 } },
  };
  const { group: next, error } = removeMember(group, 'b');
  assert.equal(error, undefined);
  assert.deepEqual(next.members, [{ id: 'a' }]);
  assert.deepEqual(Object.keys(next.estimates), ['d1:a']);
});

test('removeMember reports unknown ids and refuses to empty the trip', () => {
  assert.equal(removeMember({ members: [{ id: 'a' }, { id: 'b' }] }, 'zzz').error, 'not_found');
  assert.equal(removeMember({ members: [{ id: 'a' }] }, 'a').error, 'last_member');
});

test('mergeForUpdate keeps the stored members even if the browser copy is stale', () => {
  const stored = { members: [{ id: 'a' }, { id: 'c' }] };
  const stale = { name: 'Renamed', members: [{ id: 'a' }, { id: 'b' }], destinations: [1] };
  const merged = mergeForUpdate(stored, stale);
  assert.deepEqual(merged.members, [{ id: 'a' }, { id: 'c' }]);
  assert.equal(merged.name, 'Renamed');
  assert.deepEqual(merged.destinations, [1]);
});
