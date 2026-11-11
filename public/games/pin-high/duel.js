// Pin High duel: two to four players, live. This file is the duel's screen and its conversation
// with the other players; the rules are in duel-core.js and the hole, card and sounds are game.js's.
//
// The page that frames the game (/duel/<code>) owns the lobby and its private channel and passes
// messages through: it posts 'ph-duel-init', 'ph-duel-presence', 'ph-duel-friends', 'ph-duel-invited'
// and 'ph-duel-msg' in, and takes 'ph-duel-ready', 'ph-duel-send', 'ph-duel-invite' and
// 'ph-duel-leave' out. Every message goes to every other player and says who sent it (from).
//
// One player leads: the lowest seat still connected (normally whoever made the duel). The leader
// starts each hole, closes it once everyone still in has locked in (or time is up), and announces
// its result; if the leader drops out, the next seat takes over. What the players say (t):
//   hello    I have just arrived (or come back)          state   where I am (every 2 s)
//   round    the leader starts hole r                    commit  I have locked in: my answer's seal
//   close    the leader closes the hole                  reveal  my answer and the nonce behind the seal
//   result   the leader's record of the hole             ready   I am ready for the next hole
//   rematch  I want to play again                        bye     I am leaving
// An answer travels sealed (a hash) until the hole is closed, so nobody can see another's answer
// before giving their own. Any message can be lost; the state every couple of seconds lets each
// screen catch up without throwing anything away.
(() => {
'use strict';

const C = window.PinHighDuelCore;
const SEATS = [0, 1, 2, 3];
const COLORS = ['#eceadc', '#e2aa4e', '#6fb6d6', '#c49ae8']; // one per seat, the same on every screen
const GRACE_MS = 6000;       // past the clock, the leader waits this long for late answers
const REVEAL_WAIT_MS = 8000; // after closing, this long for every sealed answer to be shown
const ADVANCE_MS = 6000;     // after the damage is shown, the next hole starts this long later
const STATE_MS = 2000;       // how often each screen says where it is
const AWAY_MS = 45000;       // a player gone this long mid-duel is out
const REVEAL_MAX_MS = 12000; // if the shots have not all landed by then, show the result anyway
const CATCHUP_MS = 2500;     // the leader, back in between holes, starts the next one this soon
let A = null;                // game.js's helpers
let me = 0, lobbyId = '', code = '';
const names = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
let present = [];            // seats connected now (me included)
const awaySince = [0, 0, 0, 0];
let S = null;
let room, hud;
let friends = null;          // a member's friends from the page ([{ id, name, online }]); null for a guest
const invited = {};          // friend id -> 'sending' | 'sent' | 'failed' | 'not_allowed'
const INVITE_LABEL = { sending: 'Sending…', sent: 'Invited', failed: 'Try again', not_allowed: 'Can’t invite' };

const blank = () => ({
  matchId: null, seats: [], round: 0, hp: [0, 0, 0, 0], history: [], phase: 'room', prompts: [],
  prompt: null, data: null, index: null, loading: null, alive: [false, false, false, false],
  mine: null, commits: [null, null, null, null], reveals: [undefined, undefined, undefined, undefined],
  closed: false, closedAt: 0, resolved: false, previewEnds: 0, deadline: 0, answerEnds: 0,
  ready: [false, false, false, false], rematch: [false, false, false, false], quit: [false, false, false, false],
  resultAt: 0, saidAt: 0, hold: false, shownHp: [0, 0, 0, 0], lastTick: 9, suggestion: null, pending: null, revealAt: 0, ballK: {},
});
const now = () => Date.now();
const post = (msg) => { try { parent.postMessage(msg, location.origin); } catch {} };
const send = (t, extra) => post({ type: 'ph-duel-send', data: { t, from: me, ...extra } });
const here = (s) => present.includes(s);
const inMatch = (s) => S.seats.includes(s);
const others = () => S.seats.filter((s) => s !== me);
// the leader: the lowest connected seat in the duel (or in the room, before one starts)
function leader() {
  const pool = S && S.matchId ? S.seats.filter((s) => here(s) && !S.quit[s]) : present;
  return pool.length ? Math.min(...pool) : me;
}
const leading = () => leader() === me;
const key = () => 'pinhigh:duel:' + lobbyId + ':' + me;
const persist = () => { try { sessionStorage.setItem(key(), JSON.stringify({ matchId: S.matchId, round: S.round, mine: S.mine })); } catch {} };
const stored = () => { try { return JSON.parse(sessionStorage.getItem(key()) || 'null'); } catch { return null; } };
const tierAt = (idx) => (idx >= 0 && S.data ? S.data.answers[idx][1] : -1);
const nameAt = (idx) => (idx >= 0 && S.data ? S.data.answers[idx][0] : null);
const who = (s) => (s === me ? 'You' : A.esc(names[s]));
const list = (seats) => { const n = seats.map(who); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
const verb = (seats, one, many) => (seats.length === 1 && seats[0] !== me ? one : many);
const seatOk = (s) => Number.isInteger(s) && s >= 0 && s < 4;

// ---------- screen pieces ----------
function build() {
  document.body.classList.add('duel');
  hud = A.$('#duelHud'); room = A.$('#duelRoom');
  hud.hidden = false;
  A.ui.form.addEventListener('submit', (e) => { e.preventDefault(); const t = A.ui.input.value.trim(); if (t) submit(t, false); });
  A.$('#confirmYes').onclick = () => { if (S.suggestion) lock(S.suggestion.i, S.suggestion.text); };
  A.$('#confirmNo').onclick = () => { closeConfirm(); A.ui.input.focus(); A.ui.input.select(); };
}

// Who the bars and golfers are for: the duel's players, or whoever is in the room; me first.
const hudSeats = () => { const pool = S.matchId ? S.seats : present; return [me, ...pool.filter((s) => s !== me)].filter((s, i, a) => a.indexOf(s) === i && (pool.includes(s) || !S.matchId)); };

// The tee: everyone in the duel (or the room), me first, in their colours.
function teeUp() {
  const seats = hudSeats();
  S.ballK = {};
  seats.forEach((s, k) => { S.ballK[s] = k; });
  A.scene.setDuo(Math.max(2, seats.length), seats.map((s) => COLORS[s]));
}

function drawHud(animate) {
  const listEl = A.$('#hpList'), seats = hudSeats();
  const want = seats.join(',');
  if (listEl.dataset.seats !== want) {
    listEl.dataset.seats = want; listEl.dataset.n = String(seats.length);
    listEl.innerHTML = seats.map((s) => `<div class="hp" id="hp${s}" style="--c:${COLORS[s]}"><span class="hp-name"></span><b></b><div class="hp-bar"><u></u><i></i></div></div>`).join('');
  }
  const shown = S.hold ? S.shownHp : S.hp;
  for (const s of seats) {
    const box = A.$('#hp' + s), hp = S.matchId ? shown[s] : C.START_HP;
    box.querySelector('.hp-name').textContent = s === me ? `${names[s]} (you)` : names[s];
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
    box.classList.toggle('low', hp > 0 && hp <= C.START_HP * 0.25);
    box.classList.toggle('dead', !!S.matchId && hp <= 0);
    box.classList.toggle('away', s !== me && !here(s));
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
  const seats = SEATS.filter(here), full = seats.length >= 4, enough = seats.length >= 2;
  const lead = leading();
  room.innerHTML = `<div class="eyebrow"><span>Duel · two to four players</span></div>
    <h1>Pin High Duel</h1>
    <p>Same hole, one answer each. Everyone but the top score loses the gap to it from ${C.START_HP} health, and every hole after the second hits harder. Give the same answer as someone else and you both score nothing. Once anyone locks in, the rest have ${C.SQUEEZE_MS / 1000} seconds. Last one standing wins.</p>
    <div class="room-code"><span>Code</span><b translate="no">${A.esc(code)}</b><button class="btn ghost" id="copyLink" type="button">Copy invite link</button></div>
    <ul class="room-players">
      ${seats.map((s) => `<li><i class="dot" style="--c:${COLORS[s]}"></i>${A.esc(names[s])}${s === me ? ' <small>you</small>' : ''}</li>`).join('')}
      ${full ? '' : `<li class="empty"><i class="dot" style="--c:transparent"></i>${seats.length < 2 ? 'Waiting for a friend to join…' : `Room for ${4 - seats.length} more`}</li>`}
    </ul>
    ${full ? '' : friendsHtml()}
    <div class="intro-foot"><span class="logline">${note ? A.esc(note) : lead ? (enough ? `${seats.length} here. Start when everyone is in.` : 'Send the link to your friends.') : `Waiting for ${A.esc(names[leader()])} to start`}</span>
    ${lead ? `<button class="btn" id="startDuel" type="button"${enough ? '' : ' disabled'}>Start duel</button>` : ''}</div>`;
  const copy = A.$('#copyLink');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/duel/${code}`); copy.textContent = 'Link copied'; } catch { copy.textContent = `${location.origin}/duel/${code}`; }
  };
  room.querySelectorAll('[data-invite]').forEach((b) => {
    b.onclick = () => { const id = b.dataset.invite; invited[id] = 'sending'; post({ type: 'ph-duel-invite', id }); showRoom(note); };
  });
  const go = A.$('#startDuel');
  if (go) go.onclick = () => { A.sfx.play('go'); newMatch(); };
  teeUp();
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
  const note = r === 1 ? (S.seats.length > 2 ? 'Last one standing wins' : 'First to zero loses') : up ? 'Damage multiplier up' : 'Damage multiplier';
  fx(`<div class="fx-hole">Hole ${r}</div><div class="fx-mult">×${m}</div><div class="fx-note${up ? ' up' : ''}">${note}</div>`, 1650);
  if (up) setTimeout(() => A.sfx.play('tick'), 170);
}

// After the shots land: every score with the top one marked, the gap each of the rest takes, times
// the multiplier, and the totals flying into the health bars. Returns how long it runs.
function damageFx(res, outNow, ending) {
  const seats = hudSeats().filter((s) => S.alive[s]);
  const hurt = seats.filter((s) => res.damage[s] > 0);
  const col = (s) => `<div class="fx-side${res.scores[s] === res.top ? ' top' : ''}" id="fxS${s}" style="--c:${COLORS[s]}"><small>${who(s)}</small><b>${res.scores[s]}</b>${res.cancelled[s] ? '<em>same answer</em>' : ''}<span class="fx-each" id="fxE${s}"></span></div>`;
  const html = `<div class="fx-row n${seats.length}">${seats.map(col).join('')}</div><div class="fx-calc" id="fxCalc"></div><div id="fxEnd"></div>`;
  const hit = () => { S.hold = false; drawHud(true); A.sfx.play(hurt.includes(me) ? 'no' : 'thud'); };
  const stamp = (text, color) => () => { const e = A.$('#fxEnd'); if (e) e.innerHTML = `<span class="fx-stamp" style="--c:${color}">${text}</span>`; A.sfx.play('thud'); };
  if (!hurt.length) {
    const all = seats.every((s) => res.cancelled[s]);
    fx(html, 1900, [[450, stamp(all ? 'Same answer · cancelled' : 'Level · no damage', 'var(--sage)')], [700, hit]]);
    return 1900;
  }
  const each = (f) => hurt.forEach((s) => { const e = A.$('#fxE' + s); if (e) f(e, s); });
  const t1 = 420, t2 = res.mult > 1 ? 820 : t1, t3 = t2 + 420, tFly = t3 + 620, tHit = tFly + 420;
  const end = outNow.length ? tHit + 1250 : tHit + 520;
  const steps = [
    [t1, () => { // the gap to the top score, under each player who takes damage
      seats.forEach((s) => A.$('#fxS' + s)?.classList.add(hurt.includes(s) ? 'lose' : 'safe'));
      each((e, s) => { e.innerHTML = `<span class="fx-gap">−${res.top - res.scores[s]}</span>`; });
      A.sfx.play('tick');
    }],
    [t3, () => {
      each((e, s) => { e.innerHTML = `<span class="fx-total" id="fxT${s}">−${res.damage[s]}</span>`; });
      A.sfx.play(hurt.includes(me) ? 'no' : 'go');
    }],
    [tFly, () => each((e, s) => { // each total flies into the health bar it comes off
      const n = A.$('#fxT' + s), bar = A.$(`#hp${s} .hp-bar`);
      if (!n || !bar) return;
      const a = n.getBoundingClientRect(), b = bar.getBoundingClientRect();
      n.classList.add('fly');
      n.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.25)`;
      n.style.opacity = '0';
    })],
    [tHit, hit],
  ];
  if (res.mult > 1) steps.push([t2, () => { const c = A.$('#fxCalc'); if (c) c.innerHTML = `<span class="fx-x">× ${res.mult}</span>`; A.sfx.play('tick'); }]);
  if (outNow.length) steps.push([tHit + 250, stamp(ending ? 'Knockout' : `${list(outNow)} ${verb(outNow, 'is', 'are')} out`, 'var(--danger)')]);
  fx(html, end, steps);
  return end;
}

function status(text, calm = true) {
  A.ui.msg.hidden = false; A.ui.msg.className = calm ? 'msg calm' : 'msg'; A.ui.msg.textContent = text;
}
function closeConfirm() { A.ui.confirm.hidden = true; S.suggestion = null; }

// ---------- a duel and its holes ----------
function newMatch() {
  const seats = SEATS.filter(here);
  if (!leading() || seats.length < 2) return;
  const matchId = C.newNonce().slice(0, 12);
  startMatch(matchId, seats);
  send('round', roundMsg(1));
  beginRound(1, 0);
}
const roundMsg = (r) => ({ matchId: S.matchId, r, seats: S.seats, history: S.history, holes: holesMsg() });

// holes: the duel's holes as the leader chose them. The leader picks from its own topic list and
// sends the picks with every round and state message, so every screen plays the same holes even
// when one of them loaded an older list.
function startMatch(matchId, seats, holes) {
  const given = cleanHoles(holes);
  S = { ...blank(), matchId, seats: C.seatList(seats), prompts: given || C.promptOrder(A.manifest.prompts, lobbyId + ':' + matchId) };
  S.hp = C.startHp(S.seats);
  teeUp();
}
function cleanHoles(h) {
  if (!Array.isArray(h) || !h.length || h.length > C.MAX_ROUNDS) return null;
  const out = h.map((p) => (p && typeof p.id === 'string' && /^[a-z0-9-]{2,40}$/.test(p.id) && typeof p.text === 'string' && p.text.length <= 200 ? { id: p.id, text: p.text } : null));
  return out.every(Boolean) ? out : null;
}
const holesMsg = () => S.prompts.map((p) => ({ id: p.id, text: p.text }));
const cleanSeats = (x) => (Array.isArray(x) ? C.seatList(x.filter(seatOk)) : []);
const cleanHistory = (h) => (Array.isArray(h) ? h.filter((x) => x && Array.isArray(x.idx) && Array.isArray(x.tiers)).slice(0, C.MAX_ROUNDS) : []);

// elapsed: how far into the hole we already are (a player coming back mid-hole)
function beginRound(r, elapsed) {
  const p = S.prompts[r - 1];
  if (!p) return; // past the last hole on the list
  Object.assign(S, {
    round: r, prompt: p, data: null, index: null, mine: null, resolved: false, closed: false, closedAt: 0, lastTick: 9, suggestion: null, hold: false, pending: null,
    commits: [null, null, null, null], reveals: [undefined, undefined, undefined, undefined], ready: [false, false, false, false],
    alive: SEATS.map((s) => inMatch(s) && S.hp[s] > 0),
  });
  S.phase = S.alive[me] ? 'preview' : 'watch';
  if (elapsed < 800) multSplash(r);
  S.previewEnds = now() + C.PREVIEW_MS - elapsed;
  S.deadline = S.answerEnds = S.previewEnds + C.ANSWER_MS;
  S.loading = A.loadPrompt(p.id).then((d) => { if (S.prompt === p) { S.data = d; S.index = A.buildIndex(d.answers); } });
  if (S.prompts[r]) A.loadPrompt(S.prompts[r].id).catch(() => {}); // the next hole, ahead of time
  teeUp();
  A.scene.setHole(r - 1, lobbyId + S.matchId, false);
  room.hidden = true;
  const ui = A.ui;
  ui.end.hidden = true; ui.play.hidden = false; ui.play.classList.remove('urgent');
  ui.holeLabel.textContent = `Hole ${r} · damage ×${C.multiplier(r)}`;
  ui.prompt.textContent = p.text;
  ui.prompt.classList.remove('swap'); void ui.prompt.offsetWidth; ui.prompt.classList.add('swap');
  ui.result.hidden = true; ui.result.innerHTML = '';
  ui.swing.textContent = 'Lock in';
  ui.bar.style.transform = 'scaleX(1)';
  closeConfirm();
  if (S.phase === 'watch') {
    ui.form.hidden = true; ui.timer.hidden = true; ui.msg.hidden = true;
    ui.result.innerHTML = `<span class="lie" style="--c:var(--danger)">${inMatch(me) ? 'You’re out' : 'Watching'}</span><div class="res-sub">Watching the rest play this hole.</div>`;
    ui.result.hidden = false;
  } else {
    ui.form.hidden = false; ui.timer.hidden = false;
    ui.input.value = ''; ui.input.disabled = true; ui.swing.disabled = true; ui.input.placeholder = 'get ready…';
    const rivals = others().filter((s) => S.alive[s]);
    status(rivals.length === 1 ? `${names[rivals[0]]} is on the tee with you.` : `${rivals.length} others on the tee with you.`);
  }
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
  if (S.round !== round || S.resolved || S.closed) return; // the hole closed while sealing
  S.mine = { idx, nonce, hash, raw, at: now(), revealed: false };
  S.commits[me] = hash;
  persist();
  send('commit', { r: round, h: hash });
  A.sfx.play('click');
  showLocked();
  checkClosed();
}

function showLocked() {
  const ui = A.ui, name = S.mine ? nameAt(S.mine.idx) : null;
  ui.play.classList.remove('urgent');
  ui.form.hidden = true; ui.timer.hidden = true; ui.msg.hidden = true; ui.clock.textContent = '';
  ui.input.blur();
  ui.result.innerHTML = `<span class="lie" style="--c:var(--sage)">Locked in</span>
    <div class="res-row"><div class="res-name${name ? '' : ' none'}">${name ? A.esc(name) : 'No answer'}</div></div>
    <div class="res-sub" id="waitLine"></div>`;
  ui.result.hidden = false;
  waitLine();
}
// who we are still waiting on
function waitLine() {
  const w = A.$('#waitLine');
  if (!w) return;
  const waiting = SEATS.filter((s) => S.alive[s] && !S.commits[s] && s !== me);
  w.textContent = S.closed || !waiting.length ? 'Everyone is in.' : `Waiting for ${waiting.map((s) => names[s]).join(', ')}. ${C.SQUEEZE_MS / 1000} seconds at most.`;
}

// Everyone still in has locked in: the hole is closed and the sealed answers are shown.
function checkClosed() {
  if (S.closed || !S.matchId) return;
  if (SEATS.every((s) => !S.alive[s] || S.commits[s])) closeHole();
  else waitLine();
}
function closeHole() {
  if (S.closed || S.resolved) return;
  S.closed = true; S.closedAt = now();
  if (leading()) send('close', { r: S.round });
  if (S.phase === 'answer' || S.phase === 'preview') { // too late to answer: this hole is a miss
    S.phase = 'locked'; S.mine = { idx: -1, raw: null, at: now(), revealed: true };
    closeConfirm(); showLocked(); status('Time is up.', false);
  }
  if (S.mine && S.mine.nonce) { S.mine.revealed = true; S.reveals[me] = S.mine.idx; send('reveal', { r: S.round, i: S.mine.idx, n: S.mine.nonce }); }
  waitLine();
  tryResolve();
}

// The leader scores the hole once every sealed answer is shown (or has had its chance).
function tryResolve(force) {
  if (!leading() || !S.closed || S.resolved || S.scoring) return;
  const missing = SEATS.filter((s) => S.alive[s] && S.commits[s] && S.reveals[s] === undefined && !S.quit[s]);
  if (missing.length && !force) return;
  const idx = SEATS.map((s) => (S.alive[s] && S.commits[s] && Number.isInteger(S.reveals[s]) ? S.reveals[s] : -1));
  const round = S.round;
  S.scoring = true;
  S.loading.catch(() => {}).then(() => {
    S.scoring = false;
    if (S.resolved || S.round !== round) return;
    const entry = { idx, tiers: idx.map(tierAt) };
    const quit = SEATS.filter((s) => S.alive[s] && S.quit[s]);
    if (quit.length) entry.quit = quit;
    send('result', { matchId: S.matchId, r: S.round, history: [...S.history.slice(0, S.round - 1), entry] });
    playHole(entry);
  });
}

// Show the hole's result: every shot, then the damage.
function playHole(entry) {
  if (S.resolved) return;
  S.resolved = true; S.closed = true; S.phase = 'reveal';
  closeConfirm();
  if (Array.isArray(entry.quit)) for (const q of entry.quit) if (seatOk(q)) { S.hp[q] = 0; S.alive[q] = false; S.quit[q] = true; }
  const idx = C.pad(entry.idx), tiers = C.pad(entry.tiers);
  const res = C.resolveRound(S.round, idx, tiers, S.alive);
  S.shownHp = [...S.hp]; S.hold = true;
  S.hp = C.applyRound(S.hp, res);
  S.history = [...S.history.slice(0, S.round - 1), entry];
  persist();
  const ui = A.ui;
  ui.play.classList.remove('urgent');
  ui.form.hidden = true; ui.timer.hidden = true; ui.msg.hidden = true; ui.clock.textContent = '';
  ui.result.hidden = true;
  const shooters = SEATS.filter((s) => S.alive[s]);
  let landed = 0;
  S.revealAt = now(); S.pending = { res, idx, tiers };
  const round = S.round, matchId = S.matchId;
  const done = () => { if (++landed === shooters.length && S.pending && S.round === round && S.matchId === matchId) { S.pending = null; showResult(res, idx, tiers); } };
  const thud = (t) => () => A.sfx.play(t < 0 ? 'splash' : t === 0 ? 'sand' : t === 3 ? 'green' : 'thud');
  A.sfx.play('swing');
  for (const s of shooters) A.scene.launch(tiers[s], thud(tiers[s]), () => { if (tiers[s] === 4) A.sfx.play('cup'); done(); }, S.ballK[s] || 0);
  if (!shooters.length) { S.pending = null; showResult(res, idx, tiers); }
}

function sideHtml(s, idx, tier, res) {
  const T = A.tierOf(tier), name = nameAt(idx), dmg = res.damage[s];
  return `<div class="vs-side" style="--c:${T.color}">
    <span class="vs-who"><i class="dot" style="--c:${COLORS[s]}"></i>${who(s)}</span>
    <span class="lie" style="--c:${T.color}">${res.cancelled[s] ? 'Cancelled' : T.name}</span>
    <div class="vs-ans${name ? '' : ' none'}">${name ? A.esc(name) : 'No answer'}</div>
    <div class="vs-pts">+${res.scores[s]}<small class="${dmg ? 'bad' : 'good'}">${dmg ? `−${dmg} health` : 'no damage'}</small></div></div>`;
}

function showResult(res, idx, tiers) {
  S.phase = 'result';
  const before = S.shownHp, outNow = SEATS.filter((s) => S.alive[s] && before[s] > 0 && S.hp[s] <= 0);
  const over = C.outcome(S.hp, S.history.length, before);
  const fxMs = damageFx(res, outNow, over);
  S.resultAt = now() + fxMs; // the countdown to the next hole starts once the damage is in
  const seats = hudSeats().filter((s) => S.alive[s]);
  const hurt = seats.filter((s) => res.damage[s] > 0);
  let verdict;
  if (!hurt.length) verdict = seats.every((s) => res.cancelled[s]) ? '<b>Same answer.</b> It cancels out: no points, no damage.' : '<b>Level on the hole.</b> No damage.';
  else {
    const tops = seats.filter((s) => res.scores[s] === res.top);
    verdict = `${list(tops)} ${verb(tops, 'takes', 'take')} the hole${res.mult > 1 ? `, and every point of gap costs ${res.mult}` : ''}.`;
    if (outNow.length) verdict += ` <b>${list(outNow)} ${verb(outNow, 'is', 'are')} out.</b>`;
  }
  const ui = A.ui;
  ui.result.innerHTML = `<div class="vs n${seats.length}">${seats.map((s) => sideHtml(s, idx[s], tiers[s], res)).join('')}</div>
    <div class="res-sub">${verdict}</div>
    <div class="res-foot"><button class="btn" id="next" type="button">${over ? 'See the result' : 'Next hole'}</button></div>`;
  ui.result.hidden = false;
  drawHud(false);
  const next = A.$('#next');
  next.onclick = () => {
    A.sfx.play('click');
    if (over) return showOver();
    S.ready[me] = true; send('ready', { r: S.round });
    next.disabled = true; next.textContent = 'Waiting for the others…';
    next.dataset.waiting = '1';
    maybeAdvance(false);
  };
  next.focus({ preventScroll: true });
  maybeAdvance(false);
}

// The leader starts the next hole once everyone still playing and here is ready, or after a while.
function maybeAdvance(force) {
  if (!leading() || S.phase !== 'result' || C.outcome(S.hp, S.history.length, S.shownHp)) return;
  const waiting = S.seats.filter((s) => S.hp[s] > 0 && here(s) && !S.quit[s] && !S.ready[s]);
  if (!force && waiting.length) return;
  const r = S.round + 1;
  send('round', roundMsg(r));
  beginRound(r, 0);
}

function showOver() {
  S.phase = 'over';
  const { rounds, outcome } = C.replay(S.seats, S.history);
  const out = outcome || { winners: [] };
  // the order players finished in: winners, then most health, then whoever lasted longest
  const lasted = (s) => { const k = rounds.findIndex((r) => r.hp[s] <= 0); return k < 0 ? 99 : k; };
  // (out on the same hole: whoever had more health going into it)
  const lastHp = (s) => { const k = lasted(s); return k < 99 && rounds[k] ? rounds[k].before[s] : S.hp[s]; };
  const order = [...S.seats].sort((a, b) => (out.winners.includes(b) - out.winners.includes(a)) || (S.hp[b] - S.hp[a]) || (lasted(b) - lasted(a)) || (lastHp(b) - lastHp(a)));
  const won = out.winners.includes(me), shared = out.winners.length > 1;
  const ui = A.ui;
  ui.play.hidden = true; room.hidden = false;
  const title = won ? (shared ? 'Shared win' : 'You win') : out.winners.length ? `${list(out.winners)} ${verb(out.winners, 'wins', 'win')}` : 'All out';
  room.innerHTML = `<div class="eyebrow"><span>Duel over · ${S.history.length} hole${S.history.length === 1 ? '' : 's'}</span></div>
    <h1>${title}</h1>
    <ol class="room-rank">${order.map((s, k) => `<li class="${out.winners.includes(s) ? 'won' : ''}"><span class="place">${out.winners.includes(s) ? 1 : k + 1}</span><i class="dot" style="--c:${COLORS[s]}"></i><span class="nm">${A.esc(names[s])}${s === me ? ' <small>you</small>' : ''}</span><b>${S.hp[s] > 0 ? `${S.hp[s]} health` : S.quit[s] ? 'left' : `out on hole ${lasted(s) + 1}`}</b></li>`).join('')}</ol>
    <ol class="room-holes">${rounds.map((r, k) => {
      const mine = r.before[me] > 0;
      const d = !mine ? 'watching' : r.damage[me] ? `−${r.damage[me]}` : 'no damage';
      return `<li><span>${A.esc(S.prompts[k] ? S.prompts[k].text : `Hole ${k + 1}`)}</span><b class="${mine && r.damage[me] ? 'bad' : mine ? 'good' : ''}">${mine ? `you ${r.scores[me]} · top ${r.top} · ${d}` : d}</b></li>`;
    }).join('')}</ol>
    <div class="intro-foot"><button class="btn ghost" id="leaveDuel" type="button">Leave</button><button class="btn" id="rematch" type="button">${leading() ? 'Play again' : 'Ready to play again'}</button></div>`;
  A.$('#leaveDuel').onclick = () => { send('bye'); post({ type: 'ph-duel-leave' }); };
  const again = A.$('#rematch');
  again.onclick = () => {
    S.rematch[me] = true; send('rematch');
    if (leading()) { if (SEATS.filter(here).length >= 2) newMatch(); return; }
    again.disabled = true; again.textContent = `Waiting for ${names[leader()]}…`;
  };
  rematchLine();
  drawHud(false);
}
function rematchLine() {
  const b = A.$('#rematch');
  if (!b || !leading() || S.phase !== 'over') return;
  const keen = SEATS.filter((s) => s !== me && S.rematch[s] && here(s));
  b.textContent = keen.length ? `Play again (${keen.map((s) => names[s]).join(', ')} ready)` : 'Play again';
}

// ---------- what the others say ----------
async function onMsg(d) {
  if (!d || typeof d.t !== 'string' || !S || !seatOk(d.from) || d.from === me) return;
  const s = d.from;
  switch (d.t) {
    case 'hello':
      if (S.matchId) send('state', stateMsg());
      break;
    case 'state':
      await heal(d);
      break;
    case 'round': {
      if (typeof d.matchId !== 'string' || !Number.isInteger(d.r)) break;
      const seats = cleanSeats(d.seats);
      if (d.matchId !== S.matchId) {
        if (d.r === 1 && seats.length >= 2 && (!S.matchId || S.phase === 'over' || S.phase === 'room')) { startMatch(d.matchId, seats, d.holes); beginRound(1, 0); }
      } else if (d.r > S.round && Array.isArray(d.history) && d.history.length === d.r - 1 && S.phase !== 'reveal') {
        takeHistory(d.history);
        beginRound(d.r, 0);
      }
      break;
    }
    case 'commit':
      if (d.r !== S.round || typeof d.h !== 'string' || !S.alive[s]) break;
      if (S.closed) { // they may have missed my answer: say it again
        if (S.mine && S.mine.nonce) send('reveal', { r: S.round, i: S.mine.idx, n: S.mine.nonce });
        break;
      }
      if (!S.commits[s]) {
        S.commits[s] = d.h;
        if (S.phase === 'answer' || S.phase === 'preview') {
          const squeezed = Math.min(S.deadline, Math.max(now(), S.previewEnds) + C.SQUEEZE_MS);
          if (squeezed < S.deadline) { S.deadline = squeezed; status(`${names[s]} has locked in. ${C.SQUEEZE_MS / 1000} seconds left.`, false); A.sfx.play('tick'); }
        }
      }
      checkClosed();
      break;
    case 'close':
      if (d.r === S.round && !S.closed && s <= leader()) closeHole();
      break;
    case 'reveal': {
      if (d.r !== S.round || S.resolved || !S.commits[s] || S.reveals[s] !== undefined) break;
      const ok = Number.isInteger(d.i) && d.i >= -1 && typeof d.n === 'string' && (await C.seal(S.matchId, d.r, d.i, d.n)) === S.commits[s];
      if (d.r !== S.round || S.resolved || S.reveals[s] !== undefined) break;
      S.reveals[s] = ok ? d.i : -1; // an answer that doesn't match its seal is no answer
      if (!S.closed) closeHole(); // answers are only shown once the hole is closed
      tryResolve();
      break;
    }
    case 'result': {
      if (d.matchId !== S.matchId || !Number.isInteger(d.r) || s > leader()) break;
      const hist = cleanHistory(d.history);
      if (d.r === S.round && hist.length === S.round && !S.resolved) {
        if (hist.length > 1) takeHistory(hist.slice(0, -1));
        playHole(hist[hist.length - 1]);
      } else if (hist.length >= S.history.length && S.phase !== 'reveal' && !S.hold) takeHistory(hist);
      break;
    }
    case 'ready':
      if (d.r === S.round) { S.ready[s] = true; maybeAdvance(false); }
      break;
    case 'rematch':
      S.rematch[s] = true;
      rematchLine();
      break;
    case 'bye':
      S.quit[s] = true;
      if (S.phase === 'room') showRoom();
      else if (S.matchId) quitCheck();
      break;
  }
}

// The leader's record of the duel is the one that counts.
function takeHistory(h) {
  const hist = cleanHistory(h);
  if (JSON.stringify(hist) === JSON.stringify(S.history)) return;
  S.history = hist; S.hp = C.replay(S.seats, hist).hp;
  if (!S.hold) drawHud(false);
}

// Where I am, said every couple of seconds; enough for another screen to catch up from.
const stateMsg = () => ({
  matchId: S.matchId, seats: S.seats, history: S.history, round: S.round, holes: holesMsg(),
  live: !S.resolved && ['preview', 'answer', 'locked', 'watch'].includes(S.phase),
  elapsed: now() - (S.previewEnds - C.PREVIEW_MS),
  commit: S.mine && S.mine.hash ? S.mine.hash : null,
  reveal: S.mine && S.mine.revealed && S.mine.nonce ? { i: S.mine.idx, n: S.mine.nonce } : null,
  closed: S.closed, ready: S.phase === 'result' && S.ready[me], rematch: S.phase === 'over' && S.rematch[me],
  quit: S.quit,
});

// Another screen's state: take what I missed, and never throw away what I have.
async function heal(d) {
  const s = d.from;
  if (typeof d.matchId !== 'string' || !Array.isArray(d.history)) return;
  const r = Number.isInteger(d.round) ? d.round : 0;
  const isLead = s <= leader();
  if (d.matchId !== S.matchId) {
    // I have no duel (this page is new), or the leader started a new one I never heard about
    if (!S.matchId || S.phase === 'room' || (S.phase === 'over' && isLead && cleanHistory(d.history).length < S.history.length)) adopt(d);
    return;
  }
  if (Array.isArray(d.quit)) d.quit.forEach((q, i) => { if (q === true && seatOk(i) && !S.quit[i]) { S.quit[i] = true; quitCheck(); } });
  if (isLead) {
    const hist = cleanHistory(d.history);
    if (d.live && r > S.round && hist.length === r - 1 && S.phase !== 'reveal') { takeHistory(hist); beginRound(r, Math.max(0, Number(d.elapsed) || 0)); }
    else if (hist.length === S.round && r === S.round && !S.resolved && S.round > 0) {
      // the leader scored a hole I never heard the result of
      if (hist.length > 1) takeHistory(hist.slice(0, -1));
      playHole(hist[hist.length - 1]);
    } else if (!d.live && hist.length > S.history.length && r > S.round && S.phase !== 'reveal') { takeHistory(hist); S.round = r; betweenHoles(); }
    else if (hist.length === S.history.length && !S.hold && S.phase !== 'reveal') takeHistory(hist);
    if (r === S.round && d.closed && !S.closed) closeHole();
  }
  if (r === S.round && S.alive[s] && !S.resolved) {
    if (typeof d.commit === 'string') await onMsg({ t: 'commit', from: s, r, h: d.commit });
    if (d.reveal && r === S.round && !S.resolved) await onMsg({ t: 'reveal', from: s, r, i: d.reveal.i, n: d.reveal.n });
  }
  if (r === S.round && d.ready && S.phase === 'result' && !S.ready[s]) { S.ready[s] = true; maybeAdvance(false); }
  if (d.rematch && S.phase === 'over' && !S.rematch[s]) { S.rematch[s] = true; rematchLine(); }
}

// Coming into a duel that is already going (a reload, a dropped connection, or joining late to watch).
function adopt(d) {
  const seats = cleanSeats(d.seats);
  if (seats.length < 2) return;
  const history = cleanHistory(d.history);
  startMatch(d.matchId, seats, d.holes);
  S.history = history;
  const rp = C.replay(seats, history);
  S.hp = rp.hp; S.round = history.length;
  if (Array.isArray(d.quit)) d.quit.forEach((q, i) => { if (q === true && seatOk(i)) S.quit[i] = true; });
  if (rp.outcome) return showOver();
  if (d.live && d.round === history.length + 1) {
    const mine = stored(); // read before beginRound, which saves the new hole over it
    beginRound(d.round, Math.max(0, Number(d.elapsed) || 0));
    if (mine && mine.matchId === S.matchId && mine.round === S.round && mine.mine && mine.mine.hash && S.alive[me]) {
      S.mine = { ...mine.mine, revealed: false }; S.commits[me] = S.mine.hash; S.phase = 'locked';
      S.loading.then(() => { if (S.phase === 'locked') showLocked(); });
      send('commit', { r: S.round, h: S.mine.hash });
    }
    if (d.closed) closeHole();
    return;
  }
  betweenHoles();
}

// Back in between holes: the leader starts the next one shortly; everyone else says they are ready.
function betweenHoles() {
  A.ui.play.hidden = true; room.hidden = false;
  room.innerHTML = `<div class="eyebrow"><span>Duel · back in</span></div><h1>Catching up</h1><p>You are back in after hole ${S.history.length}. The next hole starts in a moment.</p>`;
  S.phase = 'result'; S.resolved = true; S.hold = false; S.shownHp = [...S.hp]; S.resultAt = now() - ADVANCE_MS + CATCHUP_MS; S.ready[me] = true;
  send('ready', { r: S.round });
  drawHud(false);
}

// Someone left or has been away too long: they go out when the hole in play is scored. With only
// one player still standing, the leader scores it at once.
function quitCheck() {
  if (!leading() || !S.matchId || S.phase === 'over' || S.phase === 'room') return;
  const standing = S.seats.filter((s) => S.hp[s] > 0 && !S.quit[s]);
  if (standing.length > 1) return;
  if (S.phase === 'result' || S.phase === 'reveal') { // between holes: put the leaving on the record now
    const entry = { idx: [-1, -1, -1, -1], tiers: [-1, -1, -1, -1], quit: S.seats.filter((s) => S.hp[s] > 0 && S.quit[s]) };
    if (!entry.quit.length) return;
    const history = [...S.history, entry];
    send('result', { matchId: S.matchId, r: history.length, history });
    S.history = history; S.round = history.length; S.hp = C.replay(S.seats, history).hp;
    return showOver();
  }
  if (!S.closed) closeHole();
  tryResolve(true);
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
  // a player who has been away too long is out
  for (const s of SEATS) {
    if (s === me || !S.matchId || !inMatch(s) || S.quit[s] || S.phase === 'over') { awaySince[s] = 0; continue; }
    if (here(s)) awaySince[s] = 0; else if (!awaySince[s]) awaySince[s] = t;
    if (awaySince[s] && t > awaySince[s] + AWAY_MS && S.hp[s] > 0) { S.quit[s] = true; quitCheck(); }
  }
  if (leading() && S.matchId && !S.resolved && ['preview', 'answer', 'locked', 'watch'].includes(S.phase)) {
    // the leader closes the hole when everyone connected is in (and someone is), or time is up
    const playing = SEATS.filter((s) => S.alive[s] && !S.quit[s]);
    const allHereIn = playing.every((s) => S.commits[s] || !here(s)) && playing.some((s) => S.commits[s]);
    if (!S.closed && ((allHereIn && t > S.previewEnds) || t > S.deadline + GRACE_MS)) closeHole();
    if (S.closed && t > S.closedAt + REVEAL_WAIT_MS) tryResolve(true);
  }
  if (S.phase === 'result') {
    const b = A.$('#next');
    if (b && !b.dataset.waiting && b.textContent !== 'See the result') {
      const left = Math.ceil((S.resultAt + ADVANCE_MS - t) / 1000);
      b.textContent = left > ADVANCE_MS / 1000 ? 'Next hole' : left > 0 ? `Next hole · ${left}` : 'Starting…';
    }
    if (leading() && S.resultAt && t > S.resultAt + ADVANCE_MS) maybeAdvance(true);
  } else if (S.phase === 'reveal' && S.revealAt && t > S.revealAt + REVEAL_MAX_MS && S.pending) {
    const p = S.pending; S.pending = null;
    showResult(p.res, p.idx, p.tiers);
  }
}

function onPresence(d) {
  if (Array.isArray(d.players)) for (const p of d.players) if (p && seatOk(p.slot) && typeof p.name === 'string') names[p.slot] = p.name;
  const was = present;
  present = [...new Set([...(Array.isArray(d.present) ? d.present.filter(seatOk) : []), me])].sort();
  if (!S) return;
  if (S.phase === 'room') showRoom();
  else drawHud(false);
  if (present.some((s) => !was.includes(s))) send('hello'); // whoever has the duel will answer with it
  rematchLine();
}

function start(api) {
  A = api;
  build();
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== parent) return;
    const d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'ph-duel-init') {
      me = seatOk(d.slot) ? d.slot : 0; lobbyId = String(d.lobbyId); code = String(d.code);
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
    } else if (d.type === 'ph-duel-msg') void onMsg(d.data);
  });
  const frame = () => { tick(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  setInterval(tick, 250); // a hidden tab gets no animation frames
  A.scene.setDuo(2, [COLORS[0], COLORS[1]]);
  post({ type: 'ph-duel-ready' });
}

window.PinHighDuel = { start };
})();
