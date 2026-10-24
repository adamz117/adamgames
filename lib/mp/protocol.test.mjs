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
const { parseSettings, parseSwing, cleanName, makeCode, parseCode, memberName, presentPlayers, CODE_ALPHABET } =
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
assert.equal(parseSettings({ ...real, spec: { ...real.spec, id: 'pebble-beach' } }), null, 'unknown course');
assert.equal(parseSettings({ ...real, spec: { ...real.spec, id: 'toString' } }), null, 'inherited key is not a course');
assert.equal(parseSettings({ ...real, spec: { ...real.spec, mode: 'middle' } }), null, 'unknown mode');
assert.equal(parseSettings({ ...real, spec: { ...real.spec, day: '2026-02-30' } }), null, 'bad day');
assert.equal(parseSettings({ ...daily, spec: { kind: 'daily', seed: 'abc' } }), null, 'daily seed is a day');
assert.equal(parseSettings({ ...daily, spec: { kind: 'weekly', seed: '2026-10-24' } }), null, 'unknown kind');
assert.equal(parseSettings({ ...random, spec: { kind: 'random', seed: '' } }), null, 'empty seed');
assert.equal(parseSettings({ ...random, spec: { kind: 'random', seed: 'x'.repeat(33) } }), null, 'long seed');
assert.equal(parseSettings({ ...random, spec: { kind: 'random', seed: 7 } }), null, 'seed is a string');
assert.equal(parseSettings({ ...daily, clock: 10 }), null, 'clock is 30');
assert.equal(parseSettings({ ...daily, maxPlayers: 4 }), null, 'two players for now');
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

// ── memberName: an email prefix never shows ──
assert.equal(memberName('adam', 'adamzammit117@gmail.com'), 'adam');
assert.equal(memberName('adamzammit117', 'adamzammit117@gmail.com'), 'Member');
assert.equal(memberName('AdamZammit117', 'adamzammit117@gmail.com'), 'Member', 'case-insensitive');
assert.equal(memberName('', 'a@b.c'), 'Member');
assert.equal(memberName(null, 'a@b.c'), 'Member');
assert.equal(memberName('x'.repeat(30), 'a@b.c'), 'x'.repeat(20), 'capped at 20');

// ── presentPlayers: presence state → one entry per user, by slot ──
const state = {
  u2: [{ presence_ref: 'r1', userId: 'u2', slot: 1, name: 'Bea' }, { presence_ref: 'r2', userId: 'u2', slot: 1, name: 'Bea' }],
  u1: [{ presence_ref: 'r3', userId: 'u1', slot: 0, name: 'Al' }],
  u3: [{ presence_ref: 'r4', userId: 'someone-else', slot: 2, name: 'Spoof' }],
  u4: [{ presence_ref: 'r5', userId: 'u4', slot: 9, name: 'Bad' }],
};
assert.deepEqual(presentPlayers(state), [{ userId: 'u1', slot: 0, name: 'Al' }, { userId: 'u2', slot: 1, name: 'Bea' }]);
assert.deepEqual(presentPlayers({}), []);
assert.deepEqual(presentPlayers(null), []);

console.log('mp protocol: ok');
