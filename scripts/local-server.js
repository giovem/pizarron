/**
 * Servidor local para oficina (red local). Incluye medidas de seguridad sin coste extra.
 *
 * Uso: node scripts/local-server.js
 * Variables: PORT, BIND_IP (opcional: ej. 192.168.1.10 para escuchar solo en esa interfaz).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const BIND_IP = process.env.BIND_IP || '0.0.0.0';
const ROOT = path.join(__dirname, '..');

const MAX_BODY_JSON = 1024 * 1024;
const RATE_WINDOW_MS = 60000;
const RATE_MAX_REQUESTS = 300;
const RATE_MAX_UPLOADS = 15;

const rooms = new Map();
const MAX_CARD_CONTENT = 500000;

const rateMap = new Map();
function getClientIP(req) {
  const raw = req.socket && req.socket.remoteAddress;
  return (raw || '').replace(/^::ffff:/, '') || 'unknown';
}
function checkRateLimit(ip, isUpload) {
  const now = Date.now();
  let r = rateMap.get(ip);
  if (!r || now > r.resetAt) {
    r = { count: 0, uploads: 0, resetAt: now + RATE_WINDOW_MS };
    rateMap.set(ip, r);
  }
  if (isUpload) {
    r.uploads++;
    if (r.uploads > RATE_MAX_UPLOADS) return false;
  } else {
    r.count++;
    if (r.count > RATE_MAX_REQUESTS) return false;
  }
  return true;
}

function validRoomId(id) {
  return typeof id === 'string' && /^SES-[A-Z0-9]{6}$/i.test(id.trim());
}
function validCardId(id) {
  return typeof id === 'string' && /^card-\d+$/.test(id.trim()) && id.length <= 32;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Archivo opcional para persistir (sobrevive reinicios)
const DATA_FILE = path.join(ROOT, 'data', 'local-cards.json');
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data.rooms) {
      data.rooms.forEach(function(r) {
        rooms.set(r.id, r.data);
      });
    }
  } catch (e) {}
}
function saveData() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = { rooms: Array.from(rooms.entries()).map(function(e) { return { id: e[0], data: e[1] }; }) };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {}
}
loadData();

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { cards: {}, presence: {} });
  return rooms.get(roomId);
}

function parseBody(req, maxBytes) {
  maxBytes = maxBytes || MAX_BODY_JSON;
  return new Promise(function(resolve) {
    let body = '';
    let overflow = false;
    req.on('data', function(chunk) {
      if (body.length + chunk.length > maxBytes) overflow = true;
      else body += chunk;
    });
    req.on('end', function() {
      if (overflow) { resolve(null); return; }
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); }
    });
  });
}

function send(res, status, obj) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, SECURITY_HEADERS);
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime'
};

const UPLOADS_DIR = path.join(ROOT, 'data', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const server = http.createServer(async function(req, res) {
  const url = req.url || '/';
  const pathname = url.split('?')[0];
  const clientIP = getClientIP(req);

  if (pathname === '/api/status') {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, SECURITY_HEADERS);
    res.writeHead(200, headers);
    res.end(JSON.stringify({ pizarron: true, local: true }));
    return;
  }

  if (!checkRateLimit(clientIP, false)) {
    send(res, 429, { error: 'Demasiadas peticiones. Espera un minuto.' });
    return;
  }

  const filesMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/files\/?$/);
  const fileServeMatch = pathname.match(/^\/api\/files\/([^/]+)\/([^/]+)$/);

  if (filesMatch && req.method === 'POST') {
    if (!checkRateLimit(clientIP, true)) {
      send(res, 429, { error: 'Límite de subidas por minuto. Espera un poco.' });
      return;
    }
    const roomId = decodeURIComponent(filesMatch[1]);
    if (!validRoomId(roomId)) {
      send(res, 400, { error: 'room_id no válido' });
      return;
    }
    const body = await parseBody(req, MAX_FILE_SIZE + 1024 * 1024);
    if (!body || typeof body !== 'object') {
      send(res, 400, { error: 'Cuerpo de petición demasiado grande o inválido' });
      return;
    }
    const dataUrl = body.content;
    const name = (body.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
      send(res, 400, { error: 'content (data URL) required' });
      return;
    }
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (buf.length > MAX_FILE_SIZE) {
      send(res, 400, { error: 'file too large' });
      return;
    }
    const ext = (path.extname(name) || '').toLowerCase() || '.bin';
    const safeExt = ['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.mp4','.webm','.ogg','.mov'].indexOf(ext) !== -1 ? ext : '.bin';
    const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 10) + safeExt;
    const dir = path.join(UPLOADS_DIR, roomId);
    const filePath = path.join(dir, filename);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, buf);
    } catch (e) {
      send(res, 500, { error: 'write failed' });
      return;
    }
    send(res, 200, { url: '/api/files/' + encodeURIComponent(roomId) + '/' + encodeURIComponent(filename) });
    return;
  }

  if (fileServeMatch && req.method === 'GET') {
    const roomId = decodeURIComponent(fileServeMatch[1]);
    const filename = decodeURIComponent(fileServeMatch[2]);
    if (!validRoomId(roomId)) {
      res.writeHead(400, SECURITY_HEADERS);
      res.end();
      return;
    }
    if (filename.indexOf('..') !== -1 || filename.indexOf('/') !== -1 || filename.length > 128) {
      res.writeHead(400, SECURITY_HEADERS);
      res.end();
      return;
    }
    const filePath = path.join(UPLOADS_DIR, roomId, filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, SECURITY_HEADERS);
      res.end();
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream' }, SECURITY_HEADERS));
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/cards\/?$/);
  const roomIdMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/cards\/([^/]+)$/);

  if (roomMatch && req.method === 'GET') {
    const roomId = decodeURIComponent(roomMatch[1]);
    if (!validRoomId(roomId)) {
      send(res, 400, { error: 'room_id no válido' });
      return;
    }
    const room = getRoom(roomId);
    const list = Object.keys(room.cards).map(function(cardId) {
      const c = room.cards[cardId];
      return {
        room_id: roomId,
        card_id: cardId,
        content: c.content,
        type: c.type,
        meta: c.meta || {},
        left_pos: c.left_pos,
        top_pos: c.top_pos
      };
    });
    send(res, 200, list);
    return;
  }

  if (roomMatch && req.method === 'POST') {
    const roomId = decodeURIComponent(roomMatch[1]);
    if (!validRoomId(roomId)) {
      send(res, 400, { error: 'room_id no válido' });
      return;
    }
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      send(res, 400, { error: 'Cuerpo de petición demasiado grande o inválido' });
      return;
    }
    const cardId = body.card_id;
    if (!cardId || !validCardId(cardId)) {
      send(res, 400, { error: 'card_id requerido y debe ser válido (card-N)' });
      return;
    }
    const room = getRoom(roomId);
    let content = body.content;
    if (typeof content === 'string' && content.length > MAX_CARD_CONTENT) {
      if (body.type === 'file') content = null;
      else content = content.substr(0, MAX_CARD_CONTENT) + '...[truncado]';
    }
    room.cards[cardId] = {
      room_id: roomId,
      card_id: cardId,
      content: content,
      type: body.type || 'code',
      meta: body.meta || {},
      left_pos: body.left_pos != null ? body.left_pos : 0,
      top_pos: body.top_pos != null ? body.top_pos : 0
    };
    saveData();
    broadcast(roomId, { type: 'card_added', card: room.cards[cardId] });
    send(res, 200, { ok: true });
    return;
  }

  if (roomIdMatch && (req.method === 'PATCH' || req.method === 'PUT')) {
    const roomId = decodeURIComponent(roomIdMatch[1]);
    const cardId = decodeURIComponent(roomIdMatch[2]);
    if (!validRoomId(roomId) || !validCardId(cardId)) {
      send(res, 400, { error: 'room_id o card_id no válidos' });
      return;
    }
    const body = await parseBody(req);
    const room = getRoom(roomId);
    if (!room.cards[cardId]) {
      send(res, 404, { error: 'card not found' });
      return;
    }
    if (body.left_pos != null) room.cards[cardId].left_pos = body.left_pos;
    if (body.top_pos != null) room.cards[cardId].top_pos = body.top_pos;
    saveData();
    broadcast(roomId, { type: 'card_moved', card_id: cardId, left_pos: room.cards[cardId].left_pos, top_pos: room.cards[cardId].top_pos });
    send(res, 200, { ok: true });
    return;
  }

  if (roomIdMatch && req.method === 'DELETE') {
    const roomId = decodeURIComponent(roomIdMatch[1]);
    const cardId = decodeURIComponent(roomIdMatch[2]);
    if (!validRoomId(roomId) || !validCardId(cardId)) {
      send(res, 400, { error: 'room_id o card_id no válidos' });
      return;
    }
    const room = getRoom(roomId);
    if (room.cards[cardId]) {
      delete room.cards[cardId];
      saveData();
      broadcast(roomId, { type: 'card_deleted', card_id: cardId });
    }
    send(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/presence' && req.method === 'POST') {
    const body = await parseBody(req);
    const roomId = (body && body.room_id) ? String(body.room_id).trim() : '';
    const userId = body && body.user_id;
    const user_name = body && body.user_name;
    if (!validRoomId(roomId) || !userId || typeof userId !== 'string') {
      send(res, 400, { error: 'room_id y user_id requeridos y válidos' });
      return;
    }
    const room = getRoom(roomId);
    room.presence[userId] = { user_name: user_name || 'Anónimo' };
    send(res, 200, { names: Object.values(room.presence).map(function(p) { return p.user_name; }) });
    return;
  }

  if (pathname === '/api/presence' && req.method === 'GET') {
    const roomId = (new URL(url, 'http://x').searchParams.get('room_id') || '').trim();
    if (!validRoomId(roomId)) {
      send(res, 400, { error: 'room_id requerido y válido' });
      return;
    }
    const room = getRoom(roomId);
    const names = Object.values(room.presence).map(function(p) { return p.user_name; });
    send(res, 200, { names: names });
    return;
  }

  let filePath = path.join(ROOT, pathname === '/' ? 'pizarron.html' : pathname);
  if (pathname === '/' || pathname === '') filePath = path.join(ROOT, 'pizarron.html');
  if (!path.extname(filePath)) filePath = path.join(ROOT, 'pizarron.html');
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(ROOT, 'pizarron.html');
  }
  const ext = path.extname(filePath);
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream' }, SECURITY_HEADERS));
  fs.createReadStream(filePath).pipe(res);
});

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

function broadcast(roomId, msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(function(client) {
    if (client.roomId === roomId && client.readyState === 1) {
      client.send(payload);
    }
  });
}

wss.on('connection', function(ws, req) {
  const params = new URLSearchParams((req.url || '').split('?')[1] || '');
  const roomId = (params.get('room') || '').trim();
  ws.roomId = validRoomId(roomId) ? roomId : '';
  ws.userId = (params.get('user') || '').slice(0, 64);
  ws.userName = (params.get('name') || 'Anónimo').slice(0, 80);
  if (ws.roomId) {
    const room = getRoom(ws.roomId);
    room.presence[ws.userId] = { user_name: ws.userName };
    broadcast(ws.roomId, { type: 'presence', names: Object.values(room.presence).map(function(p) { return p.user_name; }) });
  }
  ws.on('message', function() {});
  ws.on('close', function() {
    if (ws.roomId && ws.userId) {
      const room = getRoom(ws.roomId);
      delete room.presence[ws.userId];
      broadcast(ws.roomId, { type: 'presence', names: Object.values(room.presence).map(function(p) { return p.user_name; }) });
    }
  });
});

function getLocalIP() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

server.listen(PORT, BIND_IP, function() {
  const ip = BIND_IP !== '0.0.0.0' ? BIND_IP : getLocalIP();
  console.log('Pizarrón local (oficina): puerto ' + PORT + ', interfaz ' + BIND_IP);
  console.log('  Local:   http://localhost:' + PORT);
  if (ip && BIND_IP === '0.0.0.0') {
    console.log('  Red:     http://' + ip + ':' + PORT + '  (comparte con la misma WiFi)');
  } else if (BIND_IP !== '0.0.0.0') {
    console.log('  Red:     http://' + BIND_IP + ':' + PORT);
  }
}).on('error', function(err) {
  if (err.code === 'EADDRINUSE') {
    console.error('El puerto ' + PORT + ' está en uso. Cierra el otro proceso o usa otro puerto:');
    console.error('  Windows (PowerShell): $env:PORT=3001; npm run local');
    console.error('  Linux/Mac: PORT=3001 npm run local');
    process.exit(1);
  }
  throw err;
});
