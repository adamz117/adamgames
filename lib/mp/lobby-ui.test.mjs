// Self-check for the lobby pages' pure helpers: node lib/mp/lobby-ui.test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// lobby-ui.ts imports siblings without an extension, as the site's bundler expects.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
    return next(spec, ctx);
  },
});
const { startCheck, nameList, errorText, sizeChange, minSize } = await import('./lobby-ui.ts');

// ── nameList ──
assert.equal(nameList([]), '');
assert.equal(nameList(['Bea']), 'Bea');
assert.equal(nameList(['Bea', 'Cal']), 'Bea and Cal');
assert.equal(nameList(['Bea', 'Cal', 'Dee']), 'Bea, Cal and Dee');

// ── startCheck: at least 2 here, no more than the size, every non-host here ready; away players don't hold it up ──
const p = (name, o = {}) => ({ name, ready: false, host: false, here: true, ...o });
const host = p('Ann', { host: true });
assert.deepEqual(startCheck([host], 2), { can: false, why: 'alone', waitingOn: [], away: [] });
assert.deepEqual(startCheck([host, p('Bea', { here: false, ready: true })], 2), { can: false, why: 'alone', waitingOn: [], away: ['Bea'] });
assert.deepEqual(startCheck([host, p('Bea')], 2), { can: false, why: 'waiting', waitingOn: ['Bea'], away: [] });
assert.deepEqual(startCheck([host, p('Bea', { ready: true })], 2), { can: true, why: 'ready', waitingOn: [], away: [] });
const four = [host, p('Bea', { ready: true }), p('Cal', { ready: true }), p('Dee', { ready: true })];
assert.equal(startCheck(four, 4).can, true, 'four ready');
assert.deepEqual(startCheck(four, 3), { can: false, why: 'too_many', waitingOn: [], away: [] }, 'more here than the size');
const oneAway = [host, p('Bea', { ready: true }), p('Cal', { here: false }), p('Dee', { ready: true })];
assert.deepEqual(startCheck(oneAway, 4), { can: true, why: 'ready', waitingOn: [], away: ['Cal'] }, 'an away player is left out');
assert.deepEqual(startCheck(oneAway, 3), { can: true, why: 'ready', waitingOn: [], away: ['Cal'] }, 'away players do not count against the size');
const twoWaiting = [host, p('Bea'), p('Cal', { ready: true }), p('Dee')];
assert.deepEqual(startCheck(twoWaiting, 4), { can: false, why: 'waiting', waitingOn: ['Bea', 'Dee'], away: [] });
// The host's own ready flag never matters
assert.equal(startCheck([{ ...host, ready: false }, p('Bea', { ready: true })], 2).can, true);

// ── sizeChange: 3–4 players means stroke play; 2 keeps the format ──
const s = { spec: { kind: 'daily', seed: '2026-10-25' }, format: 'match', pace: 'own', clock: 30, maxPlayers: 2 };
assert.deepEqual(sizeChange(s, 3), { ...s, maxPlayers: 3, format: 'stroke' });
assert.deepEqual(sizeChange(s, 4), { ...s, maxPlayers: 4, format: 'stroke' });
assert.deepEqual(sizeChange({ ...s, format: 'stroke', maxPlayers: 4 }, 2), { ...s, format: 'stroke', maxPlayers: 2 });
assert.deepEqual(sizeChange(s, 2), s);

// ── minSize: room for everyone here, in the slots they hold (slots can have gaps) ──
assert.equal(minSize([0]), 2);
assert.equal(minSize([0, 1]), 2);
assert.equal(minSize([0, 1, 2]), 3);
assert.equal(minSize([0, 3]), 4, 'a player in slot 3 needs 4 seats');
assert.equal(minSize([0, 2]), 3);
assert.equal(minSize([2, 0, 1, 3]), 4);
assert.equal(minSize([]), 2);

// ── error text ──
assert.match(errorText('too_many'), /too few seats/);
assert.match(errorText('nonsense'), /Something went wrong/);

console.log('lobby ui: ok');
