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
  archive: [], // tareas completadas hace más de una semana
  log: [], // bitácora: hitos de cada día
  notes: [], // notas en Markdown: { id, path: 'Carpeta/Título', body }
  folders: [], // carpetas de notas (también las vacías)
  updatedAt: 0, // última modificación local
  syncMeta: { sent: {}, times: {} }, // estado de la sincronización por bloques (solo de este dispositivo)
});

// Datos del usuario (lo que se sincroniza, se exporta y se puede deshacer).
const CORE_KEYS = ['tasks', 'habits', 'settings', 'pomodoros', 'focusMinutes', 'completions', 'projects', 'folders'];
const DATA_KEYS = [...CORE_KEYS, 'journal', 'ideas', 'maps', 'archive', 'log', 'notes'];

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
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
  } catch {
    return defaults();
  }
}

function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota llena): la app sigue funcionando en memoria.
  }
}

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

function renderAll() {
  renderToday();
  renderTasks();
  renderTimer();
  renderHabits();
  renderProgress();
  renderProjects();
  renderJournal();
  renderIdeas();
  renderLog();
  renderNotesUI();
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
