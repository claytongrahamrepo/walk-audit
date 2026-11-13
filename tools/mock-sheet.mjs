// Local stand-in for the shared Google Sheet, for testing the page without
// Google. It runs the real backend/Code.gs on an imitation of Sheets and Drive
// (tools/fake-google.mjs), and answers over HTTP the way an Apps Script web
// app does: plain-text JSON POST, a 302 redirect to the reply, and no answer
// to a CORS preflight.
// Run: node tools/mock-sheet.mjs [port] [dataDir]     key is "test"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadBackend } from './fake-google.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8768);
const dir = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'walk-audit-mock-'));
const backend = loadBackend(path.join(here, '..', 'backend', 'Code.gs'), { photoDir: path.join(dir, 'photos') });
const replies = new Map();
let seq = 0;

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const json = (o) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); }
  if (req.method === 'GET' && u.pathname === '/echo') { const id = u.searchParams.get('id'), r = replies.get(id); replies.delete(id); return json(r || { ok: false, error: 'gone' }); }
  if (req.method === 'GET') {
    if (u.searchParams.get('action') === 'dump') return json({ ok: true, dir, db: backend.dump() });   // test helper, not in Code.gs
    return json(backend.get(Object.fromEntries(u.searchParams)));
  }
  if (req.method === 'POST') {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => {
      const id = String(++seq);
      replies.set(id, backend.post(s));
      res.writeHead(302, { ...cors, Location: '/echo?id=' + id }); res.end();
    });
    return;
  }
  res.writeHead(405); res.end();
}).listen(port, '127.0.0.1', () => console.log('mock sheet (running backend/Code.gs) on http://127.0.0.1:' + port + '  data in ' + dir));
