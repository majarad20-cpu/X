'use strict';

// ---------- Almacenamiento ----------
const STORE_KEY = 'enfoque:v1';

const defaults = () => ({
  tasks: [],
  habits: [],
  settings: { focus: 25, short: 5, long: 15, sort: 'priority', accent: 'indigo' },
  pomodoros: {}, // { 'YYYY-MM-DD': n }
  focusMinutes: {}, // { 'YYYY-MM-DD': minutos de enfoque completados }
  completions: {}, // { 'YYYY-MM-DD': tareas completadas ese día }
  projects: [],
  journal: [], // entradas del diario
  ideas: [], // notas de ideas
  maps: [], // mapas mentales
  canvases: [], // lienzos: tarjetas y flechas en un espacio infinito
  archive: [], // tareas completadas hace más de una semana
  log: [], // bitácora: hitos de cada día
  notes: [], // notas en Markdown: { id, path: 'Carpeta/Título', body }
  folders: [], // carpetas de notas (también las vacías)
  updatedAt: 0, // última modificación local
  syncMeta: { sent: {}, times: {} }, // estado de la sincronización por bloques (solo de este dispositivo)
});

// Datos del usuario (lo que se sincroniza, se exporta y se puede deshacer).
const CORE_KEYS = ['tasks', 'habits', 'settings', 'pomodoros', 'focusMinutes', 'completions', 'projects', 'folders'];
const DATA_KEYS = [...CORE_KEYS, 'journal', 'ideas', 'maps', 'archive', 'log', 'notes', 'canvases'];

// Datos guardados → estado completo, con los valores por defecto de lo que falte.
function normalize(data) {
  // Datos de versiones anteriores: reconstruye el historial de completadas con lo que haya.
  if (!data.completions) {
    data.completions = {};
    for (const t of data.tasks || []) {
      if (t.done && t.completedAt) {
        const key = dateKey(new Date(t.completedAt));
        data.completions[key] = (data.completions[key] || 0) + 1;
      }
    }
  }
  const fresh = defaults();
  return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings }, syncMeta: { ...fresh.syncMeta, ...data.syncMeta } };
}

// Primera carga, síncrona: la copia rápida del navegador (localStorage). La copia completa está
// en IndexedDB, que no tiene el límite de unos 5 MB; se lee al arrancar (loadFromDB) y, si es
// más reciente, sustituye a esta.
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

// ---------- IndexedDB ----------
const idb = { db: null, ok: false, timer: null, dirty: false, quota: 0, usage: 0, persisted: false, lsFits: true };

function idbOpen() {
  return new Promise((resolve) => {
    // Si el navegador no responde, se sigue sin IndexedDB (con localStorage) en vez de esperar.
    setTimeout(() => resolve(null), 3000);
    try {
      // Versión 2: almacén «files» (imágenes de las notas); 3: «history» (versiones de las notas).
      const req = indexedDB.open('enfoque', 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'noteId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGet(key) {
  return new Promise((resolve) => {
    try {
      const req = idb.db.transaction('kv').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function idbPut(key, value) {
  return new Promise((resolve) => {
    try {
      const tx = idb.db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

// Al arrancar: abre IndexedDB y usa su copia si es más reciente que la de localStorage
// (o si localStorage ya no podía guardarlo todo). Devuelve true si cambió el estado.
async function loadFromDB() {
  idb.db = await idbOpen();
  idb.ok = !!idb.db;
  if (!idb.ok) return false;
  navigator.storage?.persist?.().then((p) => (idb.persisted = !!p)).catch(() => {});
  updateQuota();
  const stored = await idbGet('state');
  if (stored && (stored.updatedAt || 0) > (state.updatedAt || 0)) {
    const data = normalize(stored);
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, data);
    dataRev++;
    return true;
  }
  // Primera vez con IndexedDB: se copia lo que había en localStorage.
  if (!stored && state.updatedAt) await idbPut('state', state);
  return false;
}

function updateQuota() {
  navigator.storage
    ?.estimate?.()
    .then(({ quota, usage }) => {
      idb.quota = quota || 0;
      idb.usage = usage || 0;
    })
    .catch(() => {});
}

function writeLocalStorage() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    idb.lsFits = true;
  } catch {
    // Cuota llena: con IndexedDB se quita la copia vieja para que no se cargue al arrancar;
    // sin IndexedDB, la app sigue funcionando en memoria.
    idb.lsFits = false;
    if (idb.ok) {
      try {
        localStorage.removeItem(STORE_KEY);
      } catch {
        // Nada más que hacer.
      }
    }
  }
}

// Con IndexedDB el guardado se agrupa (un cambio tras otro se escribe una sola vez) y se
// completa al ocultar o cerrar la página.
function saveLocal() {
  if (!idb.ok) return writeLocalStorage();
  idb.dirty = true;
  clearTimeout(idb.timer);
  idb.timer = setTimeout(flushLocal, 250);
}

function flushLocal() {
  clearTimeout(idb.timer);
  if (!idb.dirty || !idb.ok) return;
  idb.dirty = false;
  writeLocalStorage();
  idbPut('state', state).then((ok) => {
    if (!ok) idb.dirty = true;
  });
}

window.addEventListener('pagehide', flushLocal);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushLocal();
});

// Sube con cada cambio; sirve para saber cuándo recalcular lo que se deriva de las notas.
let dataRev = 0;

function save() {
  dataRev++;
  if (typeof checkProjectMilestones === 'function') checkProjectMilestones();
  state.updatedAt = Date.now();
  saveLocal();
  scheduleSync();
}

// ---------- Utilidades ----------
// Desplaza solo el contenedor con barra de desplazamiento más cercano para que se vea `el`.
// (scrollIntoView movería también la página entera, que debe quedarse quieta.)
function reveal(el, { block = 'nearest', smooth = false } = {}) {
  if (!el) return;
  let box = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  let top = null;
  if (block === 'start') top = box.scrollTop + r.top - b.top - 8;
  else if (block === 'end') top = box.scrollTop + r.bottom - b.bottom + 8;
  else if (r.top < b.top) top = box.scrollTop + r.top - b.top - 8;
  else if (r.bottom > b.bottom) top = box.scrollTop + r.bottom - b.bottom + 8;
  if (top !== null) box.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

// La página en sí nunca se desplaza: si algo la mueve, vuelve a su sitio.
window.addEventListener('scroll', () => {
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
});
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const state = load();

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) node.append(c);
  return node;
}

// Suma `n` al contador de un día, sin dejarlo negativo.
function bump(counter, key, n) {
  counter[key] = Math.max(0, (counter[key] || 0) + n);
  if (!counter[key]) delete counter[key];
}

// Solo se dibuja lo que se ve: el espacio de notas y la sección abierta. Las demás secciones
// se dibujan al abrirlas (VIEW_RENDER), así que con miles de tareas o notas no se rehace todo.
function renderAll() {
  renderNotesUI();
  const tab = activeTab();
  if (tab?.type === 'view') VIEW_RENDER[tab.view]?.();
  if (tab?.view !== 'timer') renderTimer(); // el título de la ventana muestra el tiempo que queda
  checkReminders();
}

// ---------- Aviso con "Deshacer" ----------
let toastTimeout = null;

// Aplica un cambio destructivo y ofrece deshacerlo durante unos segundos.
function withUndo(message, change) {
  const snapshot = JSON.stringify(Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]])));
  change();
  save();
  renderAll();

  const undo = el('button', { className: 'toast-action' }, 'Deshacer');
  undo.addEventListener('click', () => {
    Object.assign(state, JSON.parse(snapshot));
    save();
    applySettings();
    renderAll();
    hideToast();
  });
  $('#toast').replaceChildren(el('span', {}, message), undo);
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(hideToast, 6000);
}

function hideToast() {
  $('#toast').hidden = true;
}

// ---------- Pestañas ----------
// Cada sección se abre como una pestaña del espacio de trabajo.
function showView(name, { newTab = false } = {}) {
  openTab({ type: 'view', view: name }, { newTab });
}

$$('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
