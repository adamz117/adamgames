// Builds the answer lists for Pin High.
//
//   node games/pin-high/build-data.js            build every prompt (cached ones are reused)
//   node games/pin-high/build-data.js golf-majors  rebuild just these ids (ignores their cache)
//   node games/pin-high/build-data.js --views      also rank by Wikipedia readers (slow: the
//                                                  reader-count service throttles; rerun to resume)
//
// Each prompt is one Wikidata query (see sparqlItems), which returns every valid answer with its
// alternative names and how well known it is. Answers are ranked by that and cut into lies: the
// best known are the bunker (what everyone blurts out), the long tail is the green, and the
// least known of all is the cup.
// To add a prompt, add a line to PROMPTS and run the script.

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'public', 'games', 'pin-high', 'data');
const CACHE = path.join(__dirname, '.cache');
const UA = 'trivia-list-builder/0.1 (node fetch)';
const MAX_ANSWERS = 1500;

const cat = (...names) => ({ cats: names });
const q = (pattern) => ({ sparql: pattern });
const COUNTRY = '?i wdt:P31 wd:Q3624078. FILTER NOT EXISTS { ?i wdt:P576 [] }';
// "Liverpool F.C." is also accepted as "Liverpool".
const CLUB_SHORT = (n) => n.replace(/(^|s)(A.?F.?C.?|F.?C.?|C.?F.?|S.?C.?|A.?C.?|S.?S.?C.?|A.?S.?|U.?S.?|U.?D.?|C.?D.?|R.?C.?D?.?|S.?V.?|B.?C.?|1.|OGC|LOSC|VfB|VfL|TSG|FSV|Calcio)(?=s|$)/g, ' ').replace(/s+/g, ' ').trim();
const letters = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

const PROMPTS = [
  // geography
  { id: 'countries', group: 'geo', text: 'Name a country', ...q(COUNTRY) },
  { id: 'countries-africa', group: 'geo', text: 'Name a country in Africa', ...q(`${COUNTRY} ?i wdt:P30 wd:Q15.`) },
  { id: 'countries-asia', group: 'geo', text: 'Name a country in Asia', ...q(`${COUNTRY} ?i wdt:P30 wd:Q48.`) },
  { id: 'countries-end-n', group: 'geo', text: 'Name a country whose name ends in the letter N', ...q(COUNTRY), keep: (n) => /n$/.test(letters(n)) },
  { id: 'countries-second-a', group: 'geo', text: 'Name a country whose second letter is A', ...q(COUNTRY), keep: (n) => letters(n)[1] === 'a' },
  { id: 'capitals', group: 'geo', text: 'Name a capital city', ...q('?c wdt:P31 wd:Q3624078; wdt:P36 ?i. FILTER NOT EXISTS { ?c wdt:P576 [] }') },
  { id: 'us-states', group: 'geo', text: 'Name a US state', ...q('?i wdt:P31 wd:Q35657.') },
  { id: 'rivers', group: 'geo', text: 'Name a river longer than 1,000 km', ...q('?i wdt:P31 wd:Q4022; wdt:P2043 ?len. FILTER(?len > 1000)') },
  { id: 'mountains', group: 'geo', text: 'Name a mountain higher than 6,000 m', ...q('?i wdt:P31 wd:Q8502; wdt:P2044 ?h. FILTER(?h > 6000 && ?h < 9000)') },
  // golf
  { id: 'golf-majors', group: 'golf', text: "Name a golfer who has won a men's major", ...cat("Winners of men's major golf championships") },
  { id: 'ryder-cup', group: 'golf', text: 'Name a golfer who has played in the Ryder Cup', ...cat('Ryder Cup competitors for Europe', 'Ryder Cup competitors for the United States') },
  { id: 'golf-hof', group: 'golf', text: 'Name a member of the World Golf Hall of Fame', ...cat('World Golf Hall of Fame inductees') },
  // sport
  { id: 'f1-champions', group: 'sport', text: 'Name a Formula One world champion', ...cat("Formula One World Drivers' Champions") },
  { id: 'ballon-dor', group: 'sport', text: "Name a Ballon d'Or winner", ...cat("Ballon d'Or winners") },
  { id: 'england-footballers', group: 'sport', text: 'Name a footballer who has played for England', ...cat("England men's international footballers") },
  { id: 'springboks', group: 'sport', text: 'Name a Springbok (South Africa rugby international)', ...cat('South Africa international rugby union players') },
  { id: 'proteas', group: 'sport', text: 'Name a South African Test cricketer', ...cat('South Africa Test cricketers') },
  { id: 'tennis-slams', group: 'sport', text: 'Name a Grand Slam singles champion (tennis)', ...cat("Grand Slam (tennis) champions in men's singles", "Grand Slam (tennis) champions in women's singles") },
  { id: 'euro-clubs', group: 'sport', text: "Name a club in the Premier League, La Liga, Serie A, the Bundesliga or Ligue 1", ...q('VALUES ?l { wd:Q9448 wd:Q324867 wd:Q15804 wd:Q82595 wd:Q13394 } ?i wdt:P118 ?l; wdt:P31 wd:Q476028.'), short: CLUB_SHORT },
  { id: 'us-teams', group: 'sport', text: 'Name an NBA, NFL, MLB or NHL team', ...q('VALUES ?l { wd:Q155223 wd:Q1215884 wd:Q1163715 wd:Q1215892 } ?i wdt:P118 ?l; wdt:P31/wdt:P279* wd:Q12973014.') },
  // music
  { id: 'songs-classic', group: 'music', text: 'Name a song by The Beatles, Queen or ABBA', ...cat('The Beatles songs', 'Queen (band) songs', 'ABBA songs') },
  { id: 'songs-pop', group: 'music', text: 'Name a song by Taylor Swift, Adele or Ed Sheeran', ...cat('Taylor Swift songs', 'Adele songs', 'Ed Sheeran songs') },
  { id: 'rock-hall', group: 'music', text: 'Name an act in the Rock and Roll Hall of Fame', ...cat('Rock and Roll Hall of Fame inductees') },
  // film
  { id: 'pixar-disney', group: 'film', text: 'Name a Pixar or Walt Disney Animation Studios film', ...cat('Pixar animated films', 'Walt Disney Animation Studios films') },
  { id: 'bond-films', group: 'film', text: 'Name a James Bond film', ...cat('James Bond films') },
  { id: 'mcu-films', group: 'film', text: 'Name a Marvel Cinematic Universe film', ...cat('Marvel Cinematic Universe films') },
  { id: 'best-picture', group: 'film', text: 'Name a film that won the Oscar for Best Picture', ...cat('Best Picture Academy Award winners') },
  { id: 'oscar-actors', group: 'film', text: 'Name a winner of the Best Actor or Best Actress Oscar', ...cat('Best Actor Academy Award winners', 'Best Actress Academy Award winners') },
  { id: 'directors-films', group: 'film', text: 'Name a film directed by Spielberg, Nolan, Tarantino or Scorsese', ...q('VALUES ?d { wd:Q8877 wd:Q25191 wd:Q3772 wd:Q41148 } ?i wdt:P57 ?d; wdt:P31 wd:Q11424.') },
  // science and knowledge
  { id: 'elements', group: 'science', text: 'Name a chemical element', ...q('?i wdt:P31 wd:Q11344.') },
  { id: 'constellations', group: 'science', text: 'Name a constellation', ...q('?i wdt:P31 wd:Q8928.') },
  { id: 'dog-breeds', group: 'science', text: 'Name a dog breed', ...q('?i wdt:P31 wd:Q39367.') },
  { id: 'programming-languages', group: 'science', text: 'Name a programming language', ...q('?i wdt:P31 wd:Q9143.') },
  // history and culture
  { id: 'us-presidents', group: 'history', text: 'Name a US president', ...q('?i wdt:P39 wd:Q11696; wdt:P31 wd:Q5.') },
  { id: 'shakespeare', group: 'history', text: 'Name a Shakespeare play', ...cat('Shakespearean comedies', 'Shakespearean tragedies', 'Shakespearean histories') },
  { id: 'greek-gods', group: 'history', text: 'Name a Greek god or goddess', ...q('?i wdt:P31 wd:Q22989102.') },
  { id: 'nobel-peace', group: 'history', text: 'Name a Nobel Peace Prize winner', ...cat('Nobel Peace Prize laureates') },
  // food and brands
  { id: 'pasta', group: 'food', text: 'Name a type of pasta', ...cat('Types of pasta') },
  { id: 'chocolate-bars', group: 'food', text: 'Name a chocolate bar', ...cat('Chocolate bars') },
  { id: 'fast-food', group: 'food', text: 'Name an American fast-food chain', ...cat('Fast-food chains of the United States') },
  { id: 'car-makers', group: 'food', text: 'Name a car manufacturer', ...q('?i wdt:P31 wd:Q786820.') },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One request at a time with a pause between them, as the query service asks.
let lane = Promise.resolve();
function getJson(url, tries = 2) {
  const run = async () => {
    for (let i = 0; ; i++) {
      await sleep(1200);
      let wait = 5000 * (i + 1);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(65000) });
        if (res.ok) return await res.json();
        if (i >= tries) throw new Error(`${res.status} ${url.slice(0, 120)}`);
        const after = Number(res.headers.get('retry-after'));
        if (after) wait = Math.max(wait, after * 1000);
      } catch (e) {
        if (i >= tries) throw e;
      }
      await sleep(wait);
    }
  };
  const p = lane.then(run, run);
  lane = p.catch(() => {});
  return p;
}

// One Wikidata query per prompt returns the whole list: the article title, how many language
// editions of Wikipedia have the article (how well known it is), a short description and the
// alternative names. A category prompt asks the query service to read the category for us.
async function sparqlItems(pattern) {
  const query = `SELECT ?title ?sl ?desc (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
    ${pattern}
    ?i wikibase:sitelinks ?sl.
    OPTIONAL { ?i schema:description ?desc. FILTER(lang(?desc) = "en") }
    OPTIONAL { ?i skos:altLabel ?alt. FILTER(lang(?alt) = "en") }
  } GROUP BY ?title ?sl ?desc`;
  const r = await getJson('https://query.wikidata.org/sparql?' + new URLSearchParams({ format: 'json', query }));
  return r.results.bindings.map((b) => ({ title: b.title.value, pop: Number(b.sl.value), desc: b.desc?.value ?? '', alts: b.alts?.value ? b.alts.value.split('|') : [] }));
}
const ARTICLE = '?article schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title.';
const categoryPattern = (name) => `{ SELECT ?title ?i WHERE { SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:endpoint "en.wikipedia.org"; wikibase:api "Generator"; wikibase:limit 6000;
        mwapi:generator "categorymembers"; mwapi:gcmtitle "Category:${name.replace(/"/g, '\\"')}"; mwapi:gcmnamespace "0"; mwapi:gcmlimit "max".
      ?title wikibase:apiOutput mwapi:title. ?i wikibase:apiOutputItem mwapi:item.
    } FILTER(BOUND(?i)) } }`;

const JUNK = /\blists? of |^(Outline|Index|Timeline|History|Glossary|Bibliography) of |^Template:|\bdiscography\b|\bfilmography\b| in film$|^Danish Realm$|^Portrayal of /i;
const cleanName = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').trim();
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');

async function gather(p) {
  const items = [];
  if (p.cats) for (const c of p.cats) items.push(...await sparqlItems(categoryPattern(c)));
  else items.push(...await sparqlItems(p.sparql + ' ' + ARTICLE));
  return items.filter((it) => it.title && !JUNK.test(it.title));
}

// Optional (--views): last month's readers of the English Wikipedia article, a better measure of
// how well known an answer is than the number of language editions. Asked for
// the best-linked VIEW_TOP of each list only; the tail keeps its language-count order below them.
const VIEW_TOP = 320;
const WITH_VIEWS = process.argv.includes('--views');
const VIEWS_FILE = path.join(CACHE, 'views.json');
let viewCache = null;
async function addViews(raw) {
  viewCache ??= fs.existsSync(VIEWS_FILE) ? JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8')) : {};
  const d = new Date(), end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const stamp = (x) => x.toISOString().slice(0, 10).replace(/-/g, '') + '00';
  const top = [...raw].sort((a, b) => b.pop - a.pop).slice(0, VIEW_TOP);
  const todo = top.filter((it) => !(it.title in viewCache));
  await Promise.all([0, 1, 2, 3].map(async () => {
    for (let it; (it = todo.shift()); ) {
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(it.title.replace(/ /g, '_'))}/monthly/${stamp(start)}/${stamp(end)}`;
      for (let i = 0; i < 4; i++) {
        try {
          const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
          if (res.ok) { viewCache[it.title] = (await res.json()).items.reduce((a, x) => a + x.views, 0); break; }
          if (res.status === 404) { viewCache[it.title] = 0; break; }
        } catch {}
        await sleep(2000 * (i + 1));
      }
      await sleep(60);
    }
  }));
  fs.writeFileSync(VIEWS_FILE, JSON.stringify(viewCache));
  // Reader counts are only used when the whole top of the list has them: a half-fetched list would rank worse than none.
  const complete = top.every((it) => it.title in viewCache);
  for (const it of raw) it.views = complete ? viewCache[it.title] ?? -1 : 0;
  return complete;
}

function shape(p, raw) {
  const byKey = new Map();
  for (const it of raw) {
    const name = cleanName(it.title);
    if (!name || (p.keep && !p.keep(name))) continue;
    const key = norm(name);
    const prev = byKey.get(key);
    if (prev && (prev.views - it.views || prev.pop - it.pop) >= 0) continue;
    const short = p.short ? p.short(name) : '';
    byKey.set(key, { name, pop: it.pop, views: it.views, desc: it.desc, aliases: short && short !== name ? [short, ...it.alts] : it.alts });
  }
  const list = [...byKey.values()].sort((a, b) => b.views - a.views || b.pop - a.pop || a.name.length - b.name.length || a.name.localeCompare(b.name)).slice(0, MAX_ANSWERS);
  const names = new Set(list.map((a) => norm(a.name)));
  const used = new Set();
  for (const a of list) {
    const own = norm(a.name);
    const out = [];
    for (const al of a.aliases) {
      const c = cleanName(al), k = norm(c);
      // An alias never shadows another answer's own name, or an alias a better-known answer already has.
      if (!k || k === own || k.length < 2 || c.length > 44 || names.has(k) || used.has(k) || JUNK.test(c)) continue;
      used.add(k);
      out.push(c);
      if (out.length >= 24) break;
    }
    a.aliases = out;
  }
  const n = list.length;
  const bunker = Math.min(10, Math.max(2, Math.round(n * 0.04)));
  const rough = bunker + Math.min(50, Math.max(3, Math.round(n * 0.1)));
  const fairway = rough + Math.min(280, Math.max(4, Math.round(n * 0.26)));
  list.forEach((a, i) => { a.tier = i < bunker ? 0 : i < rough ? 1 : i < fairway ? 2 : 3; });
  // The cup is the least-read answer among those we have reader counts for, or the tail's last.
  if (n > 8) list[n - 1].tier = 4;
  return { id: p.id, text: p.text, group: p.group, answers: list.map((a) => [a.name, a.tier, a.desc || '', ...a.aliases]) };
}

async function build(p, fresh) {
  const cacheFile = path.join(CACHE, `${p.id}.json`);
  let raw;
  // --cached-cats: skip category prompts that are not cached yet (for when the category service is down)
  if (p.cats && process.argv.includes('--cached-cats') && !fs.existsSync(cacheFile)) { console.log(`LATER ${p.id}`); return null; }
  if (!fresh && fs.existsSync(cacheFile)) raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  else {
    raw = await gather(p);
    if (raw.length) fs.writeFileSync(cacheFile, JSON.stringify(raw));
  }
  let ranked = 'languages';
  if (WITH_VIEWS) { if (await addViews(raw)) ranked = 'readers'; } else for (const it of raw) it.views = 0;
  const data = shape(p, raw);
  const n = data.answers.length;
  if (n < 10) { console.log(`SKIP ${p.id}: only ${n} answers`); return null; }
  fs.writeFileSync(path.join(OUT, `${p.id}.json`), JSON.stringify(data));
  const top = data.answers.slice(0, 4).map((a) => a[0]).join(', ');
  console.log(`${p.id}: ${n} answers by ${ranked} | top: ${top} | cup: ${data.answers[n - 1][0]}`);
  return { id: p.id, text: p.text, group: p.group, count: n };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
  const manifest = [];
  const queue = [...PROMPTS];
  const results = new Map();
  await Promise.all([0, 1, 2].map(async () => {
    for (let p; (p = queue.shift()); ) {
      try { results.set(p.id, await build(p, only.has(p.id))); }
      catch (e) { console.log(`FAIL ${p.id}: ${e.message}`); results.set(p.id, null); }
    }
  }));
  for (const p of PROMPTS) if (results.get(p.id)) manifest.push(results.get(p.id));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), prompts: manifest }));
  console.log(`\n${manifest.length} of ${PROMPTS.length} prompts built`);
})();
