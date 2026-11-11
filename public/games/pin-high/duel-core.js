// Pin High duel: the rules, with nothing about screens or networks in them. Two to four players.
// Loaded by the game page (window.PinHighDuelCore) and by node for games/pin-high/test-duel.js.
//
// Everything per player is an array indexed by lobby seat (0 to 3). A seat not in the duel has
// health 0 and never answers.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PinHighDuelCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SEATS = 4;
  const START_HP = 300;
  const MAX_ROUNDS = 10;
  const PREVIEW_MS = 3000;   // the prompt is shown before the clock starts
  const ANSWER_MS = 25000;
  const SQUEEZE_MS = 10000;  // once one player has locked in, everyone else has this long at most
  const POINTS = [10, 30, 60, 85, 100]; // bunker, rough, fairway, green, cup; no valid answer scores 0

  // Damage is the gap in points times this: holes 1 and 2 are worth 1, then half as much again each hole.
  const multiplier = (round) => (round <= 2 ? 1 : 1 + 0.5 * (round - 2));
  const points = (tier) => (tier >= 0 && tier < POINTS.length ? POINTS[tier] : 0);
  const seatList = (seats) => [...new Set(seats)].filter((s) => Number.isInteger(s) && s >= 0 && s < SEATS).sort((a, b) => a - b);
  const startHp = (seats) => Array.from({ length: SEATS }, (_, s) => (seats.includes(s) ? START_HP : 0));

  // One hole. idx and tiers: per seat, -1 for no valid answer. alive: per seat, still in the duel.
  // Players who gave the same answer cancel out (they score nothing). The top score takes no damage;
  // everyone else still in loses the gap to it, times the hole's multiplier.
  function resolveRound(round, idx, tiers, alive) {
    const counts = new Map();
    for (let s = 0; s < SEATS; s++) if (alive[s] && idx[s] >= 0) counts.set(idx[s], (counts.get(idx[s]) || 0) + 1);
    const cancelled = Array.from({ length: SEATS }, (_, s) => !!alive[s] && idx[s] >= 0 && counts.get(idx[s]) > 1);
    const scores = Array.from({ length: SEATS }, (_, s) => (alive[s] && !cancelled[s] ? points(tiers[s]) : 0));
    const top = Math.max(0, ...scores.filter((_, s) => alive[s]));
    const mult = multiplier(round);
    const damage = scores.map((p, s) => (alive[s] ? Math.round((top - p) * mult) : 0));
    return { round, cancelled, scores, top, mult, damage };
  }

  const applyRound = (hp, res) => hp.map((h, s) => Math.max(0, h - res.damage[s]));
  const aliveOf = (hp) => hp.map((h) => h > 0);

  // null while the duel is on; otherwise { winners: [seats] }. One player left standing wins. If the
  // last players all go out on the same hole, the one with most health before it wins (ties share).
  // After the last hole, most health wins (ties share).
  function outcome(hp, roundsPlayed, before) {
    const standing = [0, 1, 2, 3].filter((s) => hp[s] > 0);
    const best = (arr, from) => { const m = Math.max(...from.map((s) => arr[s])); return from.filter((s) => arr[s] === m); };
    if (standing.length === 1) return { winners: standing };
    if (standing.length === 0) { const was = [0, 1, 2, 3].filter((s) => (before || hp)[s] > 0); return { winners: was.length ? best(before, was) : [] }; }
    if (roundsPlayed >= MAX_ROUNDS) return { winners: best(hp, standing) };
    return null;
  }

  // seats: the seats in the duel. history: [{ idx: [per seat], tiers: [per seat], quit?: [seats] }]
// in hole order; quit lists players who left, who go out before that hole is scored.
  function replay(seats, history) {
    let hp = startHp(seatList(seats));
    const out = [];
    for (let k = 0; k < history.length; k++) {
      const h = history[k];
      // a player who left the duel goes out before this hole is scored
      if (Array.isArray(h.quit)) for (const q of h.quit) if (Number.isInteger(q) && q >= 0 && q < SEATS) hp[q] = 0;
      const before = [...hp];
      const res = resolveRound(k + 1, pad(h.idx), pad(h.tiers), aliveOf(hp));
      hp = applyRound(hp, res);
      out.push({ ...res, hp: [...hp], before });
      if (outcome(hp, k + 1, before)) return { hp, rounds: out, outcome: outcome(hp, k + 1, before) };
    }
    return { hp, rounds: out, outcome: outcome(hp, history.length, out.length ? out[out.length - 1].before : hp) };
  }
  const pad = (a) => Array.from({ length: SEATS }, (_, s) => (Array.isArray(a) && Number.isInteger(a[s]) ? a[s] : -1));

  // A sealed answer: the others get this hash when you lock in, and the answer and nonce only once
  // everyone still in has locked in, so nobody can see an answer before giving their own.
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

  // The holes of a duel: from the seed, no two from one family (two country prompts, two golf
  // prompts) and no more than three from one subject. Seat 0's pick is sent to everyone.
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

  return { SEATS, START_HP, MAX_ROUNDS, PREVIEW_MS, ANSWER_MS, SQUEEZE_MS, POINTS, multiplier, points, seatList, startHp, resolveRound, applyRound, aliveOf, outcome, replay, pad, seal, newNonce, promptOrder };
});
