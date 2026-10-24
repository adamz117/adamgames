// Static file server for the game: node server.js  (then open http://localhost:8080)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname, PORT = +process.env.PORT || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.jpg': 'image/jpeg', '.json': 'application/json' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)]) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
