// node games/pin-high/test-match.js : checks the answer matcher against the built lists.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../../public/games/pin-high/game.js'), 'utf8');
// Pull the matcher (a pure block of game.js) out between its markers.
const block = src.slice(src.indexOf('// ---------- answer matching ----------'), src.indexOf('// ---------- sound ----------'));
const { buildIndex, resolve } = new Function(block + '; return { buildIndex, resolve };')();
const load = (id) => JSON.parse(fs.readFileSync(path.join(__dirname, `../../public/games/pin-high/data/${id}.json`), 'utf8'));
const check = (id, cases) => {
  const d = load(id), ix = buildIndex(d.answers);
  for (const [typed, want, sure] of cases) {
    const r = resolve(ix, typed), got = r ? d.answers[r.i][0] : null;
    assert.strictEqual(got, want, `${id}: "${typed}" -> ${got}, wanted ${want}`);
    if (want) assert.strictEqual(r.sure, sure, `${id}: "${typed}" sure=${r.sure}, wanted ${sure}`);
  }
  console.log(`ok ${id} (${cases.length})`);
};
const sets = {
  'countries-asia': [['japan', 'Japan', true], ['  JAPAN ', 'Japan', true], ['jpan', 'Japan', false], ['kazakhstn', 'Kazakhstan', false], ['srilanka', 'Sri Lanka', true], ['tajikistn', 'Tajikistan', false], ['france', null], ['xx', null], ['iran', 'Iran', true], ['iraq', 'Iraq', true]],
  'golf-majors': [['tiger woods', 'Tiger Woods', true], ['mcilroy', 'Rory McIlroy', false], ['rory mcilroy', 'Rory McIlroy', true], ['rory mcilory', 'Rory McIlroy', false], ['ernie els', 'Ernie Els', true], ['lionel messi', null]],
  'elements': [['gold', 'Gold', true], ['sodum', 'Sodium', false], ['aluminum', 'Aluminium', true], ['unobtainium', null]],
};
for (const [id, cases] of Object.entries(sets)) {
  if (!fs.existsSync(path.join(__dirname, `../../public/games/pin-high/data/${id}.json`))) { console.log(`skip ${id} (not built)`); continue; }
  check(id, cases);
}
