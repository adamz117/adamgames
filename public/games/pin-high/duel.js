// Pin High duel: one against one, live. This file is the duel's screen and its conversation with
// the other player; the rules are in duel-core.js and the hole, card and sounds are game.js's.
//
// The page that frames the game (/duel/<code>) owns the lobby and its private channel and passes
// messages through: it posts 'ph-duel-init', 'ph-duel-presence' and 'ph-duel-msg' in, and takes
// 'ph-duel-ready', 'ph-duel-send' and 'ph-duel-leave' out.
//
// What the two players say to each other (the `t` of each message):
//   hello    I have just arrived (or come back)          state  where I am in the duel (every 2 s)
//   round    seat 0 starts hole r (r 1 is a new duel)    ready  I am ready for the next hole
//   commit   I have locked in: the seal of my answer     reveal my answer and the nonce behind the seal
//   timeout  you ran out of time; here is my answer      rematch / bye
// An answer travels sealed (a hash) until both players have locked in, so neither can see the
// other's before giving their own. Any one message can be lost, so each screen also sends its whole
// state every couple of seconds, and the other catches up from it (heal) without throwing anything away.
(() => {
'use strict';

const C = window.PinHighDuelCore;
const GRACE_MS = 6000;     // how long past their clock I wait for the other player before calling time
const ADVANCE_MS = 6000;   // after the damage is shown, seat 0 moves on this long later, ready or not
const STATE_MS = 2000;     // how often each screen says where it is
const FORFEIT_MS = 45000;  // a player gone this long mid-duel forfeits
const REVEAL_MAX_MS = 12000; // if the two shots have not both landed by then, show the result anyway
const CATCHUP_MS = 2500;   // seat 0, back in between holes, starts the next one this soon
let A = null;              // game.js's helpers
let me = 0, opp = 1, lobbyId = '', code = '', names = ['Player 1', 'Player 2'], present = [];
let S = null;
let room, hud;
let friends = null;      // a member's friends from the page ([{ id, name, online }]); null for a guest
const invited = {};      // friend id -> 'sending' | 'sent' | 'failed' | 'not_allowed'
const INVITE_LABEL = { sending: 'Sending…', sent: 'Invited', failed: 'Try again', not_allowed: 'Can’t invite' };

const blank = () => ({
  matchId: null, round: 0, hp: [C.START_HP, C.START_HP], history: [], phase: 'room', prompts: [],
  prompt: null, data: null, index: null, loading: null,
  mine: null, theirs: null, resolved: false, previewEnds: 0, deadline: 0, answerEnds: 0,
  ready: [false, false], rematch: [false, false], resultAt: 0, saidAt: 0, hold: false, shownHp: [C.START_HP, C.START_HP], lastTick: 9, suggestion: null, absentSince: 0, forfeit: false,
});
const now = () => Date.now();
const post = (msg) => { try { parent.postMessage(msg, location.origin); } catch {} };
const send = (t, extra) => post({ type: 'ph-duel-send', data: { t, ...extra } });
const host = () => me === 0;
const oppHere = () => present.includes(opp);
const key = () => 'pinhigh:duel:' + lobbyId + ':' + me;
const persist = () => { try { sessionStorage.setItem(key(), JSON.stringify({ matchId: S.matchId, round: S.round, mine: S.mine })); } catch {} };
const stored = () => { try { return JSON.parse(sessionStorage.getItem(key()) || 'null'); } catch { return null; } };
const tierAt = (idx) => (idx >= 0 && S.data ? S.data.answers[idx][1] : -1);
const nameAt = (idx) => (idx >= 0 && S.data ? S.data.answers[idx][0] : null);

// ---------- screen pieces ----------
function build() {
  document.body.classList.add('duel');
  hud = A.$('#duelHud'); room = A.$('#duelRoom');
  hud.hidden = false;
  A.ui.form.addEventListener('submit', (e) => { e.preventDefault(); const t = A.ui.input.value.trim(); if (t) submit(t, false); });
  A.$('#confirmYes').onclick = () => { if (S.suggestion) lock(S.suggestion.i, S.suggestion.text); };
  A.$('#confirmNo').onclick = () => { closeConfirm(); A.ui.input.focus(); A.ui.input.select(); };
}

function drawHud(animate) {
  const sides = [[me, '#hpMe'], [opp, '#hpOpp']];
  const shown = S.hold ? S.shownHp : S.hp; // while the damage is being added up, the bars wait
  for (const [slot, sel] of sides) {
    const box = A.$(sel), hp = shown[slot];
    const waiting = slot === opp && !oppHere() && S.phase === 'room'; // nobody has joined yet
    box.querySelector('.hp-name').textContent = slot === me ? `${names[slot]} (you)` : waiting ? 'Waiting…' : names[slot];
    const prev = box.dataset.hp === undefined ? hp : Number(box.dataset.hp);
    box.dataset.hp = hp;
    const frac = `scaleX(${hp / C.START_HP})`, ghost = box.querySelector('u');
    box.querySelector('i').style.transform = frac;
    if (animate && hp < prev) {
      ghost.style.transform = frac; // its transition waits a moment, so the lost chunk shows red first
      box.classList.remove('hit'); void box.offsetWidth; box.classList.add('hit');
      const tag = document.createElement('span');
      tag.className = 'hp-dmg'; tag.textContent = `−${prev - hp}`;
      box.appendChild(tag); setTimeout(() => tag.remove(), 1600);
    } else if (ghost.style.transform !== frac) {
      ghost.style.transition = 'none'; ghost.style.transform = frac; void ghost.offsetWidth; ghost.style.transition = '';
    }
    box.classList.toggle('low', hp <= C.START_HP * 0.25);
    box.classList.toggle('away', slot === opp && !oppHere() && !waiting);
    const num = box.querySelector('b'), from = Number(num.textContent) || 0;
    if (animate && from !== hp) A.countTo(num, from, hp, 900);
    else { num._count = (num._count || 0) + 1; num.textContent = hp; } // and stop any count still running
  }
  const mid = A.$('#duelMid'), html = S.round ? `Hole ${S.round}<b>×${C.multiplier(S.round)}</b>` : 'Duel';
  if (mid.innerHTML !== html) {
    mid.innerHTML = html;
    if (S.round > 2) { mid.classList.remove('bump'); void mid.offsetWidth; mid.classList.add('bump'); }
  }
}

function showRoom(note) {
  S.phase = 'room';
  A.ui.play.hidden = true; room.hidden = false;
  const both = oppHere();
  room.innerHTML = `<div class="eyebrow"><span>Duel · one against one</span></div>
    <h1>Pin High Duel</h1>
    <p>Same hole, one answer each. The lower score loses the gap from ${C.START_HP} health, and every hole after the second hits harder. Give the same answer and it cancels out. Once one of you locks in, the other has ${C.SQUEEZE_MS / 1000} seconds.</p>
    <div class="room-code"><span>Code</span><b translate="no">${A.esc(code)}</b><button class="btn ghost" id="copyLink" type="button">Copy invite link</button></div>
    <ul class="room-players">
      <li><i class="dot me"></i>${A.esc(names[me])} <small>you</small></li>
      <li class="${both ? '' : 'empty'}"><i class="dot opp"></i>${both ? A.esc(names[opp]) : 'Waiting for a friend to join…'}</li>
    </ul>
    ${both ? '' : friendsHtml()}
    <div class="intro-foot"><span class="logline">${note ? A.esc(note) : host() ? (both ? 'Both here. Start when ready.' : 'Send the link to a friend.') : both ? `Waiting for ${A.esc(names[opp])} to start` : 'Waiting for the host'}</span>
    ${host() ? `<button class="btn" id="startDuel" type="button"${both ? '' : ' disabled'}>Start duel</button>` : ''}</div>`;
  const copy = A.$('#copyLink');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/duel/${code}`); copy.textContent = 'Link copied'; } catch { copy.textContent = `${location.origin}/duel/${code}`; }
  };
  room.querySelectorAll('[data-invite]').forEach((b) => {
    b.onclick = () => { const id = b.dataset.invite; invited[id] = 'sending'; post({ type: 'ph-duel-invite', id }); showRoom(note); };
  });
  const go = A.$('#startDuel');
  if (go) go.onclick = () => { A.sfx.play('go'); newMatch(); };
  drawHud(false);
}

// "Invite a friend": a member's friends, the ones online first. Nothing for a guest.
function friendsHtml() {
  if (!friends) return '';
  if (!friends.length) return `<div class="room-friends"><h2>Invite a friend</h2><p>No friends yet. <a href="/friends" target="_top">Add them by username</a> and you can invite them straight in.</p></div>`;
  const sorted = [...friends].sort((a, b) => Number(b.online) - Number(a.online));
  return `<div class="room-friends"><h2>Invite a friend</h2><ul>${sorted.map((f) => {
    const st = invited[f.id];
    return `<li><span><i class="on${f.online ? ' yes' : ''}" title="${f.online ? 'Online' : 'Offline'}"></i>${A.esc(f.name)}</span><button class="btn ghost" type="button" data-invite="${A.esc(f.id)}"${st === 'sending' || st === 'sent' || st === 'not_allowed' ? ' disabled' : ''}>${st ? INVITE_LABEL[st] : 'Invite'}</button></li>`;
  }).join('')}</ul></div>`;
}

// A full-screen moment over the hole: html for ms milliseconds, steps at their times. A newer one
// cancels what is left of an older one.
let fxRun = 0;
function fx(html, ms, steps = []) {
  const run = ++fxRun, el = A.$('#fx');
  el.innerHTML = `<div class="veil"></div><div class="fx-box">${html}</div>`;
  el.classList.remove('out'); el.hidden = false;
  const at = (t, f) => setTimeout(() => { if (run === fxRun) f(); }, t);
  for (const [t, f] of steps) at(t, f);
  at(ms - 320, () => el.classList.add('out'));
  at(ms, () => { el.hidden = true; el.innerHTML = ''; });
}

// Before each hole: its number and how hard it hits.
function multSplash(r) {
  const m = C.multiplier(r), prev = r > 1 ? C.multiplier(r - 1) : m, up = m > prev;
  const note = r === 1 ? 'First to zero loses' : up ? 'Damage multiplier up' : 'Damage multiplier';
  fx(`<div class="fx-hole">Hole ${r}</div><div class="fx-mult">×${m}</div><div class="fx-note${up ? ' up' : ''}">${note}</div>`, 1650);
  if (up) setTimeout(() => A.sfx.play('tick'), 170);
}

// After the shots land: both scores, the gap, times the multiplier, and the total flying into the
// loser's health bar. Returns how long it runs; the bars are hit part way through.
function damageFx(res) {
  const hurt = res.damage[0] ? 0 : res.damage[1] ? 1 : -1;
  const gap = Math.abs(res.scores[0] - res.scores[1]), dmg = hurt < 0 ? 0 : res.damage[hurt];
  const side = (slot) => `<div class="fx-side ${slot === me ? 'me' : 'opp'}" id="fxS${slot}"><small>${slot === me ? 'You' : A.esc(names[slot])}</small><b>${res.scores[slot]}</b></div>`;
  const html = `<div class="fx-row">${side(me)}${side(opp)}</div><div class="fx-calc" id="fxCalc"></div><div id="fxEnd"></div>`;
  const hit = () => { S.hold = false; drawHud(true); A.sfx.play(hurt === me ? 'no' : 'thud'); };
  const stamp = (text, color) => () => { A.$('#fxEnd').innerHTML = `<span class="fx-stamp" style="--c:${color}">${text}</span>`; A.sfx.play('thud'); };
  if (res.cancelled || hurt < 0) {
    fx(html, 1900, [[450, stamp(res.cancelled ? 'Same answer · cancelled' : 'Level · no damage', 'var(--sage)')], [700, hit]]);
    return 1900;
  }
  const loser = () => { const l = A.$('#fxS' + hurt); if (l) l.classList.add('lose'); };
  const calc = (h) => { const c = A.$('#fxCalc'); if (c) c.insertAdjacentHTML('beforeend', h); A.sfx.play('tick'); };
  const t1 = 420, t2 = res.mult > 1 ? 820 : t1, t3 = t2 + 420, tFly = t3 + 620, tHit = tFly + 420;
  const ko = S.hp[hurt] === 0, end = ko ? tHit + 1250 : tHit + 520;
  const steps = [
    [t1, () => { loser(); calc(`<span class="fx-gap">${gap}</span>`); }],
    [t3, () => {
      A.$('#fxEnd').innerHTML = `<span class="fx-total" id="fxTotal">−${dmg}<small>damage to ${hurt === me ? 'you' : A.esc(names[hurt])}</small></span>`;
      A.sfx.play(hurt === me ? 'no' : 'go');
    }],
    [tFly, () => { // the total flies into the health bar it comes off
      const n = A.$('#fxTotal'), bar = A.$(hurt === me ? '#hpMe .hp-bar' : '#hpOpp .hp-bar');
      if (!n || !bar) return;
      const a = n.getBoundingClientRect(), b = bar.getBoundingClientRect();
      n.classList.add('fly');
      n.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.2)`;
      n.style.opacity = '0';
    }],
    [tHit, hit],
  ];
  if (res.mult > 1) steps.push([t2, () => calc(`<span class="fx-x">× ${res.mult}</span>`)]);
  if (ko) steps.push([tHit + 250, stamp('Knockout', 'var(--danger)')]);
  fx(html, end, steps);
  return end;
}

function status(text, calm = true) {
  A.ui.msg.hidden = false; A.ui.msg.className = calm ? 'msg calm' : 'msg'; A.ui.msg.textContent = text;
}
function closeConfirm() { A.ui.confirm.hidden = true; S.suggestion = null; }

// ---------- a duel and its holes ----------
function newMatch() {
  if (!host() || !oppHere()) return;
  const matchId = C.newNonce().slice(0, 12);
  send('round', { matchId, r: 1, history: [] });
  startMatch(matchId);
  beginRound(1, 0);
}

function startMatch(matchId) {
  const keep = S ? { absentSince: S.absentSince } : {};
  S = { ...blank(), ...keep, matchId, prompts: C.promptOrder(A.manifest.prompts, lobbyId + ':' + matchId) };
}

// elapsed: how far into the hole we already are (a player coming back mid-hole)
function beginRound(r, elapsed) {
  const p = S.prompts[r - 1];
  Object.assign(S, { round: r, prompt: p, data: null, index: null, mine: null, theirs: null, resolved: false, ready: [false, false], lastTick: 9, suggestion: null, phase: 'preview', hold: false, pending: null });
  if (elapsed < 800) multSplash(r);
  S.previewEnds = now() + C.PREVIEW_MS - elapsed;
  S.deadline = S.answerEnds = S.previewEnds + C.ANSWER_MS;
  S.loading = A.loadPrompt(p.id).then((d) => { if (S.prompt === p) { S.data = d; S.index = A.buildIndex(d.answers); } });
  if (S.prompts[r]) A.loadPrompt(S.prompts[r].id).catch(() => {}); // the next hole, ahead of time
  A.scene.setDuo(true);
  A.scene.setHole(r - 1, lobbyId + S.matchId, false);
  room.hidden = true;
  const ui = A.ui;
  ui.end.hidden = true; ui.play.hidden = false; ui.play.classList.remove('urgent');
  ui.holeLabel.textContent = `Hole ${r} · damage ×${C.multiplier(r)}`;
  ui.prompt.textContent = p.text;
  ui.prompt.classList.remove('swap'); void ui.prompt.offsetWidth; ui.prompt.classList.add('swap');
  ui.result.hidden = true; ui.result.innerHTML = '';
  ui.form.hidden = false; ui.timer.hidden = false;
  ui.input.value = ''; ui.input.disabled = true; ui.swing.disabled = true; ui.input.placeholder = 'get ready…';
  ui.swing.textContent = 'Lock in';
  ui.bar.style.transform = 'scaleX(1)';
  status(`${names[opp]} is on the tee with you.`);
  closeConfirm();
  drawHud(false);
  persist();
}

function submit(text, final) {
  if (S.phase !== 'answer') return;
  if (!S.index) { if (final) lock(-1, text || null); else S.loading.then(() => submit(text, false)); return; }
  const hit = text ? A.resolve(S.index, text) : null;
  if (hit && (hit.sure || final)) return lock(hit.i, text);
  if (final) return lock(-1, text || null);
  if (hit) {
    S.suggestion = { i: hit.i, text };
    A.ui.confirmFrom.textContent = text; A.ui.confirmName.textContent = nameAt(hit.i);
    A.ui.confirm.hidden = false; A.$('#confirmYes').focus();
    return;
  }
  A.sfx.play('no');
  status(`“${text}” isn't on the card. Try again.`, false);
  A.ui.form.classList.remove('shake'); void A.ui.form.offsetWidth; A.ui.form.classList.add('shake');
  A.ui.input.select();
}

async function lock(idx, raw) {
  if (S.phase !== 'answer') return;
  S.phase = 'locked';
  closeConfirm();
  const round = S.round, nonce = C.newNonce();
  const hash = await C.seal(S.matchId, round, idx, nonce);
  if (S.round !== round || S.resolved) return; // called time on while sealing
  S.mine = { idx, nonce, hash, raw, at: now(), revealed: false };
  persist();
  send('commit', { r: round, h: hash });
  A.sfx.play('click');
  showLocked();
  if (S.theirs) sendReveal();
}

function showLocked() {
  const ui = A.ui, name = nameAt(S.mine.idx);
  ui.play.classList.remove('urgent');
  ui.form.hidden = true; ui.timer.hidden = true; ui.msg.hidden = true; ui.clock.textContent = '';
  ui.input.blur();
  ui.result.innerHTML = `<span class="lie" style="--c:var(--sage)">Locked in</span>
    <div class="res-row"><div class="res-name${name ? '' : ' none'}">${name ? A.esc(name) : 'No answer'}</div></div>
    <div class="res-sub" id="waitLine">${S.theirs ? 'Both in.' : `Waiting for ${A.esc(names[opp])}. They have ${C.SQUEEZE_MS / 1000} seconds at most.`}</div>`;
  ui.result.hidden = false;
}

function sendReveal() {
  if (!S.mine || S.mine.revealed) return;
  S.mine.revealed = true; S.mine.revealAt = now();
  send('reveal', { r: S.round, i: S.mine.idx, n: S.mine.nonce });
  tryResolve();
}

function tryResolve() {
  if (S.resolved || !S.mine || !S.theirs || S.theirs.idx === undefined) return;
  resolveNow();
}

// They never locked in, or never showed their answer: their hole is a miss.
function callTime() {
  if (S.resolved || !S.mine) return;
  S.mine.revealed = true; // the state I send from now on shows my answer
  send('timeout', { r: S.round, i: S.mine.idx, n: S.mine.nonce });
  S.theirs = { idx: -1 };
  resolveNow();
}

async function resolveNow() {
  S.resolved = true; S.phase = 'reveal';
  closeConfirm();
  await S.loading.catch(() => {});
  const idx = [0, 0]; idx[me] = S.mine.idx; idx[opp] = S.theirs.idx;
  const tiers = idx.map(tierAt);
  const res = C.resolveRound(S.round, { idx: idx[0], tier: tiers[0] }, { idx: idx[1], tier: tiers[1] });
  S.shownHp = [...S.hp]; S.hold = true;
  S.hp = C.applyRound(S.hp, res);
  S.history.push({ idx, tiers });
  persist();
  const ui = A.ui;
  ui.play.classList.remove('urgent');
  ui.form.hidden = true; ui.timer.hidden = true; ui.msg.hidden = true; ui.clock.textContent = '';
  ui.result.hidden = true;
  let landed = 0;
  S.revealAt = now(); S.pending = { res, idx, tiers };
  const round = S.round, matchId = S.matchId;
  const done = () => { if (++landed === 2 && S.pending && S.round === round && S.matchId === matchId) { S.pending = null; showResult(res, idx, tiers); } };
  const thud = (t) => () => A.sfx.play(t < 0 ? 'splash' : t === 0 ? 'sand' : t === 3 ? 'green' : 'thud');
  A.sfx.play('swing');
  A.scene.launch(tiers[me], thud(tiers[me]), () => { if (tiers[me] === 4) A.sfx.play('cup'); done(); }, false);
  A.scene.launch(tiers[opp], thud(tiers[opp]), () => { if (tiers[opp] === 4) A.sfx.play('cup'); done(); }, true);
}

function sideHtml(slot, idx, tier, pts) {
  const T = A.tierOf(tier), name = nameAt(idx);
  return `<div class="vs-side ${slot === me ? 'me' : 'opp'}" style="--c:${T.color}">
    <span class="vs-who"><i class="dot ${slot === me ? 'me' : 'opp'}"></i>${slot === me ? 'You' : A.esc(names[slot])}</span>
    <span class="lie" style="--c:${T.color}">${T.name}</span>
    <div class="vs-ans${name ? '' : ' none'}">${name ? A.esc(name) : 'No answer'}</div>
    <div class="vs-pts">+${pts}</div></div>`;
}

function showResult(res, idx, tiers) {
  S.phase = 'result';
  const fxMs = damageFx(res);
  S.resultAt = now() + fxMs; // the countdown to the next hole starts once the damage is in
  const over = C.outcome(S.hp, S.history.length);
  const hurt = res.damage[0] ? 0 : res.damage[1] ? 1 : -1;
  const gap = Math.abs(res.scores[0] - res.scores[1]);
  let verdict;
  if (res.cancelled) verdict = `<b>Same answer.</b> It cancels out: no points, no damage.`;
  else if (hurt < 0) verdict = `<b>Level on the hole.</b> No damage.`;
  else {
    const dmg = res.damage[hurt], sum = res.mult === 1 ? `${gap}` : `${gap} × ${res.mult} = ${dmg}`;
    verdict = hurt === me ? `${A.esc(names[opp])} wins the hole. <b>You take ${sum} damage.</b>` : `You win the hole. <b>${A.esc(names[opp])} takes ${sum} damage.</b>`;
  }
  const ui = A.ui;
  ui.result.innerHTML = `<div class="vs">${sideHtml(me, idx[me], tiers[me], res.scores[me])}${sideHtml(opp, idx[opp], tiers[opp], res.scores[opp])}</div>
    <div class="res-sub">${verdict}</div>
    <div class="res-foot"><button class="btn" id="next" type="button">${over ? 'See the result' : 'Next hole'}</button></div>`;
  ui.result.hidden = false;
  drawHud(false);
  const next = A.$('#next');
  next.onclick = () => {
    A.sfx.play('click');
    if (over) return showOver();
    S.ready[me] = true; send('ready', { r: S.round });
    next.disabled = true; next.textContent = `Waiting for ${names[opp]}…`;
    next.dataset.waiting = '1';
    if (host()) maybeAdvance(false);
  };
  next.focus({ preventScroll: true });
  if (host()) maybeAdvance(false);
}

// Seat 0 starts the next hole once both are ready, or after a while regardless.
function maybeAdvance(force) {
  if (!host() || S.phase !== 'result' || C.outcome(S.hp, S.history.length)) return;
  if (!force && !(S.ready[0] && S.ready[1])) return;
  const r = S.round + 1;
  send('round', { matchId: S.matchId, r, history: S.history });
  beginRound(r, 0);
}

function showOver() {
  S.phase = 'over';
  const out = C.outcome(S.hp, S.history.length) || { winner: S.forfeit ? me : -1 };
  const won = out.winner === me, draw = out.winner === -1;
  const { rounds } = C.replay(S.history);
  const ui = A.ui;
  ui.play.hidden = true; room.hidden = false;
  room.innerHTML = `<div class="eyebrow"><span>Duel over · ${S.history.length} hole${S.history.length === 1 ? '' : 's'}</span></div>
    <h1>${draw ? 'All square' : won ? 'You win' : `${A.esc(names[opp])} wins`}</h1>
    <p>${S.forfeit ? `${A.esc(names[opp])} left the duel.` : draw ? 'Level on health after the last hole.' : won ? `You finished on ${S.hp[me]} health.` : `${A.esc(names[opp])} finished on ${S.hp[opp]} health.`}</p>
    <ol class="room-holes">${rounds.map((r, k) => {
      const d = r.damage[me] ? `−${r.damage[me]}` : r.damage[opp] ? `+${r.damage[opp]}` : r.cancelled ? 'cancelled' : 'level';
      return `<li><span>${A.esc(S.prompts[k].text)}</span><b class="${r.damage[me] ? 'bad' : r.damage[opp] ? 'good' : ''}">${r.scores[me]} v ${r.scores[opp]} · ${d}</b></li>`;
    }).join('')}</ol>
    <div class="intro-foot"><button class="btn ghost" id="leaveDuel" type="button">Leave</button><button class="btn" id="rematch" type="button">Rematch</button></div>`;
  A.$('#leaveDuel').onclick = () => { send('bye'); post({ type: 'ph-duel-leave' }); };
  const again = A.$('#rematch');
  again.onclick = () => {
    S.rematch[me] = true; send('rematch');
    again.disabled = true; again.textContent = `Waiting for ${names[opp]}…`;
    if (host() && S.rematch[opp]) newMatch();
  };
  if (S.rematch[opp]) again.textContent = `${names[opp]} wants a rematch`;
  drawHud(false);
}

// ---------- what the other player says ----------
async function onMsg(d) {
  if (!d || typeof d.t !== 'string' || !S) return;
  switch (d.t) {
    case 'hello':
      if (S.matchId) send('state', stateMsg());
      break;
    case 'sync':
    case 'state':
      await heal(d);
      break;
    case 'round':
      if (d.r === 1 && typeof d.matchId === 'string' && d.matchId !== S.matchId) { startMatch(d.matchId); beginRound(1, 0); }
      else if (d.matchId === S.matchId && d.r > S.round && Array.isArray(d.history) && d.history.length === d.r - 1) {
        // seat 0's record of the duel is the one that counts
        takeHistory(d.history);
        beginRound(d.r, 0);
      }
      break;
    case 'commit':
      if (d.r !== S.round || typeof d.h !== 'string') break;
      if (S.resolved) { if (S.mine && S.mine.nonce) send('reveal', { r: S.round, i: S.mine.idx, n: S.mine.nonce }); break; }
      if (!S.theirs) {
        S.theirs = { hash: d.h };
        if (S.phase === 'answer' || S.phase === 'preview') {
          S.deadline = Math.min(S.deadline, Math.max(now(), S.previewEnds) + C.SQUEEZE_MS);
          status(`${names[opp]} has locked in. ${C.SQUEEZE_MS / 1000} seconds left.`, false);
          A.sfx.play('tick');
        }
        const w = A.$('#waitLine'); if (w) w.textContent = 'Both in.';
      }
      if (S.mine) { if (S.mine.revealed) send('reveal', { r: S.round, i: S.mine.idx, n: S.mine.nonce }); else sendReveal(); }
      break;
    case 'reveal': {
      if (d.r !== S.round || S.resolved || !S.theirs || S.theirs.idx !== undefined) break;
      const ok = Number.isInteger(d.i) && d.i >= -1 && typeof d.n === 'string' && (await C.seal(S.matchId, d.r, d.i, d.n)) === S.theirs.hash;
      if (d.r !== S.round || S.resolved) break;
      S.theirs.idx = ok ? d.i : -1; // an answer that doesn't match its seal is no answer
      tryResolve();
      break;
    }
    case 'timeout': { // they called time on me: my hole is a miss, theirs is what they show
      if (d.r !== S.round || S.resolved) break;
      let theirs = Number.isInteger(d.i) && d.i >= -1 ? d.i : -1;
      if (S.theirs && S.theirs.hash && (await C.seal(S.matchId, d.r, theirs, String(d.n))) !== S.theirs.hash) theirs = -1;
      if (d.r !== S.round || S.resolved) break;
      S.theirs = { idx: theirs }; S.mine = { idx: -1, raw: null, revealed: true };
      resolveNow();
      break;
    }
    case 'ready':
      if (d.r === S.round) { S.ready[opp] = true; maybeAdvance(false); }
      else if (host() && d.r === S.round - 1 && !S.resolved) send('round', { matchId: S.matchId, r: S.round, history: S.history });
      break;
    case 'rematch':
      S.rematch[opp] = true;
      if (S.phase === 'over') { if (host() && S.rematch[me]) newMatch(); else { const b = A.$('#rematch'); if (b && !b.disabled) b.textContent = `${names[opp]} wants a rematch`; } }
      break;
    case 'bye':
      if (S.phase !== 'over' && S.matchId) { S.forfeit = true; showOver(); }
      break;
  }
}

// Where I am, said every couple of seconds; enough for the other screen to catch up from.
const stateMsg = () => ({
  matchId: S.matchId, history: S.history, round: S.round,
  live: !S.resolved && ['preview', 'answer', 'locked'].includes(S.phase),
  elapsed: now() - (S.previewEnds - C.PREVIEW_MS),
  commit: S.mine && S.mine.hash ? S.mine.hash : null,
  reveal: S.mine && S.mine.revealed && S.mine.nonce ? { i: S.mine.idx, n: S.mine.nonce } : null,
  ready: S.phase === 'result' && S.ready[me],
  rematch: S.phase === 'over' && S.rematch[me],
});

const cleanHistory = (h) => (Array.isArray(h) ? h.filter((x) => x && Array.isArray(x.idx) && Array.isArray(x.tiers)).slice(0, C.MAX_ROUNDS) : []);
// Seat 0's record of the duel is the one that counts.
function takeHistory(h) {
  const hist = cleanHistory(h);
  if (JSON.stringify(hist) === JSON.stringify(S.history)) return;
  S.history = hist; S.hp = C.replay(hist).hp;
  if (!S.hold) drawHud(false);
}

// The other screen's state: take what I missed, and never throw away what I have.
async function heal(d) {
  if (!d || typeof d.matchId !== 'string' || !Array.isArray(d.history)) return;
  const r = Number.isInteger(d.round) ? d.round : 0;
  if (d.matchId !== S.matchId) {
    // I have no duel (this page is new), or seat 0 started a rematch I never heard about
    if (!S.matchId || S.phase === 'room' || (S.phase === 'over' && !host() && cleanHistory(d.history).length < S.history.length)) adopt(d);
    return;
  }
  if (!host()) {
    if (d.live && r > S.round && d.history.length === r - 1) { takeHistory(d.history); beginRound(r, Math.max(0, Number(d.elapsed) || 0)); }
    else if (!d.live && d.history.length > S.history.length && r > S.round) {
      // seat 0 finished a hole I never saw start: catch up and wait for the next one
      takeHistory(d.history); S.round = r; betweenHoles();
    } else if (d.history.length === S.history.length && !S.hold && S.phase !== 'reveal') takeHistory(d.history);
  }
  if (r === S.round && !S.resolved) {
    if (typeof d.commit === 'string') await onMsg({ t: 'commit', r, h: d.commit });
    if (d.reveal && r === S.round && !S.resolved) await onMsg({ t: 'reveal', r, i: d.reveal.i, n: d.reveal.n });
  }
  if (r === S.round && d.ready && S.phase === 'result' && !S.ready[opp]) { S.ready[opp] = true; maybeAdvance(false); }
  if (d.rematch && S.phase === 'over' && !S.rematch[opp]) await onMsg({ t: 'rematch' });
}

// Coming back to a duel that went on without this page (a reload, a dropped connection).
function adopt(d) {
  if (typeof d.matchId !== 'string' || !Array.isArray(d.history)) return;
  const history = d.history.filter((h) => h && Array.isArray(h.idx) && Array.isArray(h.tiers)).slice(0, C.MAX_ROUNDS);
  startMatch(d.matchId);
  S.history = history; S.hp = C.replay(history).hp; S.round = history.length;
  if (C.outcome(S.hp, history.length)) return showOver();
  if (d.live && d.round === history.length + 1) {
    const mine = stored(); // read before beginRound, which saves the new hole over it
    beginRound(d.round, Math.max(0, Number(d.elapsed) || 0));
    if (typeof d.commit === 'string') S.theirs = { hash: d.commit };
    if (mine && mine.matchId === S.matchId && mine.round === S.round && mine.mine && mine.mine.hash) {
      S.mine = { ...mine.mine, revealed: false }; S.phase = 'locked';
      S.loading.then(() => { if (S.phase === 'locked') showLocked(); });
      send('commit', { r: S.round, h: S.mine.hash });
      if (S.theirs) sendReveal();
    }
    return;
  }
  betweenHoles();
}

// Back in between holes: seat 0 starts the next one shortly; the other seat says it is ready.
function betweenHoles() {
  A.ui.play.hidden = true; room.hidden = false;
  room.innerHTML = `<div class="eyebrow"><span>Duel · back in</span></div><h1>Catching up</h1><p>You are back in after hole ${S.history.length}. The next hole starts in a moment.</p>`;
  S.phase = 'result'; S.resolved = true; S.hold = false; S.resultAt = now() - ADVANCE_MS + CATCHUP_MS; S.ready[me] = true;
  send('ready', { r: S.round });
  drawHud(false);
}

// ---------- the clock ----------
function tick() {
  if (!S) return;
  const t = now(), ui = A.ui;
  if (S.phase === 'preview') {
    ui.clock.textContent = `starts in ${Math.max(1, Math.ceil((S.previewEnds - t) / 1000))}`;
    if (t >= S.previewEnds) {
      S.phase = 'answer';
      ui.input.disabled = false; ui.swing.disabled = false; ui.input.placeholder = 'type one answer…';
      ui.input.focus({ preventScroll: true });
    }
  } else if (S.phase === 'answer') {
    const left = Math.max(0, S.deadline - t), secs = Math.ceil(left / 1000);
    ui.clock.textContent = `0:${String(secs).padStart(2, '0')}`;
    ui.bar.style.transform = `scaleX(${Math.min(1, left / C.ANSWER_MS)})`;
    ui.play.classList.toggle('urgent', left <= 3050);
    if (secs <= 3 && secs > 0 && secs < S.lastTick) { S.lastTick = secs; A.sfx.play('tick'); }
    if (left <= 0) { if (S.suggestion) lock(S.suggestion.i, S.suggestion.text); else submit(ui.input.value.trim(), true); }
  }
  if (S.matchId && S.phase !== 'room' && t > S.saidAt + STATE_MS) { S.saidAt = t; send('state', stateMsg()); }
  if (S.phase === 'result') {
    const b = A.$('#next');
    if (b && !b.dataset.waiting && b.textContent !== 'See the result') {
      const left = Math.ceil((S.resultAt + ADVANCE_MS - t) / 1000);
      b.textContent = left > ADVANCE_MS / 1000 ? 'Next hole' : left > 0 ? `Next hole · ${left}` : 'Starting…';
    }
  }
  if (S.phase === 'locked' && S.mine && !S.resolved) {
    // their clock ends at the hole's end, or the squeeze after my lock, whichever is sooner
    const theirEnd = Math.min(S.answerEnds, Math.max(S.mine.at, S.previewEnds) + C.SQUEEZE_MS);
    if (!S.theirs ? t > theirEnd + GRACE_MS : S.theirs.idx === undefined && S.mine.revealAt && t > S.mine.revealAt + GRACE_MS * 3) callTime();
  } else if (S.phase === 'result' && host() && S.resultAt && t > S.resultAt + ADVANCE_MS) {
    maybeAdvance(true);
  } else if (S.phase === 'reveal' && S.revealAt && t > S.revealAt + REVEAL_MAX_MS && S.pending) {
    const p = S.pending; S.pending = null;
    showResult(p.res, p.idx, p.tiers);
  }
  if (S.matchId && S.phase !== 'over' && S.absentSince && t > S.absentSince + FORFEIT_MS) { S.forfeit = true; showOver(); }
}

function onPresence(d) {
  if (Array.isArray(d.players)) for (const p of d.players) if (p && (p.slot === 0 || p.slot === 1) && typeof p.name === 'string') names[p.slot] = p.name;
  const was = oppHere();
  present = Array.isArray(d.present) ? d.present : [];
  if (!S) return;
  S.absentSince = oppHere() ? 0 : S.absentSince || now();
  if (S.phase === 'room') showRoom();
  else drawHud(false);
  if (oppHere() && !was) send('hello'); // they will answer with the duel if they have one
}

function start(api) {
  A = api;
  build();
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== parent) return;
    const d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'ph-duel-init') {
      me = d.slot === 1 ? 1 : 0; opp = 1 - me; lobbyId = String(d.lobbyId); code = String(d.code);
      S = blank();
      onPresence(d);
      showRoom();
      send('hello');
    } else if (d.type === 'ph-duel-presence') onPresence(d);
    else if (d.type === 'ph-duel-friends' && Array.isArray(d.friends)) {
      friends = d.friends.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string').slice(0, 50);
      if (S && S.phase === 'room') showRoom();
    } else if (d.type === 'ph-duel-invited' && typeof d.id === 'string') {
      invited[d.id] = d.state;
      if (S && S.phase === 'room') showRoom();
    }
    else if (d.type === 'ph-duel-msg') void onMsg(d.data);
  });
  const frame = () => { tick(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  setInterval(tick, 250); // a hidden tab gets no animation frames
  A.scene.setDuo(true);
  post({ type: 'ph-duel-ready' });
}

window.PinHighDuel = { start };
})();
