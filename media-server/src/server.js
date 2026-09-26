// Salasar media server.
//
// App API (STAFF/ADMIN login token required):
//   PUT /v1/customers/{customerId}/images/{index}       upload an ID photo (raw JPEG)
//   GET /v1/customers/{customerId}/images/{index}.jpg   view it
//
// Admin web page at / (ADMIN login):
//   GET /v1/admin/guests?q=           search guests
//   GET /v1/admin/guests/{id}         one guest's details
//   GET /v1/admin/guests/{id}/zip     download one guest's folder
//   GET /v1/admin/export.csv          all guests as CSV
//   GET /v1/admin/export.zip          the whole archive

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { config } from './config.js';
import { authenticate, HttpError } from './firebase.js';
import { PHOTOS_DIR, GUESTS_DIR, CSV_PATH, guests, state, guestSummary, photoFiles, refreshPhotos, writeCsv } from './archive.js';
import { startSync } from './sync.js';

const STAFF = ['ADMIN', 'STAFF'];
const ADMIN = ['ADMIN'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const send = (res, status, body, headers = {}) => {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
};

const readBody = req =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > config.maxUploadBytes) {
        reject(new HttpError(413, 'Photo is too large (max 12 MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const zipTo = (res, filename, addEntries) => {
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  const zip = archiver('zip', { zlib: { level: 1 } }); // photos are already compressed
  zip.on('error', err => {
    console.error('[zip]', err.message);
    res.destroy(err);
  });
  zip.pipe(res);
  addEntries(zip);
  zip.finalize();
};

/* ---------------- routes ---------------- */

const uploadPhoto = async (req, res, customerId, index) => {
  const user = await authenticate(req, STAFF);
  const body = await readBody(req);
  if (body.length < 100 || body[0] !== 0xff || body[1] !== 0xd8) throw new HttpError(415, 'Only JPEG photos are accepted');

  const dir = path.join(PHOTOS_DIR, customerId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${index}.jpg`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
  refreshPhotos(customerId);

  console.log(`[upload] ${customerId}/${index}.jpg (${Math.round(body.length / 1024)} KB) by ${user.email}`);
  // ?v= changes when a photo is replaced, so phones don't show a cached old one.
  send(res, 200, { url: `${config.publicUrl}/v1/customers/${customerId}/images/${index}.jpg?v=${Date.now()}` });
};

const servePhoto = async (req, res, customerId, index) => {
  await authenticate(req, STAFF);
  const file = path.join(PHOTOS_DIR, customerId, `${index}.jpg`);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Photo not found');
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': stat.size,
    // Private: phones may cache it, shared proxies may not.
    'Cache-Control': 'private, max-age=86400',
  });
  fs.createReadStream(file).pipe(res);
};

const adminRoute = async (req, res, url) => {
  await authenticate(req, ADMIN);
  const parts = url.pathname.split('/').filter(Boolean).slice(2); // after /v1/admin

  if (parts[0] === 'export.csv') {
    writeCsv();
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="salasar-guests.csv"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(CSV_PATH).pipe(res);
  }
  if (parts[0] === 'export.zip') {
    writeCsv();
    const stamp = new Date().toISOString().slice(0, 10);
    return zipTo(res, `salasar-guests-${stamp}.zip`, zip => {
      zip.directory(GUESTS_DIR, 'guests');
      zip.file(CSV_PATH, { name: 'guests.csv' });
    });
  }
  if (parts[0] !== 'guests') throw new HttpError(404, 'Not found');

  if (!parts[1]) {
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 1000);
    const list = Array.from(guests.keys())
      .map(id => guestSummary(id))
      .filter(g => !q || g.name.toLowerCase().includes(q) || g.mobile.includes(q) || g.rooms.join(' ').includes(q))
      .sort((a, b) => b.checkInDay.localeCompare(a.checkInDay));
    return send(res, 200, { total: list.length, guests: list.slice(0, limit) });
  }

  const id = parts[1];
  if (!ID_RE.test(id) || !guests.has(id)) throw new HttpError(404, 'Guest not found');
  if (parts[2] === 'zip') {
    const folder = state.folders[id];
    if (!folder) throw new HttpError(404, 'Guest folder not written yet');
    return zipTo(res, `${path.basename(folder)}.zip`.replace(/"/g, ''), zip => zip.directory(path.join(GUESTS_DIR, folder), path.basename(folder)));
  }
  const folder = state.folders[id];
  const details = folder ? JSON.parse(fs.readFileSync(path.join(GUESTS_DIR, folder, 'details.json'), 'utf8')) : {};
  return send(res, 200, {
    ...guestSummary(id),
    customer: details.customer || guests.get(id).customer,
    stays: details.stays || [],
    photoUrls: photoFiles(id).map(f => `/v1/customers/${id}/images/${f}`),
  });
};

const serveAdminPage = res => {
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, 'admin.html'), 'utf8')
    .replace('__FIREBASE_CONFIG__', JSON.stringify({ apiKey: config.firebase.webApiKey, authDomain: config.firebase.authDomain, projectId: config.firebase.projectId }));
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(html);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    const photo = url.pathname.match(/^\/v1\/customers\/([^/]+)\/images\/(\d)(\.jpg)?$/);
    if (photo) {
      const [, customerId, index, ext] = photo;
      if (!ID_RE.test(customerId)) throw new HttpError(400, 'Invalid guest id');
      if (req.method === 'PUT' && !ext) return await uploadPhoto(req, res, customerId, index);
      if (req.method === 'GET' && ext) return await servePhoto(req, res, customerId, index);
      throw new HttpError(405, 'Method not allowed');
    }
    if (req.method === 'GET' && url.pathname.startsWith('/v1/admin/')) return await adminRoute(req, res, url);
    if (req.method === 'GET' && url.pathname === '/health') {
      // Guest count only for checks run on the VM itself (nginx adds X-Real-IP for outside requests).
      const local = !req.headers['x-real-ip'] && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      return send(res, 200, local ? { ok: true, guests: guests.size } : { ok: true });
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin')) return serveAdminPage(res);
    throw new HttpError(404, 'Not found');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(`[error] ${req.method} ${url.pathname}:`, err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Server error' : err.message });
    else res.destroy();
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Salasar media server on http://${config.host}:${config.port} (data: ${config.dataDir}, public: ${config.publicUrl})`);
  if (config.syncEnabled) startSync();
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
