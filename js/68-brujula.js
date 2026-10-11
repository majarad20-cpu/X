'use strict';

// ---------- Mi brújula: quién soy, valores, principios y objetivos de vida ----------
// Es una nota normal («Mi brújula»: se sincroniza, va a Drive y se busca como las demás) con una
// plantilla guiada. Cada día, Hoy recuerda una de sus frases (valores, principios, misión…) y la
// revisión semanal pregunta si la semana fue en esa dirección (22-revision.js).
ICONS.compass = '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>';

const COMPASS_TITLE = 'Mi brújula';
const COMPASS_TEMPLATE = `# 🧭 Mi brújula

> [!tip] Cómo usarla
> Escríbela con calma, sección a sección: no hace falta terminarla de una vez. Pon cada idea en una línea con «- ». Cada día verás en **Hoy** uno de tus valores, principios, tu misión u objetivos del año. Repásala cada pocos meses.

## 🙋 Quién soy
-

## 🌱 Filosofía de vida
-

## 💎 Valores
-

## 📏 Principios
-

## 🎯 Misión
-

## 🔭 Visión
-

## 👥 Roles
-

## 🗺️ Objetivos de vida
### A 10 años
-
### A 5 años
-
### Este año
-
`;

// Secciones que se recuerdan en Hoy (por el texto del título, sin emojis ni tildes).
const COMPASS_DAILY = [
  [/valores?/, '💎 Valor'],
  [/principios?/, '📏 Principio'],
  [/mision/, '🎯 Misión'],
  [/vision/, '🔭 Visión'],
  [/filosofia/, '🌱 Filosofía'],
  [/este ano|1 ano|objetivos? del ano/, '🗺️ Objetivo del año'],
];

const plainHeading = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

function compassNote() {
  const id = state.settings.compassId;
  return (id && noteById(id)) || state.notes.find((n) => n.path === COMPASS_TITLE) || null;
}

function openCompass({ newTab = false } = {}) {
  let note = compassNote();
  if (!note) {
    note = createNote({ title: COMPASS_TITLE, body: COMPASS_TEMPLATE, open: false, log: false });
    logEvent('note', 'Creada «Mi brújula»', { ref: note.id });
  }
  if (state.settings.compassId !== note.id) {
    state.settings.compassId = note.id;
    save();
  }
  openNote(note, { newTab });
}

// Frases para Hoy: los elementos de lista de las secciones de COMPASS_DAILY, con su etiqueta.
function compassItems(note = compassNote()) {
  const text = note && noteText(note);
  if (!text) return [];
  const out = [];
  let label = null;
  let h2 = null;
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence) continue;
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      const name = plainHeading(h[2]);
      if (h[1] === '##') h2 = name;
      // Un ### dentro de «Objetivos» solo cuenta si es el del año; los demás ### heredan su ##.
      const own = COMPASS_DAILY.find(([re]) => re.test(name));
      label = own ? own[1] : h[1] === '###' && /objetivo/.test(h2 || '') ? null : h[1] === '##' ? null : label;
      continue;
    }
    if (/^#\s/.test(line)) {
      label = null;
      continue;
    }
    // «-Texto» también vale (al guardar se quita el espacio que deja la plantilla tras «-»).
    const item = line.match(/^\s*(?:-\s*|[*+]\s+|\d+[.)]\s+)(?:\[[ xX]\]\s+)?(.*\S)\s*$/);
    if (label && item && !/^[-*_\s]+$/.test(item[1])) out.push({ label, text: item[1].replace(/\*\*|__|`/g, '') });
  }
  return out;
}

// La misma frase durante todo el día; cambia al día siguiente.
function compassOfDay(key = dateKey()) {
  const items = compassItems();
  if (!items.length) return null;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return items[h % items.length];
}

function renderTodayCompass() {
  const box = $('#today-compass');
  if (!box) return;
  const item = state.settings.compassToday !== false && compassOfDay();
  box.hidden = !item;
  if (!item) return box.replaceChildren();
  const open = el('button', { className: 'link', title: 'Abrir Mi brújula' }, 'Abrir');
  open.addEventListener('click', () => openCompass());
  const hide = el('button', { className: 'link', title: 'Dejar de mostrar la brújula en Hoy (se vuelve a activar desde Comandos)' }, 'Ocultar');
  hide.addEventListener('click', () => {
    state.settings.compassToday = false;
    save();
    renderTodayCompass();
    showToastMessage('La brújula ya no sale en Hoy. Para volver a verla: Comandos › «Mostrar Mi brújula en Hoy».');
  });
  box.replaceChildren(
    el('span', { className: 'compass-label' }, `🧭 ${item.label}`),
    el('p', { className: 'compass-text' }, item.text),
    el('div', { className: 'compass-actions' }, [open, hide])
  );
}

// Pregunta de la revisión semanal (paso «Reflexión»), con los objetivos del año a la vista.
function compassPrompt(field) {
  const box = field('align', '🧭 ¿Lo que hiciste esta semana te acercó a tus valores y objetivos de vida?');
  const goals = compassItems().filter((i) => i.label.includes('Objetivo')).slice(0, 5);
  if (goals.length) box.append(el('ul', { className: 'compass-goals muted' }, goals.map((g) => el('li', {}, g.text))));
  const open = el('button', { type: 'button', className: 'link' }, compassNote() ? 'Ver mi brújula' : 'Crear mi brújula');
  open.addEventListener('click', (e) => {
    e.preventDefault();
    openCompass({ newTab: true });
  });
  box.append(open);
  return box;
}

$('#rib-compass').addEventListener('click', (e) => openCompass({ newTab: e.ctrlKey || e.metaKey }));
RENDER_HOOKS.push(renderTodayCompass);
COMMANDS_EXTRA.push(() => [
  { label: 'Abrir Mi brújula (valores, principios y objetivos de vida)', action: ({ newTab } = {}) => openCompass({ newTab }) },
  state.settings.compassToday === false
    ? { label: 'Mostrar Mi brújula en Hoy', action: () => { state.settings.compassToday = true; save(); renderTodayCompass(); } }
    : { label: 'Ocultar Mi brújula en Hoy', action: () => { state.settings.compassToday = false; save(); renderTodayCompass(); } },
]);
renderTodayCompass();
