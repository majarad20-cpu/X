'use strict';

// ---------- Propiedades que cambian la app ----------
// Algunas propiedades del YAML hacen algo más que guardarse (como en Obsidian):
//   cssclasses: ancho, tarjetas…   aspecto de la nota (clases de la lista NP_CLASSES; las demás
//                                  se añaden como «cssclass-nombre» para el CSS propio)
//   icono: 📚   color: teal        icono y punto de color en el explorador y en las pestañas
//   fijada: true                   arriba de su carpeta en el explorador
//   fecha / vence: 2026-10-12      la nota sale ese día en el calendario (Mes, Semana y agenda)
// Se usa parseProps (30-tablas.js) y se guarda lo leído por nota mientras su texto no cambie.
const NP_CLASSES = {
  ancho: 'wide', wide: 'wide', estrecho: 'narrow', narrow: 'narrow', tarjetas: 'cards', cards: 'cards',
  'sin-titulo': 'hide-title', 'hide-title': 'hide-title', serif: 'serif', mono: 'mono',
  justificado: 'justify', justify: 'justify', compacto: 'compact', compact: 'compact',
  'sin-propiedades': 'hide-props', 'hide-properties': 'hide-props', centrado: 'center-headings', 'center-headings': 'center-headings',
  'tabla-ancha': 'wide-tables', 'wide-tables': 'wide-tables', 'imagenes-centradas': 'center-images', 'center-images': 'center-images',
};
const NP_DATE_KEYS = ['fecha', 'date', 'vence', 'due'];
const NP_DAILY = /^Diario\/\d{4}-\d{2}-\d{2}$/;
const npCache = new Map(); // id de nota -> { text, props: Map(clave en minúsculas -> propiedad) }
let npDatedCache = null;

// Propiedades de una nota (null si no tiene o está bloqueada).
function npProps(note) {
  const text = note && noteText(note);
  if (!text || !text.startsWith('---')) {
    if (note) npCache.delete(note.id);
    return null;
  }
  const c = npCache.get(note.id);
  if (c && c.text === text) return c.props;
  const props = new Map();
  parseProps(text).props.forEach((p) => !props.has(p.key.toLowerCase()) && props.set(p.key.toLowerCase(), p));
  npCache.set(note.id, { text, props });
  return props;
}
const npGet = (note, ...keys) => {
  const m = npProps(note);
  for (const k of keys) if (m?.get(k)?.value) return m.get(k);
  return null;
};
const npFold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- cssclasses ----------
function npClassList(note) {
  const p = npGet(note, 'cssclasses', 'cssclass');
  if (!p) return [];
  const out = new Set();
  for (const raw of p.items || p.value.split(/[,\s]+/)) {
    const s = npFold(raw);
    const c = NP_CLASSES[s] ? `nc-${NP_CLASSES[s]}` : s.replace(/[^a-z0-9_-]/g, '') && `cssclass-${s.replace(/[^a-z0-9_-]/g, '')}`;
    if (c) out.add(c);
  }
  return [...out].slice(0, 20);
}
// Cada vez que se dibuja una nota se quitan las clases de la anterior y se ponen las suyas.
function npApplyClasses(note) {
  const box = $('.note-inner');
  [...box.classList].filter((c) => /^(nc|cssclass)-/.test(c)).forEach((c) => box.classList.remove(c));
  if (note) box.classList.add(...npClassList(note));
}

// ---------- Icono, color y fijada ----------
// Icono: solo texto, de 1 o 2 caracteres visibles (un emoji cuenta como uno).
function npIcon(note) {
  const v = npGet(note, 'icono', 'icon')?.value.trim() || '';
  if (!v || v.length > 16 || /[\u0000-\u001f\u007f<>&"'`\\]/.test(v)) return ''; // lo que parezca código no vale
  const n = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(v)].length : [...v].length;
  return n <= 2 ? v : '';
}
// Color: un nombre de color (red, teal…) o #rgb / #rrggbb (con o sin transparencia).
function npColor(note) {
  const v = npGet(note, 'color')?.value.trim().toLowerCase() || '';
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return v;
  return /^[a-z]{3,20}$/.test(v) && v !== 'transparent' && !/^(inherit|initial|unset|revert|currentcolor)$/.test(v) && CSS.supports('color', v) ? v : '';
}
const npPinned = (note) => /^(true|s[ií]|yes|1)$/i.test(npGet(note, 'fijada', 'pinned')?.value || '');

function npTogglePin(note) {
  if (npPinned(note)) {
    const keys = [...(npProps(note)?.values() || [])].filter((p) => /^(fijada|pinned)$/i.test(p.key)).map((p) => p.key);
    keys.forEach((k) => peDelete(note, k));
    showToastMessage(`«${baseName(note.path)}» ya no está fijada`);
  } else {
    peSet(note, 'fijada', 'checkbox', true);
    showToastMessage(`📌 «${baseName(note.path)}» fijada arriba de su carpeta`);
  }
}
const npPinItem = (note) => (noteText(note) === null ? null : { label: npPinned(note) ? 'Quitar de fijadas' : '📌 Fijar nota', action: () => npTogglePin(note) });

// Ganchos del explorador y las pestañas (12-notas.js).
NOTE_DECOR.sig = () => {
  if (npCache.size > state.notes.length * 2 + 50) npCache.clear();
  let s = '';
  for (const n of state.notes) if (npProps(n)) s += `${n.id}:${npIcon(n)}|${npColor(n)}|${npPinned(n) ? 1 : 0};`;
  return s;
};
NOTE_DECOR.rank = (note) => (npPinned(note) ? 0 : 1);
NOTE_DECOR.row = (row, note) => {
  const icon = npIcon(note);
  if (icon) row.prepend(el('span', { className: 'np-ico', ariaHidden: 'true' }, icon));
  const color = npColor(note);
  if (color) {
    const dot = el('span', { className: 'np-dot', ariaHidden: 'true' });
    dot.style.setProperty('--np-color', color);
    row.querySelector('.tree-name').after(dot);
  }
  if (npPinned(note)) {
    row.classList.add('np-pinned');
    row.append(el('span', { className: 'np-pin', title: 'Fijada' }, '📌'));
  }
};
NOTE_DECOR.tabIcon = (note) => {
  const icon = npIcon(note);
  return icon ? el('span', { className: 'ico np-ico', ariaHidden: 'true' }, icon) : null;
};
NOTE_DECOR.pane = npApplyClasses;

NOTE_MENU_EXTRA.push(npPinItem);
CTX_MENU_EXTRA.push((kind, x) => (kind === 'note' ? npPinItem(x) : null));

// ---------- Notas con fecha en el calendario ----------
// fecha: 2026-10-12 (todo el día) o 2026-10-12T09:30 / 2026-10-12 09:30 (a esa hora).
function npDateOf(note) {
  if (NP_DAILY.test(note.path)) return null;
  const m = npGet(note, ...NP_DATE_KEYS)?.value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2}))?/);
  return m ? { key: m[1], time: m[2] ? m[2].padStart(5, '0') : '' } : null;
}
function npDated() {
  const stamp = `${dataRev}:${state.notes.length}:${unlockedNotes.size}`;
  if (npDatedCache?.stamp === stamp) return npDatedCache.byDay;
  const byDay = new Map();
  for (const note of state.notes) {
    const d = npDateOf(note);
    if (d) byDay.set(d.key, [...(byDay.get(d.key) || []), { note, time: d.time }]);
  }
  byDay.forEach((list) => list.sort((a, b) => (a.time || '').localeCompare(b.time || '') || baseName(a.note.path).localeCompare(baseName(b.note.path), 'es')));
  npDatedCache = { stamp, byDay };
  return byDay;
}
const npDayNotes = (key) => npDated().get(key) || [];
const npLabel = ({ note, time }) => `${npIcon(note) || '📝'} ${time ? `${time} ` : ''}${baseName(note.path)}`;
function npOpen(note) {
  if (typeof closeDayView === 'function' && !$('#dayview').hidden) closeDayView();
  openNote(note);
}
function npLink(item, className) {
  const a = el('a', { href: '#', className, title: `Abrir la nota ${item.note.path}` }, npLabel(item));
  a.dataset.note = item.note.id;
  a.addEventListener('pointerdown', (e) => e.stopPropagation());
  a.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    npOpen(item.note);
  });
  a.addEventListener('keydown', (e) => e.key === 'Enter' && e.stopPropagation());
  return a;
}

// Mes: un chip por nota (como mucho dos y «+N»).
function npMonthChips(key) {
  const list = npDayNotes(key);
  return [...list.slice(0, 2).map((x) => npLink(x, 'mg-chip mg-note')), ...(list.length > 2 ? [el('div', { className: 'mg-more' }, `+${list.length - 2} 📝`)] : [])];
}
// Lista de las notas de un día (detalle del Mes y Semana).
function npDayList(key) {
  const list = npDayNotes(key);
  return list.length ? el('ul', { className: 'np-day-notes' }, list.map((x) => el('li', {}, npLink(x, 'np-note-link')))) : null;
}
// Agenda del día: las notas sin hora arriba y las que tienen hora como bloques.
function npDvAllDay(key) {
  const list = npDayNotes(key).filter((x) => !x.time);
  return list.length ? [el('h4', {}, 'Notas'), ...list.map((x) => npLink(x, 'dv-allday np-note-link'))] : [];
}
function npDvBlocks(key) {
  return npDayNotes(key)
    .filter((x) => x.time)
    .map((x) => {
      const start = toMin(x.time);
      return { kind: 'note', x, start, end: Math.min(24 * 60, start + DV_DEFAULT_MIN) };
    });
}
function npDvBlock(b) {
  const a = npLink(b.x, 'dv-block np-dv-note short');
  a.style.cssText = dvPlace(b);
  a.replaceChildren(el('div', { className: 'dv-btitle' }, `${npIcon(b.x.note) || '📝'} ${baseName(b.x.note.path)}`), el('div', { className: 'dv-btime' }, `${b.x.time} · nota`));
  return a;
}

// Hoy: las notas con fecha de hoy (fecha:, vence:…).
function renderTodayNotes(key) {
  const box = $('#today-notes');
  const list = npDayList(key);
  box.hidden = !list;
  box.replaceChildren(...(list ? [el('h3', { className: 'today-notes-title' }, '📝 Notas de hoy'), list] : []));
}
