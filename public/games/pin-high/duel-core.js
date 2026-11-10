// Pin High duel: the rules, with nothing about screens or networks in them.
// Loaded by the game page (window.PinHighDuelCore) and by node for games/pin-high/test-duel.js.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PinHighDuelCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const START_HP = 300;
  const MAX_ROUNDS = 10;
  const PREVIEW_MS = 3000;   // the prompt is shown before the clock starts
  const ANSWER_MS = 25000;
  const SQUEEZE_MS = 10000;  // once one player has locked in, the other has this long at most
  const POINTS = [10, 30, 60, 85, 100]; // bunker, rough, fairway, green, cup; no valid answer scores 0

  // Damage is the gap in points times this: holes 1 and 2 are worth 1, then half as much again each hole.
  const multiplier = (round) => (round <= 2 ? 1 : 1 + 0.5 * (round - 2));
  const points = (tier) => (tier >= 0 && tier < POINTS.length ? POINTS[tier] : 0);

  // One hole. a and b are { idx, tier } for seats 0 and 1; idx -1 (tier -1) is no valid answer.
  // Two players giving the same answer cancel out: nobody scores and nobody is hurt.
  function resolveRound(round, a, b) {
    const cancelled = a.idx >= 0 && a.idx === b.idx;
    const scores = cancelled ? [0, 0] : [points(a.tier), points(b.tier)];
    const mult = multiplier(round);
    const gap = Math.round(Math.abs(scores[0] - scores[1]) * mult);
    const damage = scores[0] === scores[1] ? [0, 0] : scores[0] < scores[1] ? [gap, 0] : [0, gap];
    return { round, cancelled, scores, mult, damage };
  }

  const applyRound = (hp, res) => [Math.max(0, hp[0] - res.damage[0]), Math.max(0, hp[1] - res.damage[1])];

  // null while the duel is on; otherwise the winning seat, or -1 for a draw (level after the last hole).
  function outcome(hp, roundsPlayed) {
    if (hp[0] <= 0 || hp[1] <= 0) return { winner: hp[0] > hp[1] ? 0 : 1 };
    if (roundsPlayed >= MAX_ROUNDS) return { winner: hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1 };
    return null;
  }

  // history: [{ idx: [i0, i1], tiers: [t0, t1] }] in hole order. Gives the health after it.
  function replay(history) {
    let hp = [START_HP, START_HP];
    const rounds = history.map((h, k) => {
      const res = resolveRound(k + 1, { idx: h.idx[0], tier: h.tiers[0] }, { idx: h.idx[1], tier: h.tiers[1] });
      hp = applyRound(hp, res);
      return { ...res, hp: [...hp] };
    });
    return { hp, rounds, outcome: outcome(hp, history.length) };
  }

  // A sealed answer: the other player gets this hash when you lock in, and the answer and nonce
  // only once both have locked in, so nobody can see an answer before giving their own.
  async function seal(matchId, round, idx, nonce) {
    const bytes = new TextEncoder().encode(`${matchId}|${round}|${idx}|${nonce}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function newNonce() {
    const n = new Uint8Array(16);
    crypto.getRandomValues(n);
    return Array.from(n, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // The holes of a duel, the same on both screens: from the seed, no two from one family
  // (two country prompts, two golf prompts) and no more than three from one subject.
  function promptOrder(prompts, seed) {
    const r = rng('pin-high-duel-' + seed), pool = [...prompts].sort((x, y) => (x.id < y.id ? -1 : 1));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const out = [], groups = {}, families = new Set();
    for (const p of pool) {
      const family = p.id.split('-')[0];
      if ((groups[p.group] || 0) >= 3 || families.has(family)) continue;
      groups[p.group] = (groups[p.group] || 0) + 1; families.add(family); out.push(p);
      if (out.length === MAX_ROUNDS) break;
    }
    return out;
  }

  return { START_HP, MAX_ROUNDS, PREVIEW_MS, ANSWER_MS, SQUEEZE_MS, POINTS, multiplier, points, resolveRound, applyRound, outcome, replay, seal, newNonce, promptOrder };
});
