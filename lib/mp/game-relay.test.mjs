// Self-check for the game relay: node lib/mp/game-relay.test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The site's modules import siblings without an extension, as its bundler expects.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
    return next(spec, ctx);
  },
});
const { createGameRelay, FINISH_RETRY_MS, FINISH_WAIT_MS } = await import('./game-relay.ts');

const SETTINGS = { spec: { kind: 'daily', seed: '2026-10-24' }, format: 'stroke', pace: 'own', clock: 30, maxPlayers: 2 };
const ROWS = [{ slot: 0, name: 'Ann', leftAt: null }, { slot: 1, name: 'Ben', leftAt: null }];
const sw = (slot, shot, hole = 0) => ({ slot, hole, shot, club: 2, aim: 0.1, v: 0.8, timeout: false });
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const deferred = () => { let resolve; const promise = new Promise((r) => (resolve = r)); return { promise, resolve }; };

// A relay for slot 0, game 1, with fakes that record what it does. Override any dependency.
function setup(over = {}) {
  const posts = [], saves = [], finishes = [];
  let clock = 0; // fake time, moved on by sleep, so polling loops end
  const deps = {
    lobbyId: 'L', code: 'ABCDEF', game: 1, me: 0,
    post: (m) => posts.push(m),
    getLobby: async () => ({ game: 1, settings: SETTINGS }),
    getPlayers: async () => ROWS,
    getSwings: async () => [],
    saveSwing: async (id, game, s) => { saves.push(s.shot); return 'stored'; },
    postFinish: async () => { finishes.push(1); return { status: 'playing', results: [] }; },
    onRematch() {}, onLeave() {},
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    ...over,
  };
  return { relay: createGameRelay(deps), posts, saves, finishes };
}
const types = (posts) => posts.map((m) => m.type);
const swingShots = (posts) => posts.filter((m) => m.type === 'mp-swing').map((m) => `${m.swing.slot}:${m.swing.shot}`);

// ── Opponents' swings that arrive before mp-init are held, then forwarded after it ──
{
  const { relay, posts } = setup();
  relay.swing(sw(1, 0), 1);
  assert.deepEqual(posts, [], 'nothing reaches the game before it is built');
  relay.message({ type: 'mp-ready' });
  await flush();
  assert.deepEqual(types(posts), ['mp-init', 'mp-swing']);
  assert.equal(posts[0].me, 0);
  assert.deepEqual(posts[0].players, [{ slot: 0, name: 'Ann' }, { slot: 1, name: 'Ben' }]);
  relay.swing(sw(1, 1), 1);
  assert.deepEqual(swingShots(posts), ['1:0', '1:1'], 'and straight through once it is');
}

// ── My own echo and other games' swings are not forwarded ──
{
  const { relay, posts } = setup();
  relay.message({ type: 'mp-ready' });
  await flush();
  relay.swing(sw(0, 0), 1);
  relay.swing(sw(1, 0), 2);
  assert.deepEqual(types(posts), ['mp-init']);
}

// ── A resync asked for while init's snapshot is in flight runs right after mp-init ──
{
  const first = deferred();
  let calls = 0;
  const { relay, posts } = setup({ getSwings: () => (++calls === 1 ? first.promise : Promise.resolve([sw(1, 0)])) });
  relay.message({ type: 'mp-ready' });
  relay.resync(); // the channel subscribed mid-snapshot
  first.resolve([]); // the snapshot missed swing 1:0
  await flush();
  assert.equal(calls, 2, 'the log is read again after init');
  assert.deepEqual(swingShots(posts), ['1:0'], 'and the missed swing reaches the game');
}

// ── A periodic resync while in the game ──
{
  let t = 0, calls = 0;
  const { relay, posts } = setup({ now: () => t, getSwings: async () => (++calls > 1 ? [sw(1, 0)] : []) });
  relay.message({ type: 'mp-ready' });
  await flush();
  t = 16_000;
  relay.tick();
  await flush();
  assert.deepEqual(swingShots(posts), ['1:0']);
}

// ── mp-ready again (the iframe reloaded, or the hook re-ran) builds the game again ──
{
  const { relay, posts } = setup();
  relay.message({ type: 'mp-ready' });
  await flush();
  relay.message({ type: 'mp-ready' });
  await flush();
  assert.deepEqual(types(posts), ['mp-init', 'mp-init']);
  relay.swing(sw(1, 0), 1);
  assert.deepEqual(swingShots(posts), ['1:0'], 'still forwarding after the second init');
}

// ── My swings are saved in order, retried on 'failed', and dropped after 'closed' ──
{
  const script = { 0: ['failed', 'failed', 'stored'], 1: ['stored'], 2: ['closed'], 3: ['stored'] };
  const gate = deferred();
  const { relay, saves } = setup({
    saveSwing: async (id, game, s) => {
      saves.push(s.shot);
      if (s.shot === 2) await gate.promise; // swing 3 is queued while 2 is in flight
      return script[s.shot].shift();
    },
  });
  for (const shot of [0, 1, 2]) relay.message({ type: 'mp-swing', swing: sw(0, shot) });
  relay.message({ type: 'mp-swing', swing: sw(1, 9) }); // not mine: ignored
  await flush();
  relay.message({ type: 'mp-swing', swing: sw(0, 3) });
  gate.resolve();
  await flush();
  assert.deepEqual(saves, [0, 0, 0, 1, 2], 'in order, retried, and nothing after the game closed');
}

// ── mp-done polls the finish route until it is finished; mp-result is posted once ──
{
  let n = 0;
  const RESULTS = [{ slot: 0, result: 'win', detail: '3 & 2' }, { slot: 1, result: 'loss', detail: '3 & 2' }];
  const { relay, posts, finishes } = setup({
    postFinish: async () => { finishes.push(1); return ++n < 3 ? { status: 'playing', results: [] } : { status: 'finished', results: RESULTS }; },
  });
  relay.message({ type: 'mp-ready' });
  await flush();
  relay.message({ type: 'mp-done' });
  await flush();
  assert.equal(finishes.length, 3, 'asked until finished');
  assert.deepEqual(posts.filter((m) => m.type === 'mp-result').map((m) => m.results), [RESULTS]);
  // Refreshes, another mp-done and the away check don't ask again or reopen the card.
  relay.lobby({ players: ROWS, present: [], status: 'finished' });
  relay.message({ type: 'mp-done' });
  relay.tick();
  await flush();
  assert.equal(finishes.length, 3);
  assert.equal(posts.filter((m) => m.type === 'mp-result').length, 1);
}

// ── A result that comes before mp-init is posted after it ──
{
  const RESULTS = [{ slot: 0, result: 'draw', detail: '36 v 36' }];
  const { relay, posts } = setup({ postFinish: async () => ({ status: 'finished', results: RESULTS }) });
  relay.lobby({ players: ROWS, present: [0, 1], status: 'finished' });
  await flush();
  assert.deepEqual(posts, []);
  relay.message({ type: 'mp-ready' });
  await flush();
  assert.deepEqual(types(posts), ['mp-init', 'mp-result']);
}

// ── Finish polling stops when the relay is disposed ──
{
  const slept = [];
  const { relay, finishes } = setup({ sleep: () => { const d = deferred(); slept.push(d); return d.promise; } });
  relay.message({ type: 'mp-done' });
  await flush();
  assert.equal(finishes.length, 1);
  relay.dispose();
  slept.forEach((d) => d.resolve());
  await flush();
  assert.equal(finishes.length, 1, 'no more calls after dispose');
}

// ── An opponent who left: mp-left once, and the finish route ──
{
  const { relay, posts, finishes } = setup();
  relay.message({ type: 'mp-ready' });
  await flush();
  const gone = [ROWS[0], { ...ROWS[1], leftAt: '2026-10-24T10:00:00Z' }];
  relay.lobby({ players: gone, present: [0] });
  relay.lobby({ players: gone, present: [0] });
  await flush();
  assert.deepEqual(posts.filter((m) => m.type === 'mp-left'), [{ type: 'mp-left', slot: 1 }]);
  assert.equal(finishes.length, FINISH_WAIT_MS / FINISH_RETRY_MS + 1, 'polled every 5 s for 10 minutes, then stopped');
}

// ── An opponent missing from presence for over 60 s: the finish route is asked ──
{
  let t = 0;
  const { relay, finishes } = setup({ now: () => t });
  relay.lobby({ players: ROWS, present: [0, 1] });
  relay.lobby({ players: ROWS, present: [0] }); // they dropped at t = 0
  t = 59_000;
  relay.tick();
  await flush();
  assert.equal(finishes.length, 0);
  t = 61_000;
  relay.tick();
  await flush();
  assert.equal(finishes.length, 1);
}

console.log('game-relay: all ok');
