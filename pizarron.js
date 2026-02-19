// Inicializar primero y exponer en window para todos los navegadores
if (typeof window !== 'undefined') {
  window.cards = window.cards || {};
  window.cardCounter = window.cardCounter || 0;
}
// Objeto que guarda todas las tarjetas por id
var cards = typeof window !== 'undefined' ? window.cards : {};
// Contador para generar ids unicos de tarjetas
var cardCounter = typeof window !== 'undefined' ? window.cardCounter : 0;

// Obtiene o crea la sesion actual usando la URL y localStorage
function getOrCreateSession() {
  var urlParams = new URLSearchParams(window.location.search);
  var urlSes = urlParams.get('session');
  if (urlSes) {
    var stored = JSON.parse(localStorage.getItem('pz_' + urlSes) || 'null');
    if (!stored) {
      var createdParam = urlParams.get('created');
      var createdAt = (createdParam && !isNaN(parseInt(createdParam, 10))) ? parseInt(createdParam, 10) : Date.now();
      stored = { id: urlSes, createdAt: createdAt, users: 0 };
    }
    stored.users = (stored.users || 0) + 1;
    localStorage.setItem('pz_' + urlSes, JSON.stringify(stored));
    return { id: stored.id, createdAt: stored.createdAt, users: stored.users, isJoining: true };
  }
  var curKey = localStorage.getItem('pz_current');
  if (curKey) {
    var stored = JSON.parse(localStorage.getItem('pz_' + curKey) || 'null');
    if (stored) return stored;
  }
  var id = 'SES-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  var data = { id: id, createdAt: Date.now(), users: 1 };
  localStorage.setItem('pz_' + id, JSON.stringify(data));
  localStorage.setItem('pz_current', id);
  return data;
}

var session = getOrCreateSession();
var SESSION_ID = session.id;
var SESSION_START = session.createdAt;
var totalUsers = session.users;

var sessionIdEl = document.getElementById('sessionId');
if (sessionIdEl) {
  sessionIdEl.textContent = SESSION_ID;
  sessionIdEl.title = 'Sala: ' + SESSION_ID + ' — Clic para copiar enlace';
  sessionIdEl.style.cursor = 'pointer';
  sessionIdEl.addEventListener('click', function() {
    var url = (location.origin || '') + (location.pathname || '/') + '?session=' + SESSION_ID + '&created=' + SESSION_START;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() { showToast('Enlace copiado'); }).catch(function() {});
    }
  });
}

// Supabase: tiempo real y presencia (opcional)
var supabaseClient = null;
var supabaseChannel = null;
var PRESENCE_USER_ID = 'pz-' + Math.random().toString(36).substr(2, 9);
var MAX_SYNC_CONTENT = 200000;

(function initSupabaseConfig() {
  if (typeof window === 'undefined') return;
  if (!window.PIZARRON_SUPABASE || !window.PIZARRON_SUPABASE.url) {
    var metaUrl = document.querySelector('meta[name="pizarron:supabase-url"]');
    var metaKey = document.querySelector('meta[name="pizarron:supabase-anonkey"]');
    if (metaUrl && metaKey && metaUrl.getAttribute('content') && metaKey.getAttribute('content')) {
      window.PIZARRON_SUPABASE = {
        url: metaUrl.getAttribute('content'),
        anonKey: metaKey.getAttribute('content')
      };
    }
  }
  if (window.PIZARRON_SUPABASE && window.PIZARRON_SUPABASE.url && window.PIZARRON_SUPABASE.anonKey && typeof window.supabase !== 'undefined') {
    try {
      supabaseClient = window.supabase.createClient(window.PIZARRON_SUPABASE.url, window.PIZARRON_SUPABASE.anonKey);
    } catch (e) {
      console.warn('Supabase init:', e);
    }
  }
})();

var PIZARRON_STORAGE_BUCKET = 'pizarron-files';
function uploadFileToStorage(file, onDone) {
  if (!supabaseClient || !file) { onDone(null); return; }
  var safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  var path = SESSION_ID + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '-' + safeName;
  supabaseClient.storage.from(PIZARRON_STORAGE_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  }).then(function(res) {
    if (res.error) { onDone(null); return; }
    var publicUrl = supabaseClient.storage.from(PIZARRON_STORAGE_BUCKET).getPublicUrl(res.data.path).data.publicUrl;
    onDone(publicUrl);
  }).catch(function() { onDone(null); });
}

var syncCardPositionToSupabase = function() {};
var syncCardToSupabase = function() {};

// Espacios o departamentos del pizarrón (General, Soporte, etc.)
const SPACES = {
  general: 'General',
  soporte: 'Soporte',
  desarrollo: 'Desarrollo',
  procesos: 'Procesos',
  infra: 'Infraestructura',
  bi: 'BI'
};
// Espacio actual segun la URL o general por defecto
let currentSpace = (function() {
  const p = new URLSearchParams(window.location.search).get('space');
  return (p && SPACES[p]) ? p : 'general';
})();

var PAD = 16;
const CARDS_STORAGE_KEY = 'pz_cards_' + SESSION_ID;
const MAX_STORED_FILE_SIZE = 800 * 1024;
const CELL_W = 280;
const CELL_H = 300;
const CARD_GAP = 12;

var clearedCardsBuffer = {};
function initClearedBuffer() {
  Object.keys(SPACES).forEach(s => { clearedCardsBuffer[s] = []; });
}
initClearedBuffer();

// Muestra u oculta el boton de restaurar segun si hay tarjetas borradas
function updateRestoreButtonVisibility() {
  const btn = document.getElementById('restoreBtn');
  const n = (clearedCardsBuffer[currentSpace] || []).length;
  btn.style.display = n > 0 ? '' : 'none';
}

// Cambia al espacio indicado, actualiza URL y vista
function switchSpace(space) {
  if (!SPACES[space]) return;
  currentSpace = space;
  var url = new URL(window.location.href);
  url.searchParams.set('space', space);
  window.history.replaceState({}, '', url);
  document.querySelectorAll('.sidebar-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.space === space);
  });
  var labelEl = document.getElementById('spaceLabel');
  if (labelEl) labelEl.textContent = SPACES[space];
  refreshSpaceVisibility();
  updateSpaceBadges();
  updateAccentFromBoard();
  updateRestoreButtonVisibility();
  showToast('Pizarrón: ' + SPACES[space]);
}

// Oculta tarjetas de otros espacios y muestra solo las del espacio actual
function refreshSpaceVisibility() {
  document.querySelectorAll('.card').forEach(el => {
    el.style.display = el.dataset.space === currentSpace ? '' : 'none';
  });
}

// Actualiza el numero en cada boton del sidebar (cantidad de tarjetas por espacio)
function updateSpaceBadges() {
  if (!cards) return;
  var counts = {};
  Object.keys(SPACES).forEach(function(s) { counts[s] = 0; });
  Object.keys(cards).forEach(function(id) {
    var s = (cards[id].meta && cards[id].meta.space) || cards[id].space || 'general';
    if (counts[s] !== undefined) counts[s]++;
  });
  document.querySelectorAll('.sidebar-btn').forEach(btn => {
    const s = btn.dataset.space;
    const n = counts[s] || 0;
    let bad = btn.querySelector('.badge');
    if (n > 0) {
      if (!bad) { bad = document.createElement('span'); bad.className = 'badge'; btn.appendChild(bad); }
      bad.textContent = n > 99 ? '99+' : n;
    } else if (bad) bad.remove();
  });
}

// Nombre de usuario guardado en localStorage y mostrado en la barra
const USERNAME_KEY = 'pz_username';
function getOrPromptUsername() {
  var name = (localStorage.getItem(USERNAME_KEY) || '').trim();
  if (!name || name === 'Anónimo') {
    name = (prompt('¿Cómo te llamas? (nombre o apodo para el pizarrón)') || '').trim().slice(0, 40);
    if (!name) name = 'Anónimo';
    localStorage.setItem(USERNAME_KEY, name);
    updateUsernameDisplay();
  }
  return name || 'Anónimo';
}
// Guarda el nuevo nombre y actualiza presencia en Supabase si esta activo
function setUsername(newName) {
  var n = (newName || '').trim().slice(0, 40) || 'Anónimo';
  localStorage.setItem(USERNAME_KEY, n);
  updateUsernameDisplay();
  if (supabaseChannel) {
    supabaseChannel.track({ user_id: PRESENCE_USER_ID, user_name: n });
    updatePresenceUI();
  }
}
function promptUsername() {
  var current = (localStorage.getItem(USERNAME_KEY) || 'Anónimo').trim() || '';
  if (current === 'Anónimo') current = '';
  var name = prompt('Tu nombre o apodo:', current);
  if (name !== null) setUsername(name);
}
function updateUsernameDisplay() {
  var el = document.getElementById('usernameDisplay');
  var editBtn = document.getElementById('usernameEditBtn');
  if (el) el.textContent = (localStorage.getItem(USERNAME_KEY) || 'Anónimo').trim() || 'Anónimo';
}
updateUsernameDisplay();
// Clic en el nombre o en "Editar" para cambiar
var usernameDisplayEl = document.getElementById('usernameDisplay');
if (usernameDisplayEl) {
  usernameDisplayEl.addEventListener('click', function() { promptUsername(); });
  usernameDisplayEl.setAttribute('role', 'button');
  usernameDisplayEl.setAttribute('tabindex', '0');
  usernameDisplayEl.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); promptUsername(); } });
}
var usernameEditBtn = document.getElementById('usernameEditBtn');
if (usernameEditBtn) usernameEditBtn.addEventListener('click', function(e) { e.stopPropagation(); promptUsername(); });
// Usuario nuevo: pedir nombre al cargar si nunca lo ha puesto
(function() {
  var stored = (localStorage.getItem(USERNAME_KEY) || '').trim();
  if (stored === '') {
    setTimeout(function() {
      var n = (prompt('Bienvenido al pizarrón. ¿Cómo te llamas? (nombre o apodo)') || '').trim().slice(0, 40);
      if (n) {
        localStorage.setItem(USERNAME_KEY, n);
      } else {
        localStorage.setItem(USERNAME_KEY, 'Anónimo');
      }
      updateUsernameDisplay();
    }, 400);
  }
})();

// Calcula el dia desde la creacion de la sesion (86400000 ms = 1 dia)
function updateDays() {
  const days = Math.max(1, Math.floor((Date.now() - SESSION_START) / 86400000) + 1);
  document.getElementById('daysBadge').textContent = `📅 día ${days}`;
}
updateDays();

// Muestra cantidad de usuarios: desde Supabase si hay canal, sino desde sesion local
function updateUserCount() {
  if (supabaseChannel) {
    updatePresenceUI();
    return;
  }
  var el = document.getElementById('userCount');
  if (el) el.textContent = totalUsers;
  var elLabel = document.getElementById('userCountLabel');
  if (elLabel) elLabel.textContent = 'en sesión';
  var listEl = document.getElementById('presenceUserList');
  if (listEl) listEl.innerHTML = '';
}
updateUserCount();

// Mascota pixel (GUSSI): canvas y contexto 2d
const BC = document.getElementById('bugCanvas');
const bx = BC.getContext('2d');
bx.imageSmoothingEnabled = false;

const GUSSI_STORAGE_KEY = 'pz_gussi_' + SESSION_ID;
function loadPetState() {
  try {
    const raw = localStorage.getItem(GUSSI_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { level: Math.min(10, Math.max(1, data.level || 1)), lastLevelUpDate: data.lastLevelUpDate || '' };
    }
  } catch (e) {}
  return { level: 1, lastLevelUpDate: '' };
}
function savePetState(level, lastLevelUpDate) {
  localStorage.setItem(GUSSI_STORAGE_KEY, JSON.stringify({ level, lastLevelUpDate }));
}
const petState = loadPetState();
let petLevel = petState.level;
let petMood  = 0;
let petFrame = 0;
let petWalkX = 0;
let petDir   = 1;
let lastTick = 0;
let petJump  = 0;
let petSleeping = false;
const INACTIVITY_MS = 22000;
let lastActivityTime = Date.now();

const P  = 5;
const CW = BC.width;
const CH = BC.height;

const COL = {
  b1: '#1a8fd9',  // body main
  b2: '#0d6bb8',  // body alt
  b3: '#5eb8ff',  // highlight
  leg:'#0a5a8a',
  eye:'#ffffff',
  pup:'#001a2e',
  ant:'#22aaff',
  wng:'rgba(34,170,255,0.25)',
  crw:'#ffcc00',
  glo:'rgba(34,170,255,0.15)',
};

// Dibuja un rectangulo de color en el canvas (bloque pixel)
function fp(x, y, w, h, color) {
  bx.fillStyle = color;
  bx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Dibuja la mascota segun nivel, frame de animacion y animo
function drawBug(lv, frame, mood) {
  bx.clearRect(0, 0, CW, CH);

  const segs    = Math.min(1 + Math.floor(lv / 2), 6);   // 1-6 segments
  const hasAnt  = lv >= 2;
  const twoEyes = lv >= 5;
  const hasWing = lv >= 8;
  const hasCrwn = lv >= 10;

  // total body width in pixels: head(2P) + segs(2P each)
  const totalW = (segs * 2 + 2) * P;
  const baseX  = Math.floor((CW - totalW) / 2) + petWalkX;
  const groundY = CH - P * 2;    // bottom ground line Y

  // body top Y
  const bodyY = groundY - P * 2;
  const headY = groundY - P * 3;

  // jump offset (parábola: máximo al inicio, 0 al final)
  const jumpFrames = 18;
  let jumpOffset = 0;
  if (petJump > 0) {
    const t = 1 - petJump / jumpFrames;
    jumpOffset = Math.max(0, 12 * Math.sin(t * Math.PI));
  }
  if (jumpOffset > 0) {
    bx.save();
    bx.translate(0, -jumpOffset);
  }

  // glow when mood > 0
  if (mood > 0.2) {
    bx.save();
    bx.shadowColor = '#22aaff';
    bx.shadowBlur  = 16 * mood;
  }

  // wings (drawn behind body)
  if (hasWing) {
    bx.save();
    bx.globalAlpha = 0.22 + Math.sin(frame * 0.4) * 0.08;
    const wX = baseX + segs * P;
    const wY = bodyY - P;
    bx.fillStyle = '#22aaff';
    bx.beginPath();
    bx.ellipse(wX - P*3, wY, P*4, P*2, -0.35, 0, Math.PI*2);
    bx.fill();
    bx.beginPath();
    bx.ellipse(wX + P*3 + P*2, wY, P*4, P*2, 0.35, 0, Math.PI*2);
    bx.fill();
    bx.restore();
  }

  // segments
  for (let s = 0; s < segs; s++) {
    const sx  = baseX + s * P * 2;
    const alt = s % 2 === 0;
    // main block
    fp(sx, bodyY, P*2, P*2, alt ? COL.b1 : COL.b2);
    // top highlight
    bx.globalAlpha = 0.35;
    fp(sx, bodyY, P*2, P, COL.b3);
    bx.globalAlpha = 1;
    // legs (walk offset every other frame)
    const lOff = (frame % 2 === 0 && alt) ? P*0.4 : 0;
    fp(sx - P,        groundY - P + lOff, P,   P*1.4, COL.leg);
    fp(sx + P*2,      groundY - P - lOff, P,   P*1.4, COL.leg);
  }

  // head block
  const hX = baseX + segs * P * 2;
  fp(hX, headY, P*2, P*3, COL.b1);
  // head highlight
  bx.globalAlpha = 0.4;
  fp(hX, headY, P*2, P, COL.b3);
  bx.globalAlpha = 1;

  // eyes (cerrados si duerme)
  const eyeSlots = twoEyes ? [0, P] : [P * 0.5];
  if (petSleeping) {
    eyeSlots.forEach(ey => {
      const ex = hX + P*0.4, eyY = headY + P*0.5 + ey;
      bx.strokeStyle = COL.pup;
      bx.lineWidth = 1.5;
      bx.beginPath();
      bx.moveTo(ex, eyY + P*0.5);
      bx.lineTo(ex + P, eyY + P*0.5);
      bx.stroke();
    });
  } else {
    eyeSlots.forEach(ey => {
      fp(hX + P*0.4, headY + P*0.5 + ey, P, P, COL.eye);
      const pupOff = petDir > 0 ? P*0.5 : 0;
      fp(hX + P*0.4 + pupOff, headY + P*0.5 + ey, P*0.5, P*0.5, COL.pup);
    });
  }

  // antennae
  if (hasAnt) {
    fp(hX,          headY - P,     P*0.5, P,     COL.ant);
    fp(hX - P*0.5,  headY - P*2,   P*0.5, P*0.5, COL.ant);
    fp(hX + P,      headY - P,     P*0.5, P,     COL.ant);
    fp(hX + P*1.5,  headY - P*2,   P*0.5, P*0.5, COL.ant);
  }

  // crown
  if (hasCrwn) {
    fp(hX,          headY - P*3,   P*0.5, P,     COL.crw);
    fp(hX + P*0.5,  headY - P*4,   P,     P*0.5, COL.crw);
    fp(hX + P*1.5,  headY - P*3,   P*0.5, P,     COL.crw);
  }

  // mood sparkles
  if (mood > 0.4) {
    bx.globalAlpha = mood;
    const sp1x = hX + P*3 + Math.sin(frame * 0.6) * P;
    const sp1y = headY - Math.cos(frame * 0.8) * P*2;
    fp(sp1x, sp1y, P*0.5, P*0.5, COL.ant);
    const sp2x = hX - P*2 + Math.sin(frame * 0.9 + 1) * P;
    const sp2y = headY + P - Math.cos(frame * 0.5 + 2) * P*2;
    fp(sp2x, sp2y, P*0.5, P*0.5, COL.ant);
    bx.globalAlpha = 1;
  }

  if (mood > 0.2) bx.restore();
  if (jumpOffset > 0) bx.restore();
}

// Animacion del bicho: actualiza posicion, sueño y dibuja cada cierto tiempo
function tickBug(ts) {
  if (ts - lastTick > 180) {
    petFrame++;
    lastTick = ts;

    if (petJump > 0) petJump--;

    petSleeping = (Date.now() - lastActivityTime > INACTIVITY_MS);
    const zzzEl = document.getElementById('petZzz');
    if (zzzEl) zzzEl.style.visibility = petSleeping ? 'visible' : 'hidden';

    // waddle left-right (pausado si duerme)
    if (!petSleeping) {
      petWalkX += petDir * 1.2;
      if (petWalkX > 18)  petDir = -1;
      if (petWalkX < -12) petDir =  1;
    }

    // decay mood
    if (petMood > 0) petMood = Math.max(0, petMood - 0.035);

    drawBug(petLevel, petFrame, petMood);
  }
  requestAnimationFrame(tickBug);
}
requestAnimationFrame(tickBug);

function updatePetLabel() {
  document.getElementById('petLvLabel').textContent = `lv.${petLevel}`;
}
updatePetLabel();

// Marca actividad para que la mascota no se duerma
function recordActivity() {
  lastActivityTime = Date.now();
}
document.addEventListener('mousemove', recordActivity);
document.addEventListener('keydown', recordActivity);
document.addEventListener('click', recordActivity);
document.addEventListener('paste', recordActivity);

// Saludo inicial: salto y burbuja de texto
function triggerPetGreeting() {
  if (typeof petJump !== 'undefined') petJump = 24;
  if (typeof petMood !== 'undefined') petMood = 1;
  var container = document.getElementById('petContainer');
  if (container) {
    var bubble = document.createElement('div');
    bubble.className = 'pet-greeting';
    bubble.textContent = '¡Hola! Soy GUSSI 👋';
    container.appendChild(bubble);
    setTimeout(function() {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 3000);
  }
}

// Animacion cuando el usuario pega algo
function triggerPetPasteAnimation() {
  if (typeof petJump !== 'undefined') petJump = 22;
  if (typeof petMood !== 'undefined') petMood = 0.95;
  var container = document.getElementById('petContainer');
  if (container) {
    var msg = document.createElement('div');
    msg.className = 'pet-paste-msg';
    msg.textContent = '✓';
    msg.style.color = 'var(--accent)';
    msg.style.fontWeight = '700';
    container.appendChild(msg);
    setTimeout(function() {
      if (msg.parentNode) msg.parentNode.removeChild(msg);
    }, 1100);
  }
}

// Sube nivel a la mascota y muestra mensaje flotante
function growPet(msg) {
  petMood = 1.0;
  if (petLevel < 10) petLevel++;
  updatePetLabel();
  savePetState(petLevel, getTodayDate());

  const pop = document.createElement('div');
  pop.className = 'grow-pop';
  pop.textContent = msg || '+1 nivel ✦';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1500);
}

function getTodayDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Sube de nivel solo al compartir y como maximo una vez por dia
function tryGrowPetFromShare() {
  if (petLevel >= 10) return;
  const today = getTodayDate();
  if (petState.lastLevelUpDate === today) return;
  petState.lastLevelUpDate = today;
  growPet('✦ compartiste → +1 nivel');
}

// Detecta el lenguaje del texto para colorear y etiquetar la tarjeta
function detectSyntax(text) {
  text = text.trim();
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER|DROP|FROM|WHERE|JOIN|GROUP BY|ORDER BY)\b/i.test(text))
    return { lang:'sql',  ext:'sql',  label:'SQL' };
  if (/<[A-Z][A-Za-z]*[\s/>]/.test(text) || /import React|from ['"]react['"]|useState|useEffect/.test(text))
    return { lang:'jsx',  ext:'jsx',  label:'JSX' };
  try { if (text.startsWith('{') || text.startsWith('[')) { JSON.parse(text); return { lang:'json', ext:'json', label:'JSON' }; } } catch(e) {}
  if (/\bdef \w+\(|import \w+|from \w+ import|\bclass \w+:|print\(/.test(text))
    return { lang:'py',   ext:'py',   label:'Python' };
  if (/[.#][\w-]+\s*\{|@media|@keyframes|:root/.test(text))
    return { lang:'css',  ext:'css',  label:'CSS' };
  if (/\bconst\b|\blet\b|\bvar\b|\bfunction\b|\bexport\b|\bimport\b|\b=>\b/.test(text))
    return { lang:'js',   ext:'js',   label:'JavaScript' };
  return { lang:'txt', ext:'txt', label:'Texto' };
}

function generateFilename(lang) {
  const adj = ['veloz','nuevo','temporal','draft','beta','rapido'][Math.floor(Math.random()*6)];
  return `un_coso_${adj}.${lang.ext}`;
}

switchSpace(currentSpace);

// Color del acento segun el lenguaje que mas tarjetas tenga en el espacio actual
const LANG_ACCENT = {
  sql: '#4488ff', jsx: '#22aaff', js: '#ffdc00', json: '#ff9632',
  py: '#64b4ff', css: '#c864ff', txt: '#555570', file: '#ff4466'
};
function getDominantLanguage() {
  if (!cards) return null;
  var count = {};
  Object.keys(cards).forEach(function(id) {
    var cardSpace = (cards[id].meta && cards[id].meta.space) || cards[id].space || 'general';
    if (cardSpace !== currentSpace) return;
    const lang = cards[id].type === 'file' ? 'file' : (cards[id].meta?.detected?.lang || 'txt');
    count[lang] = (count[lang] || 0) + 1;
  });
  let max = 0, dominant = null;
  Object.keys(count).forEach(lang => {
    if (count[lang] > max) { max = count[lang]; dominant = lang; }
  });
  return dominant;
}
function updateAccentFromBoard() {
  const lang = getDominantLanguage();
  const color = lang ? (LANG_ACCENT[lang] || '#22aaff') : '#22aaff';
  document.documentElement.style.setProperty('--accent', color);
}

// Ancho y alto disponibles para el lienzo
function getViewportSize() {
  return {
    vw: Math.max(200, window.innerWidth - 56),
    vh: Math.max(200, window.innerHeight - 52)
  };
}

// Celdas de la cuadricula que ya tienen una tarjeta
function getUsedGridCells() {
  const inner = document.getElementById('canvasInner');
  const used = new Set();
  const { vw } = getViewportSize();
  const maxCol = Math.max(1, Math.floor((vw - PAD * 2) / CELL_W));
  inner.querySelectorAll('.card').forEach(el => {
    if (el.dataset.space !== currentSpace) return;
    const l = parseInt(el.style.left, 10) || 0;
    const t = parseInt(el.style.top, 10) || 0;
    const col = Math.round((l - PAD) / CELL_W);
    const row = Math.round((t - PAD) / CELL_H);
    used.add(row + ',' + col);
  });
  return used;
}

// Devuelve la proxima posicion libre en la cuadricula o una aleatoria
function getNextGridPosition() {
  const { vw, vh } = getViewportSize();
  const maxCol = Math.max(1, Math.floor((vw - PAD * 2) / CELL_W));
  const maxRow = Math.max(1, Math.floor((vh - PAD * 2) / CELL_H));
  const used = getUsedGridCells();
  for (let row = 0; row < maxRow; row++) {
    for (let col = 0; col < maxCol; col++) {
      if (!used.has(row + ',' + col)) {
        const x = PAD + col * CELL_W + (Math.random() * 12 - 6);
        const y = PAD + row * CELL_H + (Math.random() * 12 - 6);
        return { x, y };
      }
    }
  }
  const x = PAD + (Math.random() * Math.max(0, vw - 320));
  const y = PAD + (Math.random() * Math.max(0, vh - 200));
  return { x, y };
}

// Guarda todas las tarjetas en localStorage para esta sesion
function saveCardsToStorage() {
  if (!cards) return;
  try {
    var list = [];
    Object.keys(cards).forEach(id => {
      const c = cards[id];
      const el = document.getElementById(id);
      const left = el ? (parseInt(el.style.left, 10) || 0) : 0;
      const top = el ? (parseInt(el.style.top, 10) || 0) : 0;
      let content = c.content;
      if (c.type === 'file' && typeof content === 'string' && content.length > MAX_STORED_FILE_SIZE)
        content = null;
      list.push({ id, content, type: c.type, meta: c.meta, left, top });
    });
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      try {
        const list = [];
        Object.keys(cards).forEach(id => {
          const c = cards[id];
          if (c.type !== 'code') return;
          const el = document.getElementById(id);
          const left = el ? (parseInt(el.style.left, 10) || 0) : 0;
          const top = el ? (parseInt(el.style.top, 10) || 0) : 0;
          list.push({ id, content: c.content, type: c.type, meta: c.meta, left, top });
        });
        localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(list));
      } catch (e2) {}
    }
  }
}

// Crea en el DOM una tarjeta a partir de un objeto guardado (carga o sync)
function appendCardFromItem(item) {
  var id = item.id;
  if (!id || typeof id !== 'string') return false;
  var inner = document.getElementById('canvasInner');
  if (!inner) return false;
  var num = parseInt(String(id).replace('card-', ''), 10);
  if (!isNaN(num) && num > cardCounter) cardCounter = num;
  cards[id] = { content: item.content, type: item.type || 'code', meta: item.meta || {} };
  var meta = cards[id].meta;
  meta.space = meta.space || 'general';
  cards[id].space = meta.space;
  var left = (item.left != null ? item.left : PAD) + 'px';
  var top = (item.top != null ? item.top : PAD) + 'px';
  var userNameEsc = esc(meta.userName || 'Anónimo');
  var createdAt = (meta.createdAt != null) ? meta.createdAt : new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  var header = '', body = '', footer = '';
  if (item.type === 'file') {
    var fnEsc = esc(meta.name || 'archivo');
    var fileContentOk = item.content && typeof item.content === 'string' && item.content.indexOf('...[truncado]') === -1;
    var isStorageUrl = fileContentOk && item.content.indexOf('http') === 0;
    var isImg = fileContentOk && (item.content.indexOf('data:image/') === 0 || (isStorageUrl && isImageExt(meta.ext)));
    var isVideo = fileContentOk && isStorageUrl && isVideoExt(meta.ext);
    header = '<span class="card-lang lang-file">ARCHIVO</span><span class="card-filename">' + fnEsc + '</span><div class="card-actions"><button class="card-btn" onclick="copyFileCard(\'' + id + '\')" title="Copiar nombre">⧉</button><button class="card-btn danger" onclick="removeCard(\'' + id + '\')" title="Eliminar">✕</button></div>';
    if (isImg) {
      body = '<div style="text-align:center;padding:8px 0"><img class="card-image-preview" alt=""/><div class="file-meta">' + fnEsc + '<br>' + formatSize(meta.size || 0) + ' · .' + (meta.ext || 'png').toUpperCase() + '</div></div>';
    } else if (isVideo) {
      body = '<div style="text-align:center;padding:8px 0"><video class="card-video-preview" controls playsinline></video><div class="file-meta">' + fnEsc + '<br>' + formatSize(meta.size || 0) + ' · .' + (meta.ext || '').toUpperCase() + '</div></div>';
    } else {
      body = '<div style="text-align:center;padding:8px 0"><span class="file-icon">' + getFileIcon(meta.ext) + '</span><div class="file-meta">' + fnEsc + '<br>' + formatSize(meta.size || 0) + ' · .' + (meta.ext || '').toUpperCase() + '</div></div>';
    }
    footer = fileContentOk
      ? '<span class="card-time">Por ' + userNameEsc + ' · ' + createdAt + '</span><button class="card-download" onclick="downloadFileCard(\'' + id + '\')">↓ descargar</button>'
      : '<span class="card-time">Por ' + userNameEsc + ' · ' + createdAt + '</span><span class="card-file-unavailable">Agregado en otro dispositivo. No descargable aquí.</span>';
  } else if (item.type === 'link') {
    var urlEsc = esc(item.content || '');
    var urlShort = (item.content && item.content.length > 50) ? item.content.substring(0, 47) + '...' : (item.content || '');
    header = '<span class="card-lang lang-txt">ENLACE</span><span class="card-filename">' + esc(urlShort) + '</span><div class="card-actions"><button class="card-btn" onclick="copyCard(\'' + id + '\')" title="Copiar enlace">⧉</button><button class="card-btn danger" onclick="removeCard(\'' + id + '\')" title="Eliminar">✕</button></div>';
    body = '<div class="card-link-body"><p class="card-link-url">' + urlEsc + '</p><button type="button" class="btn primary card-link-open" onclick="(function(){ var c = typeof cards !== \'undefined\' && cards[\'' + id + '\']; if (c && c.content && window.openLinkWithChoice) window.openLinkWithChoice(c.content); })()">🔗 Abrir enlace</button></div>';
    footer = '<span class="card-time">Por ' + userNameEsc + ' · ' + createdAt + '</span>';
  } else {
    var det = meta.detected || { lang: 'txt', label: 'Texto' };
    header = '<span class="card-lang lang-' + det.lang + '">' + det.label + '</span><span class="card-filename">' + esc(meta.filename || '') + '</span><div class="card-actions"><button class="card-btn" onclick="copyCard(\'' + id + '\')" title="Copiar">⧉</button><button class="card-btn danger" onclick="removeCard(\'' + id + '\')" title="Eliminar">✕</button></div>';
    body = '<pre>' + (item.content ? highlightCode(String(item.content), det.lang) : esc('')) + '</pre>';
    footer = '<span class="card-time">Por ' + userNameEsc + ' · ' + createdAt + '</span><button class="card-download" onclick="downloadCard(\'' + id + '\')">↓ descargar</button>';
  }
  var div = document.createElement('div');
  div.className = 'card';
  div.id = id;
  div.dataset.space = meta.space;
  div.style.left = left;
  div.style.top = top;
  div.style.display = meta.space === currentSpace ? '' : 'none';
  div.innerHTML = '<div class="card-header">' + header + '</div><div class="card-body">' + body + '</div><div class="card-footer">' + footer + '</div>';
  if (item.type === 'file' && item.content && typeof item.content === 'string' && item.content.indexOf('...[truncado]') === -1) {
    if (item.content.indexOf('data:image/') === 0 || (item.content.indexOf('http') === 0 && isImageExt(meta.ext))) {
      var imgEl = div.querySelector('.card-image-preview');
      if (imgEl) imgEl.src = item.content;
    } else if (item.content.indexOf('http') === 0 && isVideoExt(meta.ext)) {
      var videoEl = div.querySelector('.card-video-preview');
      if (videoEl) videoEl.src = item.content;
    }
  }
  inner.appendChild(div);
  makeDraggable(div, function(draggedId) {
    if (supabaseClient && typeof syncCardPositionToSupabase === 'function') syncCardPositionToSupabase(draggedId);
  });
  return true;
}

// Carga las tarjetas guardadas en localStorage al iniciar
function loadCardsFromStorage() {
  try {
    var raw = localStorage.getItem(CARDS_STORAGE_KEY);
    if (!raw) return false;
    var list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return false;
    var inner = document.getElementById('canvasInner');
    if (!inner) return false;
    var loaded = 0;
    for (var i = 0; i < list.length; i++) {
      try {
        if (appendCardFromItem(list[i])) loaded++;
      } catch (itemErr) {
        console.warn('Card load skip:', itemErr);
      }
    }
    if (loaded > 0) {
      updateSpaceBadges();
      updateAccentFromBoard();
      return true;
    }
    return false;
  } catch (e) {
    console.warn('loadCardsFromStorage:', e);
    return false;
  }
}

// Ordena las tarjetas del espacio actual en columnas por usuario
function organizeCardsInGrid() {
  const inner = document.getElementById('canvasInner');
  const cardEls = [...inner.querySelectorAll('.card')].filter(el => el.dataset.space === currentSpace);
  if (!cardEls.length) { showToast('No hay tarjetas que organizar'); return; }
  const { vw, vh } = getViewportSize();
  const byUser = {};
  cardEls.forEach(el => {
    const data = cards[el.id];
    const user = (data && data.meta && data.meta.userName) ? data.meta.userName : 'Anónimo';
    if (!byUser[user]) byUser[user] = [];
    byUser[user].push(el);
  });
  const users = Object.keys(byUser).sort();
  const numCols = Math.max(1, users.length);
  const colWidth = (vw - PAD * 2 - CARD_GAP * (numCols - 1)) / numCols;
  let maxBottom = 0;
  users.forEach((user, colIndex) => {
    const list = byUser[user];
    const x = PAD + colIndex * (colWidth + CARD_GAP);
    list.forEach((el, rowIndex) => {
      const y = PAD + rowIndex * (CELL_H + CARD_GAP);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.maxWidth = Math.max(200, colWidth) + 'px';
      maxBottom = Math.max(maxBottom, y + CELL_H);
    });
  });
  inner.style.minHeight = Math.max(vh, maxBottom + PAD * 2) + 'px';
  showToast('Tarjetas organizadas por usuario');
}

// Crea una tarjeta nueva en el lienzo (codigo, enlace o archivo)
function createCard(content, type, meta) {
  if (!meta) meta = {};
  if (!cards) cards = (typeof window !== 'undefined' && window.cards) ? window.cards : {};
  var inner = document.getElementById('canvasInner');
  if (!inner) return null;
  var id = 'card-' + (++cardCounter);
  var pos = getNextGridPosition();
  var x = pos.x, y = pos.y;

  const userName = meta.userName !== undefined ? meta.userName : getOrPromptUsername();
  meta.userName = userName;
  meta.space = meta.space || currentSpace;
  const userNameEsc = esc(userName);
  const spaceName = SPACES[meta.space] || 'General';

  const div = document.createElement('div');
  div.className = 'card';
  div.id = id;
  div.dataset.space = meta.space;
  div.style.left = x+'px';
  div.style.top  = y+'px';
  div.style.display = meta.space === currentSpace ? '' : 'none';

  const createdAt = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  meta.createdAt = createdAt;
  let header='', body='', footer='';

  if (type === 'code') {
    const {detected, filename} = meta;
    header = `
      <span class="card-lang lang-${detected.lang}">${detected.label}</span>
      <span class="card-filename">${esc(filename)}</span>
      <div class="card-actions">
        <button class="card-btn" onclick="copyCard('${id}')" title="Copiar">⧉</button>
        <button class="card-btn danger" onclick="removeCard('${id}')" title="Eliminar">✕</button>
      </div>`;
    body = `<pre>${highlightCode(content, detected.lang)}</pre>`;
    footer = `
      <span class="card-time">Por ${userNameEsc} · ${createdAt}</span>
      <button class="card-download" onclick="downloadCard('${id}')">↓ descargar</button>`;
  } else if (type === 'link') {
    var urlEsc = esc(content);
    var urlShort = content.length > 50 ? content.substring(0, 47) + '...' : content;
    header = `
      <span class="card-lang lang-txt">ENLACE</span>
      <span class="card-filename">${esc(urlShort)}</span>
      <div class="card-actions">
        <button class="card-btn" onclick="copyCard('${id}')" title="Copiar enlace">⧉</button>
        <button class="card-btn danger" onclick="removeCard('${id}')" title="Eliminar">✕</button>
      </div>`;
    body = `
      <div class="card-link-body">
        <p class="card-link-url">${urlEsc}</p>
        <button type="button" class="btn primary card-link-open" onclick="(function(){ var c = typeof cards !== 'undefined' && cards['${id}']; if (c && c.content && window.openLinkWithChoice) window.openLinkWithChoice(c.content); })()">🔗 Abrir enlace</button>
      </div>`;
    footer = `<span class="card-time">Por ${userNameEsc} · ${createdAt}</span>`;
  } else {
    const icon = getFileIcon(meta.ext);
    const fnEsc = esc(meta.name);
    var isImage = typeof content === 'string' && (content.indexOf('data:image/') === 0 || (content.indexOf('http') === 0 && isImageExt(meta.ext)));
    var isVideo = typeof content === 'string' && content.indexOf('http') === 0 && isVideoExt(meta.ext);
    header = `
      <span class="card-lang lang-file">ARCHIVO</span>
      <span class="card-filename">${fnEsc}</span>
      <div class="card-actions">
        <button class="card-btn" onclick="copyFileCard('${id}')" title="Copiar nombre">⧉</button>
        <button class="card-btn danger" onclick="removeCard('${id}')" title="Eliminar">✕</button>
      </div>`;
    if (isImage) {
      body = '<div style="text-align:center;padding:8px 0"><img class="card-image-preview" id="img-' + id + '" alt=""/><div class="file-meta">' + fnEsc + '<br>' + formatSize(meta.size) + ' · .' + (meta.ext || 'png').toUpperCase() + '</div></div>';
    } else if (isVideo) {
      body = '<div style="text-align:center;padding:8px 0"><video class="card-video-preview" controls playsinline></video><div class="file-meta">' + fnEsc + '<br>' + formatSize(meta.size) + ' · .' + (meta.ext || '').toUpperCase() + '</div></div>';
    } else {
      body = `
      <div style="text-align:center;padding:8px 0">
        <span class="file-icon">${icon}</span>
        <div class="file-meta">${fnEsc}<br>${formatSize(meta.size)} · .${(meta.ext||'').toUpperCase()}</div>
      </div>`;
    }
    footer = `
      <span class="card-time">Por ${userNameEsc} · ${createdAt}</span>
      <button class="card-download" onclick="downloadFileCard('${id}')">↓ descargar</button>`;
  }

  div.innerHTML = `
    <div class="card-header">${header}</div>
    <div class="card-body">${body}</div>
    <div class="card-footer">${footer}</div>`;

  if (type === 'file' && typeof content === 'string') {
    if (content.indexOf('data:image/') === 0 || (content.indexOf('http') === 0 && isImageExt(meta.ext))) {
      var imgEl = div.querySelector('.card-image-preview');
      if (imgEl) imgEl.src = content;
    } else if (content.indexOf('http') === 0 && isVideoExt(meta.ext)) {
      var videoEl = div.querySelector('.card-video-preview');
      if (videoEl) videoEl.src = content;
    }
  }
  inner.appendChild(div);
  makeDraggable(div, function(draggedId) {
    if (supabaseClient && typeof syncCardPositionToSupabase === 'function') syncCardPositionToSupabase(draggedId);
  });
  cards[id] = { content: content, type: type, meta: meta, space: meta.space };
  div.classList.add('card-pulse');
  setTimeout(function() { div.classList.remove('card-pulse'); }, 2200);
  updateSpaceBadges();
  updateAccentFromBoard();
  saveCardsToStorage();
  if (supabaseClient && typeof syncCardToSupabase === 'function') syncCardToSupabase(id);
  showToast(userName + ' agregó en ' + spaceName);
  return id;
}

// Aplica colores de sintaxis al codigo segun el lenguaje
function highlightCode(code, lang) {
  let h = esc(code);
  if (lang==='sql') {
    h = h.replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|INSERT INTO|VALUES|UPDATE|SET|DELETE|CREATE TABLE|ALTER TABLE|DROP|ADD|COLUMN|PRIMARY KEY|FOREIGN KEY|REFERENCES|NOT NULL|NULL|UNIQUE|DEFAULT|INDEX|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MAX|MIN)\b/gi,'<span class="kw">$1</span>');
    h = h.replace(/(['"])(.*?)\1/g,'<span class="str">$1$2$1</span>');
    h = h.replace(/--.*$/gm,'<span class="cmt">$&</span>');
    h = h.replace(/\b\d+\b/g,'<span class="num">$&</span>');
  } else if (lang==='jsx'||lang==='js') {
    h = h.replace(/\b(const|let|var|function|return|import|export|default|from|if|else|for|while|class|extends|new|this|async|await|try|catch|typeof|null|undefined|true|false)\b/g,'<span class="kw">$1</span>');
    h = h.replace(/(['"`])(.*?)\1/g,'<span class="str">$1$2$1</span>');
    h = h.replace(/\/\/.*/g,'<span class="cmt">$&</span>');
    h = h.replace(/\b\d+\b/g,'<span class="num">$&</span>');
  } else if (lang==='py') {
    h = h.replace(/\b(def|class|import|from|return|if|elif|else|for|while|in|not|and|or|True|False|None|with|as|try|except|finally|pass|break|continue|raise|lambda)\b/g,'<span class="kw">$1</span>');
    h = h.replace(/(['"])(.*?)\1/g,'<span class="str">$1$2$1</span>');
    h = h.replace(/#.*/g,'<span class="cmt">$&</span>');
    h = h.replace(/\b\d+\b/g,'<span class="num">$&</span>');
  }
  return h;
}

// Escapa HTML para mostrar texto sin ejecutar etiquetas
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getFileIcon(ext) {
  return {pdf:'📄',png:'🖼️',jpg:'🖼️',jpeg:'🖼️',mp4:'🎬',mp3:'🎵',zip:'📦',rar:'📦',xls:'📊',xlsx:'📊',doc:'📝',docx:'📝',csv:'📋',gif:'🎞️',svg:'🖌️',psd:'🎨'}[ext.toLowerCase()]||'📁';
}
function isImageExt(ext) {
  return ext && ['png','jpg','jpeg','gif','webp','bmp','svg'].indexOf(String(ext).toLowerCase()) !== -1;
}
function isVideoExt(ext) {
  return ext && ['mp4','webm','ogg','mov'].indexOf(String(ext).toLowerCase()) !== -1;
}
function formatSize(b) {
  if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';
}

// Elimina la tarjeta del DOM y de cards; en Supabase borra el registro
function removeCard(id) {
  var el = document.getElementById(id);
  if (el) {
    el.style.transition = 'all 0.2s';
    el.style.transform = 'scale(0.8)';
    el.style.opacity = '0';
    setTimeout(function() {
      el.remove();
      delete cards[id];
      updateSpaceBadges();
      updateAccentFromBoard();
      saveCardsToStorage();
      if (supabaseClient) {
        supabaseClient.from('pizarron_cards').delete().eq('room_id', SESSION_ID).eq('card_id', id).then(function() {});
      }
    }, 200);
  }
}
// Copia el contenido de la tarjeta al portapapeles
function copyCard(id) {
  const c = cards[id];
  if (!c || !c.content) return;
  const text = c.content;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('✓ Copiado')).catch(() => copyFallback(text));
  } else {
    copyFallback(text);
  }
}
// Copia texto al portapapeles cuando la API moderna no esta disponible
function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('✓ Copiado');
  } catch (e) {
    showToast('No se pudo copiar');
  }
  document.body.removeChild(ta);
}
// Descarga el contenido de una tarjeta de codigo como archivo
function downloadCard(id) {
  const c = cards[id];
  if (!c || c.type !== 'code') return;
  const fn = c.meta.filename || 'codigo.txt';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([c.content], { type: 'text/plain' }));
  a.download = fn;
  a.click();
  URL.revokeObjectURL(a.href);
  triggerCelebration();
  showToast('↓ ' + fn);
}
// Copia el nombre del archivo al portapapeles
function copyFileCard(id) {
  const c = cards[id];
  if (!c || c.type !== 'file') return;
  const text = c.meta.name || '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('✓ Nombre copiado')).catch(() => copyFallback(text));
  } else {
    copyFallback(text);
  }
}
// Descarga el archivo de la tarjeta (imagen, video u otro)
function downloadFileCard(id) {
  const c = cards[id];
  if (!c || c.type !== 'file') return;
  if (!c.content || (typeof c.content === 'string' && c.content.indexOf('...[truncado]') !== -1)) {
    showToast('Este archivo se agregó en otro dispositivo y no está disponible para descargar.');
    return;
  }
  const fn = c.meta.name || 'archivo';
  const isDataUrl = typeof c.content === 'string' && c.content.indexOf('data:') === 0;
  const isHttpUrl = typeof c.content === 'string' && (c.content.indexOf('http://') === 0 || c.content.indexOf('https://') === 0);
  if (isDataUrl) {
    fetch(c.content).then(function(res) { return res.blob(); }).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fn;
      a.click();
      URL.revokeObjectURL(url);
      triggerCelebration();
      showToast('↓ ' + fn);
    }).catch(function() {
      var a = document.createElement('a');
      a.href = c.content;
      a.download = fn;
      a.click();
      showToast('↓ ' + fn);
    });
  } else if (isHttpUrl) {
    fetch(c.content, { mode: 'cors' }).then(function(res) { return res.blob(); }).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fn;
      a.click();
      URL.revokeObjectURL(url);
      triggerCelebration();
      showToast('↓ ' + fn);
    }).catch(function() {
      var a = document.createElement('a');
      a.href = c.content;
      a.download = fn;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
      showToast('↓ ' + fn);
    });
  } else {
    var a = document.createElement('a');
    a.href = c.content;
    a.download = fn;
    a.click();
    triggerCelebration();
    showToast('↓ ' + fn);
  }
}
// Borra todas las tarjetas del espacio actual y las guarda para poder deshacer
function clearAll() {
  if (!cards) return;
  clearedCardsBuffer[currentSpace] = [];
  var buf = clearedCardsBuffer[currentSpace];
  var space = currentSpace;
  var idsToRemove = [];
  Object.keys(cards).forEach(function(id) {
    var cardSpace = (cards[id].meta && cards[id].meta.space) || cards[id].space || 'general';
    if (cardSpace === space) idsToRemove.push(id);
  });
  idsToRemove.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      buf.push({ id: id, el: el, data: Object.assign({}, cards[id], { space: (cards[id].meta && cards[id].meta.space) || 'general' }) });
      el.remove();
    }
    delete cards[id];
  });
  if (supabaseClient) {
    idsToRemove.forEach(function(id) {
      supabaseClient.from('pizarron_cards').delete().eq('room_id', SESSION_ID).eq('card_id', id).then(function() {});
    });
  }
  updateSpaceBadges();
  updateRestoreButtonVisibility();
  updateAccentFromBoard();
  saveCardsToStorage();
  if (buf.length > 0)
    showToastWithUndo('🗑 Pizarrón de ' + SPACES[currentSpace] + ' limpiado', restoreCleared);
  else
    showToast('No hay tarjetas en este pizarrón');
}

// Restaura las tarjetas que se borraron con Limpiar
function restoreCleared() {
  const buf = clearedCardsBuffer[currentSpace] || [];
  if (!buf.length) return;
  const inner = document.getElementById('canvasInner');
  buf.forEach(function(o) {
    var id = o.id, el = o.el, data = o.data;
    inner.appendChild(el);
    cards[id] = data;
    if (supabaseClient && typeof syncCardToSupabase === 'function') syncCardToSupabase(id);
  });
  clearedCardsBuffer[currentSpace] = [];
  refreshSpaceVisibility();
  updateSpaceBadges();
  updateAccentFromBoard();
  updateRestoreButtonVisibility();
  saveCardsToStorage();
  showToast('↩ Restaurado');
}

// Hace la tarjeta arrastrable con raton y tactil; al soltar llama onDragEnd
function makeDraggable(el, onDragEnd) {
  var sx, sy, ox, oy;
  function getXY(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }
  function start(e) {
    if (e.target.tagName === 'BUTTON') return;
    var xy = getXY(e);
    sx = xy.x; sy = xy.y;
    ox = parseInt(el.style.left, 10) || 0; oy = parseInt(el.style.top, 10) || 0;
    el.classList.add('dragging');
    function move(e2) {
      e2.preventDefault(); /* evita scroll de página mientras se arrastra */
      var xy2 = getXY(e2);
      el.style.left = (ox + xy2.x - sx) + 'px';
      el.style.top = (oy + xy2.y - sy) + 'px';
    }
    function up() {
      el.classList.remove('dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move, { passive: false });
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
      if (typeof onDragEnd === 'function') onDragEnd(el.id);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
  }
  el.addEventListener('mousedown', start);
  el.addEventListener('touchstart', start, { passive: false });
}

// Zona de arrastrar y soltar archivos y selector de archivos
var canvasEl = document.getElementById('canvas');
var dropOv   = document.getElementById('dropOverlay');
const textExts = ['sql','jsx','js','ts','tsx','py','css','html','json','txt','md','xml','yaml','yml','sh','rb','go','rs','php','c','cpp','java'];

if (canvasEl && dropOv) {
  canvasEl.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropOv.classList.add('active');
  });
  canvasEl.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dropOv.classList.remove('active');
  });
  canvasEl.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dropOv.classList.remove('active');
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) {
      for (var i = 0; i < files.length; i++) addFileToBoard(files[i]);
      if (files.length > 1) showToast(files.length + ' archivos agregados');
    }
  });
}

// Menu al clic derecho en el lienzo: Pegar y Subir archivo
if (canvasEl) {
  canvasEl.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    var menu = document.getElementById('pizarronContextMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'pizarronContextMenu';
      menu.style.cssText = 'position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px 0;min-width:180px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.4);display:none;';
      menu.innerHTML = '<button type="button" class="ctx-item" data-action="paste" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:transparent;color:var(--text);font-family:Space Mono,monospace;font-size:12px;cursor:pointer;">📋 Pegar (Ctrl+V)</button><button type="button" class="ctx-item" data-action="upload" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:transparent;color:var(--text);font-family:Space Mono,monospace;font-size:12px;cursor:pointer;">📁 Subir archivo...</button>';
      menu.querySelectorAll('.ctx-item').forEach(function(btn) {
        btn.addEventListener('mouseenter', function() { this.style.background = 'var(--border)'; });
        btn.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
        btn.addEventListener('click', function() {
          menu.style.display = 'none';
          if (this.dataset.action === 'paste') pasteFromClipboard();
          else openFilePicker();
        });
      });
      document.body.appendChild(menu);
    }
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.display = 'block';
    setTimeout(function() {
      document.addEventListener('click', function hideMenu() {
        menu.style.display = 'none';
        document.removeEventListener('click', hideMenu);
      });
    }, 0);
  });
}

// Agrega un archivo al pizarron: si es texto/codigo crea tarjeta de codigo, sino de archivo
function addFileToBoard(file) {
  if (!file || !file.name) return;
  try {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (textExts.indexOf(ext) !== -1) {
      var r = new FileReader();
      r.onload = function(ev) {
        try {
          var content = ev.target.result;
          var detected = (['sql','jsx','js','ts','tsx','py','css','json'].indexOf(ext) !== -1)
            ? { lang: ext === 'ts' || ext === 'tsx' ? 'jsx' : ext, ext: ext, label: ext.toUpperCase() }
            : detectSyntax(content);
          createCard(content, 'code', { detected: detected, filename: file.name });
          tryGrowPetFromShare();
          saveCardsToStorage();
          showToast('✓ ' + file.name);
        } catch (err) {
          console.warn(err);
          showToast('Error al agregar ' + file.name);
        }
      };
      r.onerror = function() { showToast('No se pudo leer ' + file.name); };
      r.readAsText(file);
    } else {
      var isImageOrVideo = file.type && (file.type.indexOf('image/') === 0 || file.type.indexOf('video/') === 0);
      if (supabaseClient && isImageOrVideo) {
        uploadFileToStorage(file, function(publicUrl) {
          if (publicUrl) {
            try {
              createCard(publicUrl, 'file', { name: file.name, ext: ext, size: file.size, storageUrl: true });
              tryGrowPetFromShare();
              saveCardsToStorage();
              showToast('✓ ' + file.name + ' (otros podrán descargarlo)');
            } catch (err) {
              console.warn(err);
              showToast('Error al agregar ' + file.name);
            }
          } else {
            var fr = new FileReader();
            fr.onload = function(ev) {
              try {
                createCard(ev.target.result, 'file', { name: file.name, ext: ext, size: file.size });
                tryGrowPetFromShare();
                saveCardsToStorage();
                showToast('📁 ' + file.name);
              } catch (err) { console.warn(err); showToast('Error al agregar ' + file.name); }
            };
            fr.onerror = function() { showToast('No se pudo leer ' + file.name); };
            fr.readAsDataURL(file);
          }
        });
      } else {
        var fr = new FileReader();
        fr.onload = function(ev) {
          try {
            createCard(ev.target.result, 'file', { name: file.name, ext: ext, size: file.size });
            tryGrowPetFromShare();
            saveCardsToStorage();
            showToast('📁 ' + file.name);
          } catch (err) {
            console.warn(err);
            showToast('Error al agregar ' + file.name);
          }
        };
        fr.onerror = function() { showToast('No se pudo leer ' + file.name); };
        fr.readAsDataURL(file);
      }
    }
  } catch (err) {
    console.warn(err);
    showToast('Error al procesar el archivo');
  }
}

// Abre el selector de archivos del sistema
function openFilePicker() {
  document.getElementById('fileInput').click();
}
var fileInputEl = document.getElementById('fileInput');
if (fileInputEl) {
  fileInputEl.addEventListener('change', function() {
    var files = this.files;
    if (!files || !files.length) return;
    try {
      for (var i = 0; i < files.length; i++) addFileToBoard(files[i]);
      if (files.length > 1) showToast(files.length + ' archivos agregados al pizarrón');
    } catch (err) {
      showToast('Error al subir archivos');
    }
    this.value = '';
  });
}

// Lee el portapapeles y crea una tarjeta; si no hay API abre el prompt de texto
function pasteFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    openTextInput();
    return;
  }
  navigator.clipboard.readText().then(function(text) {
    if (!text || !text.trim()) { showToast('El portapapeles está vacío'); return; }
    lastActivityTime = Date.now();
    triggerPetPasteAnimation();
    try {
      const detected = detectSyntax(text);
      const filename = generateFilename(detected);
      createCard(text, 'code', { detected: detected, filename: filename });
      tryGrowPetFromShare();
      saveCardsToStorage();
      showToast('✓ ' + detected.label + ' → ' + filename);
    } catch (err) {
      console.warn(err);
      showToast('Error al crear la tarjeta');
    }
  }).catch(function() {
    openTextInput();
  });
}

document.addEventListener('paste', function(e) {
  try {
    const dt = e.clipboardData;
    if (!dt) return;
    const items = dt.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.indexOf('image/') === 0) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            var ext = (file.name || '').split('.').pop() || 'png';
            if (supabaseClient) {
              uploadFileToStorage(file, function(publicUrl) {
                if (publicUrl) {
                  try {
                    triggerPetPasteAnimation();
                    createCard(publicUrl, 'file', { name: file.name || 'imagen.png', ext: ext, size: file.size, storageUrl: true });
                    tryGrowPetFromShare();
                    saveCardsToStorage();
                    showToast('📁 Imagen pegada (otros podrán descargarla)');
                  } catch (err) { showToast('Error al pegar imagen'); }
                } else {
                  var fr = new FileReader();
                  fr.onload = function(ev) {
                    try {
                      triggerPetPasteAnimation();
                      createCard(ev.target.result, 'file', { name: file.name || 'imagen.png', ext: ext, size: file.size });
                      tryGrowPetFromShare();
                      saveCardsToStorage();
                      showToast('📁 Imagen pegada');
                    } catch (err) { showToast('Error al pegar imagen'); }
                  };
                  fr.readAsDataURL(file);
                }
              });
            } else {
              const fr = new FileReader();
              fr.onload = function(ev) {
                try {
                  triggerPetPasteAnimation();
                  createCard(ev.target.result, 'file', { name: file.name || 'imagen.png', ext: ext, size: file.size });
                  tryGrowPetFromShare();
                  saveCardsToStorage();
                  showToast('📁 Imagen pegada');
                } catch (err) { showToast('Error al pegar imagen'); }
              };
              fr.readAsDataURL(file);
            }
            return;
          }
        }
      }
    }
    const text = dt.getData('text/plain') || dt.getData('text') || '';
    if (text.trim()) {
      e.preventDefault();
      lastActivityTime = Date.now();
      triggerPetPasteAnimation();
      var trimmed = text.trim();
      var singleLine = trimmed.split(/\r?\n/).length === 1;
      var looksLikeUrl = /^https?:\/\/\S+$/i.test(trimmed);
      if (singleLine && looksLikeUrl) {
        createCard(trimmed, 'link', { url: trimmed });
        tryGrowPetFromShare();
        saveCardsToStorage();
        showToast('🔗 Enlace agregado. Clic para abrirlo.');
      } else {
        try {
          const detected = detectSyntax(text);
          const filename = generateFilename(detected);
          createCard(text, 'code', { detected: detected, filename: filename });
          tryGrowPetFromShare();
          saveCardsToStorage();
          showToast('✓ ' + detected.label + ' → ' + filename);
        } catch (err) {
          console.warn(err);
          showToast('Error al pegar. Usa el botón Pegar.');
        }
      }
    }
  } catch (err) {
    console.warn('Paste error:', err);
    showToast('No se pudo pegar. Usa el botón Pegar o +.');
  }
  }, true);

// Abre un cuadro para pegar texto manualmente cuando no hay portapapeles
function openTextInput() {
  const text=prompt('Pega tu código aquí:');
  if(text&&text.trim()){
    const detected=detectSyntax(text);
    const filename=generateFilename(detected);
    createCard(text,'code',{detected,filename});
    tryGrowPetFromShare();
    showToast(`✓ ${detected.label} → ${filename}`);
  }
}

// Abre el manual de ayuda con el nombre del usuario
function openManual() {
  const name = (localStorage.getItem(USERNAME_KEY) || 'Usuario').trim() || 'Usuario';
  const el = document.getElementById('manualUserName');
  if (el) el.textContent = name;
  document.getElementById('manualOverlay').classList.add('open');
  recordActivity();
}
function closeManual() {
  document.getElementById('manualOverlay').classList.remove('open');
}
function closeManualIfBackdrop(e) {
  if (e.target.id === 'manualOverlay') closeManual();
}

// Copia el enlace de la sesion al portapapeles para compartir
function shareSession() {
  var url = (location.origin || '') + (location.pathname || '/') + '?session=' + SESSION_ID + '&created=' + SESSION_START;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function() {
      showToast('🔗 Enlace copiado. Quien abra ese enlace verá en vivo lo que se pegue aquí.');
    }).catch(function() { copyFallback(url); showToast('🔗 Enlace copiado'); });
  } else {
    copyFallback(url);
    showToast('🔗 Enlace copiado. Pásalo para que otros vean en vivo.');
  }
}

// Muestra un modal para abrir el enlace en nueva pestaña o copiarlo
var linkModalCurrentUrl = '';
function openLinkWithChoice(url) {
  if (!url || typeof url !== 'string') return;
  linkModalCurrentUrl = url.trim();
  var overlay = document.getElementById('linkModalOverlay');
  var urlEl = document.getElementById('linkModalUrl');
  if (urlEl) urlEl.textContent = linkModalCurrentUrl.length > 80 ? linkModalCurrentUrl.substring(0, 77) + '...' : linkModalCurrentUrl;
  if (overlay) overlay.style.display = 'flex';
  function closeModal() {
    if (overlay) overlay.style.display = 'none';
    linkModalCurrentUrl = '';
  }
  var openBtn = document.getElementById('linkModalOpenBtn');
  var copyBtn = document.getElementById('linkModalCopyBtn');
  var closeBtn = document.getElementById('linkModalCloseBtn');
  if (openBtn) openBtn.onclick = function() {
    if (linkModalCurrentUrl) window.open(linkModalCurrentUrl, '_blank', 'noopener');
    closeModal();
  };
  if (copyBtn) copyBtn.onclick = function() {
    if (linkModalCurrentUrl && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(linkModalCurrentUrl).then(function() { showToast('Enlace copiado'); }).catch(function() {});
    } else if (linkModalCurrentUrl) copyFallback(linkModalCurrentUrl);
    closeModal();
  };
  if (closeBtn) closeBtn.onclick = closeModal;
}
if (typeof window !== 'undefined') window.openLinkWithChoice = openLinkWithChoice;

// Confetti al descargar algo
function triggerCelebration() {
  const colors = ['#22aaff', '#ff4466', '#4488ff', '#ffdc00', '#ff9632', '#c864ff', '#64b4ff'];
  const count = 28;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'celebration-confetti';
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 80 + Math.random() * 100;
    el.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    el.style.setProperty('--dy', -60 - Math.random() * 80 + 'px');
    el.style.background = colors[i % colors.length];
    el.style.animationDelay = (i * 0.02) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
}

// Muestra un mensaje temporal en la parte inferior
function showToast(msg, dur=3000) {
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.innerHTML='';
  t.appendChild(document.createTextNode(msg));
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}
// Toast con boton Deshacer que ejecuta onUndo al hacer clic
function showToastWithUndo(msg, onUndo, dur=6000) {
  const t=document.getElementById('toast');
  t.innerHTML='';
  t.appendChild(document.createTextNode(msg + ' '));
  const btn=document.createElement('button');
  btn.className='btn';
  btn.style.cssText='padding:4px 10px;font-size:11px;margin-left:8px;';
  btn.textContent='Deshacer';
  btn.onclick=()=>{ t.classList.remove('show'); onUndo(); };
  t.appendChild(btn);
  t.classList.add('show');
  setTimeout(()=>{ t.classList.remove('show'); t.innerHTML=''; }, dur);
}

// Muestra u oculta el indicador de conexion en vivo
function setLiveIndicator(connected) {
  var el = document.getElementById('liveIndicator');
  var sep = document.getElementById('liveSep');
  if (el) el.style.display = connected ? '' : 'none';
  if (sep) sep.style.display = connected ? '' : 'none';
}

// Actualiza la lista de usuarios en linea desde el estado de presencia de Supabase
function updatePresenceUI() {
  var elCount = document.getElementById('userCount');
  var elLabel = document.getElementById('userCountLabel');
  var listEl = document.getElementById('presenceUserList');
  if (!supabaseChannel) {
    setLiveIndicator(false);
    if (elCount) elCount.textContent = totalUsers;
    if (elLabel) elLabel.textContent = 'en sesión';
    if (listEl) listEl.innerHTML = '';
    return;
  }
  var state = supabaseChannel.presenceState();
  var names = [];
  Object.keys(state).forEach(function(key) {
    (state[key] || []).forEach(function(p) {
      if (p.user_name) names.push(p.user_name);
    });
  });
  names = names.filter(function(n, i, a) { return a.indexOf(n) === i; });
  var n = names.length;
  if (elCount) elCount.textContent = n || '0';
  if (elLabel) elLabel.textContent = n === 1 ? 'en sesión' : 'en sesión';
  if (listEl) {
    listEl.innerHTML = '';
    names.forEach(function(name) {
      var li = document.createElement('li');
      li.className = 'presence-user-item';
      li.innerHTML = '<span class="presence-user-icon" aria-hidden="true">👤</span><span class="presence-user-name">' + esc(name) + '</span>';
      listEl.appendChild(li);
    });
  }
}

// Aplica una tarjeta recibida por Supabase Realtime al lienzo local
function applyCardFromRemote(row) {
  if (!row || !row.card_id) return;
  if (cards[row.card_id]) return;
  var item = {
    id: row.card_id,
    content: row.content,
    type: row.type || 'code',
    meta: row.meta || {},
    left: row.left_pos != null ? row.left_pos : PAD,
    top: row.top_pos != null ? row.top_pos : PAD
  };
  appendCardFromItem(item);
  updateSpaceBadges();
  updateAccentFromBoard();
  saveCardsToStorage();
  showToast('✓ Tarjeta recibida en vivo', 2000);
}

// Carga todas las tarjetas de la sala desde Supabase y las dibuja
function loadCardsFromSupabase() {
  var inner = document.getElementById('canvasInner');
  if (!inner || !supabaseClient) return Promise.resolve();
  return supabaseClient.from('pizarron_cards').select('*').eq('room_id', SESSION_ID).then(function(res) {
    if (res.error) {
      console.warn('Supabase fetch:', res.error);
      return;
    }
    var list = res.data || [];
    var id;
    for (id in cards) { if (cards.hasOwnProperty(id)) delete cards[id]; }
    inner.innerHTML = '';
    list.forEach(function(row) {
      applyCardFromRemote(row);
    });
    updateSpaceBadges();
    updateAccentFromBoard();
  });
}

// Conecta al canal de Supabase: presencia y cambios en la tabla de tarjetas
function initSupabaseRealtime() {
  if (!supabaseClient) return;
  var channelName = 'room-' + SESSION_ID.replace(/[^a-zA-Z0-9-_]/g, '-');
  var roomId = SESSION_ID;

  supabaseChannel = supabaseClient.channel(channelName)
    .on('presence', { event: 'sync' }, updatePresenceUI)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'pizarron_cards'
    }, function(payload) {
      if (!payload || !payload.new) return;
      var r = payload.new;
      if (String(r.room_id || '').trim() !== String(roomId || '').trim()) return;
      applyCardFromRemote(r);
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'pizarron_cards'
    }, function(payload) {
      if (!payload || !payload.new) return;
      if (String(payload.new.room_id || '').trim() !== String(roomId || '').trim()) return;
      var id = payload.new.card_id;
      var el = document.getElementById(id);
      if (el) {
        el.style.left = (payload.new.left_pos != null ? payload.new.left_pos : 0) + 'px';
        el.style.top = (payload.new.top_pos != null ? payload.new.top_pos : 0) + 'px';
      }
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'pizarron_cards'
    }, function(payload) {
      if (!payload || !payload.old) return;
      if (String(payload.old.room_id || '').trim() !== String(roomId || '').trim()) return;
      var id = payload.old.card_id;
      var el = document.getElementById(id);
      if (el) { el.remove(); }
      delete cards[id];
      updateSpaceBadges();
      updateAccentFromBoard();
      saveCardsToStorage();
    })
    .subscribe(function(status) {
      if (status === 'SUBSCRIBED') {
        supabaseChannel.track({
          user_id: PRESENCE_USER_ID,
          user_name: getOrPromptUsername()
        });
        loadCardsFromSupabase().then(function() {
          updatePresenceUI();
          setLiveIndicator(true);
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setLiveIndicator(false);
        console.warn('Supabase Realtime:', status);
      }
    });

  syncCardToSupabase = function(id) {
    if (!supabaseClient || !cards[id]) return;
    var el = document.getElementById(id);
    var leftPos = el ? (parseInt(el.style.left, 10) || 0) : 0;
    var topPos = el ? (parseInt(el.style.top, 10) || 0) : 0;
    var content = cards[id].content;
    var meta = Object.assign({}, cards[id].meta || {});
    if (cards[id].type === 'file' && typeof content === 'string' && content.length > MAX_SYNC_CONTENT) {
      content = null;
      meta.remoteOnly = true;
    } else if (typeof content === 'string' && content.length > MAX_SYNC_CONTENT) {
      content = content.substr(0, MAX_SYNC_CONTENT) + '...[truncado]';
    }
    supabaseClient.from('pizarron_cards').upsert({
      room_id: SESSION_ID,
      card_id: id,
      content: content,
      type: cards[id].type,
      meta: meta,
      left_pos: leftPos,
      top_pos: topPos
    }, { onConflict: 'room_id,card_id' }).then(function(r) {
      if (r.error) console.warn('Supabase sync card:', r.error);
    }).catch(function(e) {
      console.warn('Supabase sync error:', e);
    });
  };

  syncCardPositionToSupabase = function(id) {
    if (!supabaseClient) return;
    var el = document.getElementById(id);
    if (!el) return;
    var leftPos = parseInt(el.style.left, 10) || 0;
    var topPos = parseInt(el.style.top, 10) || 0;
    supabaseClient.from('pizarron_cards').update({ left_pos: leftPos, top_pos: topPos })
      .eq('room_id', SESSION_ID).eq('card_id', id).then(function() {});
  };
}

// Mensaje al unirse por enlace compartido
if (session.isJoining) {
  setTimeout(function() {
    showToast('✓ Sala compartida. Verás en vivo lo que cualquiera pegue aquí.');
    updateUserCount();
    triggerPetGreeting();
  }, 600);
} else {
  setTimeout(function() {
    if (supabaseClient) {
      showToast('Usa «Compartir» y abre ese enlace en otros navegadores para ver en vivo.');
    } else if (location.hostname && location.hostname !== 'localhost' && location.protocol !== 'file:') {
      showToast('Tiempo real: configura SUPABASE_URL y SUPABASE_ANON_KEY en Netlify.', 5000);
    }
  }, 1500);
}

// Inicializa tarjetas: con Supabase usa tiempo real, sino carga desde localStorage
function initCards() {
  var inner = document.getElementById('canvasInner');
  if (!inner) {
    setTimeout(initCards, 50);
    return;
  }
  if (supabaseClient) {
    initSupabaseRealtime();
    return;
  }
  loadCardsFromStorage();
  setTimeout(updateAccentFromBoard, 100);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    if (supabaseClient) {
      initSupabaseRealtime();
    } else {
      initCards();
    }
  });
} else {
  if (supabaseClient) {
    initSupabaseRealtime();
  } else {
    initCards();
  }
}
