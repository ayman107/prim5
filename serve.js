const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join('C:', 'Users', 'ayman', 'MeClaw', 'test', 'metelegram', 'opencode', 'tutormisr');
const PORT = 8081;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json',
  '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml'
};
http.createServer((req, res) => {
  try {
    let p = req.url.split('?')[0];
    try { p = decodeURIComponent(p); } catch (e) {}
    if (p === '/' || p === '') p = '/index.html';
    let file = path.join(ROOT, p.replace(/^[\\/]+/, ''));
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) file = path.join(ROOT, 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('err ' + e.message);
  }
}).listen(PORT, () => console.log('TUTORMISR http://localhost:' + PORT));