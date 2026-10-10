'use strict';

// ---------- Almacenamiento ----------
const STORE_KEY = 'enfoque:v1';

const defaults = () => ({
  tasks: [],
  habits: [],
  settings: { focus: 25, short: 5, long: 15, sort: 'priority', accent: 'indigo' },
  pomodoros: {}, // { 'YYYY-MM-DD': n }
  focusMinutes: {}, // { 'YYYY-MM-DD': minutos de enfoque completados }
  focusLog: [], // sesiones de enfoque con su contexto (03-pomodoro.js)
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
  finance: { categories: [], tx: [], recurring: [], currency: '' }, // finanzas (65-finanzas.js)
  updatedAt: 0, // última modificación local
  // Estado de la sincronización por bloques (solo de este dispositivo y de la cuenta `user`):
  // lo último enviado o recibido, su versión, desde cuándo difiere cada bloque y los borrados.
  syncMeta: { sent: {}, times: {}, dirtyAt: {}, tombs: {} },
});

// Datos del usuario (lo que se sincroniza, se exporta y se puede deshacer).
const CORE_KEYS = ['tasks', 'habits', 'settings', 'pomodoros', 'focusMinutes', 'completions', 'projects', 'folders'];
const DATA_KEYS = [...CORE_KEYS, 'journal', 'ideas', 'maps', 'archive', 'log', 'notes', 'canvases', 'finance', 'focusLog'];

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
    idb.lsEmpty = !raw;
    return raw ? normalize(JSON.parse(raw)) : defaults();
  } catch {
    idb.lsEmpty = true;
    return defaults();
  }
}

// ---------- IndexedDB ----------
// blocked: no se pudo leer IndexedDB y no había copia en localStorage; no se guarda nada para no
// pisar los datos que pueda haber en IndexedDB con los de por defecto.
const idb = { db: null, ok: false, timer: null, dirty: false, quota: 0, usage: 0, persisted: false, lsFits: true, lsEmpty: false, blocked: false };

function idbOpen() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (db) => {
      if (done) return db?.close();
      done = true;
      resolve(db);
    };
    // Si el navegador no responde, se sigue sin IndexedDB (con localStorage) en vez de esperar.
    setTimeout(() => finish(null), 3000);
    try {
      // Versión 2: almacén «files» (imágenes de las notas); 3: «history» (versiones de las notas).
      const req = indexedDB.open('enfoque', 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'noteId' });
      };
      req.onsuccess = () => {
        // Otra pestaña con una versión más nueva necesita actualizar la base de datos.
        req.result.onversionchange = () => req.result.close();
        finish(req.result);
      };
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
    } catch {
      finish(null);
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
  const changed = await readFromDB();
  // Lo que ya estaba sin subir de la sesión anterior queda fechado antes del mantenimiento del arranque.
  if (typeof syncMark === 'function') syncMark(0);
  return changed;
}

async function readFromDB() {
  idb.db = await idbOpen();
  idb.ok = !!idb.db;
  if (!idb.ok) {
    if (window.indexedDB && idb.lsEmpty) blockSaving();
    return false;
  }
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

function blockSaving() {
  idb.blocked = true;
  const reload = el('button', { className: 'toast-action' }, 'Recargar');
  reload.addEventListener('click', () => location.reload());
  $('#toast').replaceChildren(el('span', {}, 'No se pudieron leer los datos guardados. Los cambios no se guardarán: recarga la página.'), reload);
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
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
  if (idb.blocked) return;
  if (!idb.ok) return writeLocalStorage();
  idb.dirty = true;
  clearTimeout(idb.timer);
  idb.timer = setTimeout(flushLocal, 250);
}

function flushLocal() {
  clearTimeout(idb.timer);
  if (!idb.dirty || !idb.ok || idb.blocked) return;
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
  // Mientras arranca (archivar, reconstruir la bitácora…) no cuenta como un cambio del usuario.
  if (typeof syncNoteEdit === 'function') syncNoteEdit(!document.documentElement.dataset.ready);
  saveLocal();
  if (!idb.blocked) scheduleSync();
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
// Otras partes que se vuelven a dibujar con todo lo demás (p. ej. la agenda del día abierta).
const RENDER_HOOKS = [];
function renderAll() {
  renderNotesUI();
  const tab = activeTab();
  if (tab?.type === 'view') VIEW_RENDER[tab.view]?.();
  if (tab?.view !== 'timer') renderTimer(); // el título de la ventana muestra el tiempo que queda
  checkReminders();
  RENDER_HOOKS.forEach((f) => f());
}

// ---------- Aviso con "Deshacer" ----------
let toastTimeout = null;

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const idItems = (v) => Array.isArray(v) && v.every((x) => isPlain(x) && x.id !== undefined);

// Qué cambió de `a` (antes) a `b` (después): en listas con id, por elemento (con `refs`, los objetos
// de antes); en objetos, por clave; en lo demás, el valor entero.
function undoDiff(a, b, refs) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja === jb) return null;
  if (idItems(a) && idItems(b)) {
    const after = new Map(b.map((x) => [x.id, JSON.stringify(x)]));
    const ids = new Set(a.map((x) => x.id));
    const d = { list: true, added: [], removed: [], modified: [] };
    b.forEach((x) => !ids.has(x.id) && d.added.push({ id: x.id, after: after.get(x.id) }));
    a.forEach((x, i) => {
      const v = JSON.stringify(x);
      if (!after.has(x.id)) d.removed.push({ id: x.id, v, i, prev: a[i - 1]?.id, ref: refs?.[i] });
      else if (after.get(x.id) !== v) d.modified.push({ id: x.id, v, after: after.get(x.id) });
    });
    return d;
  }
  if (isPlain(a) && isPlain(b)) {
    const keys = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const sub = undoDiff(a[k], b[k]);
      if (sub) keys[k] = sub;
    }
    return { keys };
  }
  return { v: ja, after: jb };
}

// Deshace `d` sobre lo que hay ahora en obj[k]. Lo que cambió después no se toca: devuelve false.
function undoApply(obj, k, d) {
  let ok = true;
  if (d.keys) {
    if (!isPlain(obj[k])) return false;
    for (const [s, sub] of Object.entries(d.keys)) ok = undoApply(obj[k], s, sub) && ok;
    return ok;
  }
  if (d.list) {
    const list = obj[k];
    if (!Array.isArray(list)) return false;
    const at = (id) => list.findIndex((x) => x?.id === id);
    d.added.forEach(({ id, after }) => {
      const i = at(id);
      if (i >= 0 && JSON.stringify(list[i]) === after) list.splice(i, 1);
      else if (i >= 0) ok = false;
    });
    // Se restaura dentro del mismo objeto, por si alguien lo tiene a mano.
    d.modified.forEach(({ id, v, after }) => {
      const x = list[at(id)];
      if (!x || JSON.stringify(x) !== after) return (ok = false);
      Object.keys(x).forEach((p) => delete x[p]);
      Object.assign(x, JSON.parse(v));
    });
    // Lo borrado vuelve detrás del que tenía delante (o a su sitio), con el mismo objeto si no cambió.
    d.removed.forEach(({ id, v, i, prev, ref }) => {
      if (at(id) >= 0) return;
      const p = prev === undefined ? -1 : at(prev);
      const pos = prev === undefined ? 0 : p >= 0 ? p + 1 : Math.min(i, list.length);
      list.splice(pos, 0, ref && JSON.stringify(ref) === v ? ref : JSON.parse(v));
    });
    return ok;
  }
  if (JSON.stringify(obj[k]) !== d.after) return false;
  if (d.v === undefined) delete obj[k];
  else obj[k] = JSON.parse(d.v);
  return true;
}

// Aplica un cambio destructivo y ofrece deshacerlo durante unos segundos. Deshacer revierte solo
// lo que tocó el cambio: lo que llegue después (otro dispositivo, un pomodoro, lo escrito) se queda.
function withUndo(message, change) {
  const before = DATA_KEYS.map((k) => [k, JSON.stringify(state[k]), Array.isArray(state[k]) ? state[k].slice() : null]);
  change();
  const diffs = [];
  before.forEach(([k, json, refs]) => {
    if (JSON.stringify(state[k]) !== json) diffs.push([k, undoDiff(json === undefined ? undefined : JSON.parse(json), state[k], refs)]);
  });
  save();
  renderAll();

  const undo = el('button', { className: 'toast-action' }, 'Deshacer');
  undo.addEventListener('click', () => {
    const ok = diffs.reduce((ok, [k, d]) => undoApply(state, k, d) && ok, true);
    save();
    applySettings();
    renderAll();
    if (ok) return hideToast();
    $('#toast').replaceChildren(el('span', {}, 'No se pudo deshacer del todo: cambió después'));
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(hideToast, 6000);
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
