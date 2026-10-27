// OSM water for Cotswold Downs, from the Overpass answer kept in osm-raw.json (Overpass is often busy):
// the estate's dams, ponds and wetlands as osm-water.json, the format setup.js writes for "water": "osm".
// House swimming pools are left out, and so are the wetland ("fen") outlines: they are drawn loosely round reeds,
// scrub and forest alike (one takes in the 10th tee). The reeds that play as water are drawn by hand in
// shapes.json manual.water instead. node make-water.js
const fs = require('node:fs');
const path = require('node:path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'osm-raw.json'), 'utf8')).elements;
const closed = g => g && g.length > 3 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon;
const lakes = raw.filter(e => e.type === 'way' && e.tags && closed(e.geometry)
  && e.tags.natural === 'water' && !/pool/.test(e.tags.water || '') && !e.tags.leisure)
  .map(e => ({ kind: e.tags.water || 'water', id: e.id, outer: e.geometry.map(p => [p.lat, p.lon]), inner: [] }));
fs.writeFileSync(path.join(__dirname, 'osm-water.json'), JSON.stringify(lakes));
console.log('osm water:', lakes.length, lakes.map(l => l.kind).join(' '));
