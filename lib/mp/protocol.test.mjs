// Self-check for the multiplayer protocol: node lib/mp/protocol.test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// protocol.ts imports '../course-rounds' without an extension, as the site's bundler expects.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
    return next(spec, ctx);
  },
});
const { parseSettings, parseSwing, cleanName, makeCode, parseCode, memberName, presenceUserIds, presentPlayers, CODE_ALPHABET, LOBBY_EVENTS } =
  await import('./protocol.ts');

// ── parseSettings ──
const base = { format: 'stroke', pace: 'own', clock: 30, maxPlayers: 2 };
const daily = { ...base, spec: { kind: 'daily', seed: '2026-10-24' } };
const random = { ...base, format: 'match', pace: 'turns', spec: { kind: 'random', seed: 'k3x9qa' } };
const real = { ...base, spec: { kind: 'real', id: 'augusta', mode: 'back', day: '2026-10-24' } };
assert.deepEqual(parseSettings(daily), daily);
assert.deepEqual(parseSettings(random), random);
assert.deepEqual(parseSettings(real), real);
for (const id of ['victoria', 'gary-player', 'tpc-sawgrass', 'augusta'])
  assert.ok(parseSettings({ ...real, spec: { ...real.spec, id } }), id);
// Extra fields are dropped, not passed on
assert.deepEqual(parseSettings({ ...daily, evil: 1, spec: { ...daily.spec, x: '<b>' } }), daily);

assert.equal(parseSettings({ ...daily, format: 'skins' }), null, 'unknown format');
assert.equal(parseSettings({ ...daily, pace: 'fast' }), null, 'unknown pace');
assert.equal(parseSettings({ ...real, spec: { ...real.spec, id: 'no-such-links' } }), null, 'unknown course');
for (const id of ['pebble-beach', 'ironmere']) assert.equal(parseSettings({ ...real, spec: { ...real.spec, id } })?.spec.id, id, `${id} can be played in a lobby`);
assert.equal(parseSettings({ ...real, spec: { ...real.spec, id: 'toString' } }), null, 'inherited key is not a course');
assert.equal(parseSettings({ ...real, spec: { ...real.spec, mode: 'middle' } }), null, 'unknown mode');
assert.equal(parseSettings({ ...real, spec: { ...real.spec, day: '2026-02-30' } }), null, 'bad day');
assert.equal(parseSettings({ ...daily, spec: { kind: 'daily', seed: 'abc' } }), null, 'daily seed is a day');
assert.equal(parseSettings({ ...daily, spec: { kind: 'weekly', seed: '2026-10-24' } }), null, 'unknown kind');
assert.equal(parseSettings({ ...random, spec: { kind: 'random', seed: '' } }), null, 'empty seed');
assert.equal(parseSettings({ ...random, spec: { kind: 'random', seed: 'x'.repeat(33) } }), null, 'long seed');
assert.equal(parseSettings({ ...random, spec: { kind: 'random', seed: 7 } }), null, 'seed is a string');
assert.equal(parseSettings({ ...daily, clock: 10 }), null, 'clock is 30');
// lobbies of 2 to 4; match play only for two
for (const n of [3, 4]) assert.deepEqual(parseSettings({ ...daily, maxPlayers: n }), { ...daily, maxPlayers: n }, `${n} players`);
for (const n of [1, 5, 0, '3', 2.5, null]) assert.equal(parseSettings({ ...daily, maxPlayers: n }), null, `maxPlayers ${n}`);
assert.equal(parseSettings({ ...random, maxPlayers: 3 }), null, 'match play is for two');
assert.ok(parseSettings({ ...random, maxPlayers: 2 }), 'match play for two');
assert.equal(parseSettings({ ...daily, spec: null }), null);
for (const x of [null, undefined, 'stroke', 3, []]) assert.equal(parseSettings(x), null, `settings ${x}`);

// ── parseSwing ──
const sw = { slot: 1, hole: 3, shot: 2, club: 4, aim: -0.1234, v: 0.97, timeout: false };
assert.deepEqual(parseSwing(sw), sw);
assert.deepEqual(parseSwing({ ...sw, game: 2, lobby_id: 'x' }), sw, 'stored rows carry game and lobby_id');
assert.deepEqual(parseSwing({ ...sw, timeout: true }), { ...sw, timeout: true });
const noTimeout = { ...sw };
delete noTimeout.timeout;
assert.deepEqual(parseSwing(noTimeout), sw, 'timeout defaults to false');
for (const edge of [{ hole: 0 }, { hole: 17 }, { shot: 29 }, { club: 0 }, { club: 8 }, { v: 0 }, { v: 1.15 }, { aim: 10 }, { aim: -10 }, { slot: 0 }, { slot: 3 }])
  assert.ok(parseSwing({ ...sw, ...edge }), JSON.stringify(edge));

for (const bad of [
  { club: 9 }, { club: -1 }, { club: 2.5 }, { v: 2 }, { v: -0.01 }, { v: NaN }, { hole: -1 }, { hole: 18 }, { hole: 1.5 },
  { shot: -1 }, { shot: 30 }, { aim: NaN }, { aim: Infinity }, { aim: 10.01 }, { aim: '0.1' }, { slot: 4 }, { slot: -1 },
  { slot: '1' }, { timeout: 'yes' }, { club: undefined },
]) assert.equal(parseSwing({ ...sw, ...bad }), null, JSON.stringify(bad));
for (const x of [null, undefined, 'swing', 5]) assert.equal(parseSwing(x), null);

// ── cleanName ──
assert.equal(cleanName('  Adam  '), 'Adam');
assert.equal(cleanName('Jo'), 'Jo');
const xss = cleanName('<img src=x onerror=alert(1)>');
assert.ok(xss === null || !/[<>]/.test(xss), 'no markup brackets');
assert.equal(cleanName('<img src=x onerror=1>'), 'img src=x onerror=1');
assert.equal(cleanName('<b>Al</b>'), 'bAl/b');
assert.equal(cleanName('a\u0000b\u0007c\u200bd\u202ee\ufeff'), 'abcde', 'control and invisible characters go');
assert.equal(cleanName('x'.repeat(20)), 'x'.repeat(20));
assert.equal(cleanName('x'.repeat(21)), null, 'longer than 20');
assert.equal(cleanName('x'), null, 'shorter than 2');
assert.equal(cleanName(' <> '), null, 'nothing left');
assert.equal(cleanName('⛳'.repeat(20)), '⛳'.repeat(20), 'counts characters, not UTF-16 units');
assert.equal(cleanName('😀'.repeat(20)), '😀'.repeat(20));
for (const x of [null, undefined, 12, {}]) assert.equal(cleanName(x), null);

// ── broadcast events are refresh hints only; swings come from the stored log ──
assert.deepEqual([...LOBBY_EVENTS], ['settings', 'ready', 'start', 'left', 'rematch', 'swing']); // swing: a swing was stored, re-read the log

// ── makeCode / parseCode ──
assert.equal(CODE_ALPHABET, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
const seen = new Set();
for (let i = 0; i < 500; i++) {
  const c = makeCode();
  assert.equal(c.length, 6);
  for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), `${ch} in alphabet`);
  assert.equal(parseCode(c), c);
  seen.add(c);
}
assert.ok(seen.size > 490, 'codes vary');
assert.equal(parseCode(' abc234 '), 'ABC234', 'typed codes are trimmed and upper-cased');
for (const x of ['ABCDE', 'ABCDEFG', 'ABCDE0', 'ABCDEI', 'ABCDEL', 'ABCDEO', 'ABC 23', null, 123456])
  assert.equal(parseCode(x), null, `code ${x}`);

// ── memberName: the database's display_name rule, so an email prefix never shows ──
assert.equal(memberName('adam', 'adamzammit117@gmail.com'), 'adam');
assert.equal(memberName('adamzammit117', 'adamzammit117@gmail.com'), 'Member');
assert.equal(memberName('AdamZammit117', 'adamzammit117@gmail.com'), 'Member', 'case-insensitive');
assert.equal(memberName(' adamzammit117', 'adamzammit117@gmail.com'), ' adamzammit117', 'compared untrimmed, as in the database');
assert.equal(memberName('', 'a@b.c'), 'Member');
assert.equal(memberName('   ', 'a@b.c'), 'Member', 'blank is empty');
assert.equal(memberName(null, 'a@b.c'), 'Member');
assert.equal(memberName('adam', null), 'adam');
assert.equal(memberName('x'.repeat(30), 'a@b.c'), 'x'.repeat(20), 'capped at 20');

// ── presence: user ids in a presenceState(), mapped to slots through the lobby's player rows ──
const state = {
  u2: [{ presence_ref: 'r1' }, { presence_ref: 'r2' }],
  u1: [{ presence_ref: 'r3', slot: 3 }],
  stranger: [{ presence_ref: 'r4', slot: 1 }],
  gone: [],
};
assert.deepEqual(presenceUserIds(state).sort(), ['stranger', 'u1', 'u2'], 'keys with a presence');
assert.deepEqual(presenceUserIds(null), []);
const players = [{ userId: 'u1', slot: 0 }, { userId: 'u2', slot: 1 }, { userId: 'gone', slot: 2 }];
assert.deepEqual(presentPlayers(presenceUserIds(state), players), [0, 1], 'slots from the rows, not the metadata');
assert.deepEqual(presentPlayers(['u2', 'u2', 'u1'], players), [0, 1], 'once each, by slot');
assert.deepEqual(presentPlayers([], players), []);
assert.deepEqual(presentPlayers(['u1'], []), []);

console.log('mp protocol: ok');
