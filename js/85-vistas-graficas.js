'use strict';

// ---------- Vistas gráficas de las notas ----------
// Vistas propias, cada una con su icono en la barra (después de Bases), para trabajar las notas
// de forma visual:
//   ✏️ Dibujos    · galería de los dibujos (al estilo Excalidraw) de todas las notas (88-vista-dibujos.js)
//   📋 Tableros   · kanban: columnas por el valor de una propiedad; arrastrar cambia la propiedad
//   ▦  Matriz     · dos propiedades como ejes; arrastrar a otra casilla cambia las dos
//   🗺️ Mapas      · un MOC (o cualquier nota) como mapa: títulos como ramas y enlaces como hojas
//   🧱 Mosaico    · la bóveda en bloques proporcionales (por MOC, carpeta o propiedad)
//   📅 Línea de tiempo · fechas del texto y de las propiedades en un eje por meses
//   🃏 Tarjetas   · repaso espaciado con las notas o sus secciones
// Todas eligen su «origen» (toda la bóveda, una carpeta, un MOC o una etiqueta) y recuerdan sus
// opciones en los ajustes (state.settings.gv), así que se sincronizan. Este archivo tiene lo común,
// Tableros y Matriz; 86-vistas-mapas.js, Mapas y Mosaico; 87-vistas-tiempo-estudio.js, el resto.

Object.assign(ICONS, {
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  matrix: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18"/>',
  'map-notes': '<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="6" r="1.8"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="4.5" cy="18" r="1.8"/><circle cx="19.5" cy="18" r="1.8"/><path d="M6 7l4 3.5M18 7l-4 3.5M6 17l4-3.5M18 17l-4-3.5"/>',
  treemap: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M11 3v18M11 13h10M16 13v8"/>',
  timeline: '<path d="M3 12h18"/><circle cx="7" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><path d="M7 10V6h5M15 14v4h5"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/><path d="M7 13h6"/>',
});

const GV_VIEWS = [
  { id: 'dibujos', title: 'Dibujos', icon: 'pencil', hint: 'Dibujos: todos tus dibujos (al estilo Excalidraw) en una galería; crea uno nuevo o edita los que tienes' },
  { id: 'tableros', title: 'Tableros', icon: 'kanban', hint: 'Tableros (kanban): tus notas en columnas según una propiedad; arrastra una tarjeta para cambiarla' },
  { id: 'matriz', title: 'Matriz', icon: 'matrix', hint: 'Matriz: tus notas en una cuadrícula de dos propiedades (por ejemplo, área × estado)' },
  { id: 'mapas', title: 'Mapas de notas', icon: 'map-notes', hint: 'Mapas de notas: un MOC o una nota como mapa mental, organigrama, esquema o mapa radial' },
  { id: 'mosaico', title: 'Mosaico', icon: 'treemap', hint: 'Mosaico: la bóveda en bloques proporcionales, por MOC, carpeta o propiedad' },
  { id: 'linea', title: 'Línea de tiempo', icon: 'timeline', hint: 'Línea de tiempo: las fechas de tus notas (vigencias, plazos, publicaciones) en un eje por meses' },
  { id: 'estudio', title: 'Tarjetas de estudio', icon: 'cards', hint: 'Tarjetas de estudio: repasa las notas o sus secciones con repaso espaciado' },
];
GV_VIEWS.forEach((v) => {
  VIEW_TITLES[v.id] = v.title;
  VIEW_ICONS[v.id] = v.icon;
  $('#views-pane main').append(el('section', { id: `view-${v.id}`, className: 'view gv-view' }));
});
(() => {
  let after = $('.ribbon [data-view="bases"]') || $('.ribbon [data-view="canvas"]');
  if (!after) return;
  GV_VIEWS.forEach((v) => {
    const b = el('button', { className: 'rib', title: v.hint, ariaLabel: v.title }, [ico(v.icon), el('span', { className: 'rib-label' }, v.title)]);
    b.dataset.view = v.id;
    b.addEventListener('click', (e) => showView(v.id, { newTab: e.ctrlKey || e.metaKey }));
    after.after(b);
    after = b;
  });
})();

// ---------- Opciones (se guardan y se sincronizan) ----------
function gvCfg() {
  if (!state.settings.gv || typeof state.settings.gv !== 'object' || Array.isArray(state.settings.gv)) state.settings.gv = {};
  const g = state.settings.gv;
  if (!g.view || typeof g.view !== 'object') g.view = {};
  if (!Array.isArray(g.boards)) g.boards = [];
  if (!g.srs || typeof g.srs !== 'object') g.srs = {};
  return g;
}
const gvOpt = (view, key, def) => gvCfg().view[view]?.[key] ?? def;
function gvSetOpt(view, patch) {
  const g = gvCfg();
  g.view[view] = { ...(g.view[view] || {}), ...patch };
  save();
  VIEW_RENDER[view]?.();
}

// ---------- Origen de las notas ----------
// { t: 'all' } · { t: 'folder', v: ruta } · { t: 'moc', v: id de la nota } · { t: 'tag', v: etiqueta }
const gvLive = () => state.notes.filter((n) => !n.enc && typeof n.body === 'string');
const gvClean = (s) => String(s || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
const gvIsMoc = (n) => /(^|\W)MOC(\W|$)/.test(baseName(n.path)) || /^moc$/i.test(propOf(n, 'tipo'));

// Notas que pertenecen a un MOC: las que enlaza y las que lo nombran en su propiedad «moc».
function gvMocMembers(moc) {
  const out = new Set();
  linksIn(moc.body).forEach((l) => {
    const n = l.target && findNoteByName(l.target);
    if (n && n !== moc && !n.enc) out.add(n);
  });
  const names = [baseName(moc.path).toLowerCase(), ...noteAliases(moc.body).map((a) => a.toLowerCase())];
  gvLive().forEach((n) => {
    if (n === moc) return;
    if (propValues(n, 'moc').some((v) => names.includes(gvClean(v).split('/').pop().toLowerCase()))) out.add(n);
  });
  return [...out];
}

const gvMemo = new Map();
// Cálculos caros, una vez por versión de los datos.
function gvCached(key, fn) {
  const hit = gvMemo.get(key);
  if (hit && hit.rev === dataRev && hit.n === state.notes.length) return hit.value;
  const value = fn();
  gvMemo.set(key, { rev: dataRev, n: state.notes.length, value });
  return value;
}

function gvNotes(src) {
  const s = src || { t: 'all' };
  return gvCached(`src:${JSON.stringify(s)}`, () => {
    if (s.t === 'folder') {
      const f = String(s.v || '').toLowerCase();
      return gvLive().filter((n) => n.path.toLowerCase().startsWith(`${f}/`));
    }
    if (s.t === 'moc') {
      const moc = noteById(s.v);
      return moc ? gvMocMembers(moc) : [];
    }
    if (s.t === 'tag') {
      const t = String(s.v || '').toLowerCase();
      return gvLive().filter((n) => boardNoteTags(n).some((x) => x === t || x.startsWith(`${t}/`)));
    }
    return gvLive();
  });
}

function gvSrcLabel(src) {
  const s = src || { t: 'all' };
  if (s.t === 'folder') return `📁 ${s.v}`;
  if (s.t === 'moc') return `🧭 ${noteById(s.v) ? baseName(noteById(s.v).path) : 'MOC borrado'}`;
  if (s.t === 'tag') return `#${s.v}`;
  return '🗃️ Toda la bóveda';
}

function gvFolders() {
  return gvCached('folders', () => {
    const set = new Set();
    gvLive().forEach((n) => {
      const parts = n.path.split('/').slice(0, -1);
      parts.forEach((_, i) => set.add(parts.slice(0, i + 1).join('/')));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  });
}
function gvTags() {
  return gvCached('tags', () => {
    const c = new Map();
    gvLive().forEach((n) => boardNoteTags(n).forEach((t) => c.set(t, (c.get(t) || 0) + 1)));
    return [...c].sort((a, b) => b[1] - a[1]);
  });
}
const gvMocs = () => gvCached('mocs', () => gvLive().filter(gvIsMoc).sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), 'es', { numeric: true })));

// Botón «Origen: …» que abre el buscador para elegir.
function gvSourceButton(src, onPick, { notesOnly = false } = {}) {
  const b = el('button', { className: 'gv-chip', title: 'Elegir de dónde salen las notas' }, [el('span', { className: 'muted' }, notesOnly ? 'Nota: ' : 'Origen: '), gvSrcLabel(src), ' ▾']);
  b.addEventListener('click', () => gvPickSource(onPick, { notesOnly }));
  return b;
}

function gvPickSource(onPick, { notesOnly = false } = {}) {
  openPicker({
    placeholder: notesOnly ? 'Busca un MOC o cualquier nota…' : 'Origen: toda la bóveda, un MOC, una carpeta o una #etiqueta…',
    hint: '<kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cerrar',
    items: (typed) => {
      const q = fold(typed.trim().replace(/^#/, ''));
      const has = (s) => !q || fold(s).includes(q);
      const out = [];
      if (!notesOnly && has('toda la boveda')) out.push({ label: '🗃️ Toda la bóveda', detail: plural(gvLive().length, 'nota', 'notas'), action: () => onPick({ t: 'all' }) });
      gvMocs().filter((n) => has(baseName(n.path))).forEach((n) => out.push({ label: `🧭 ${baseName(n.path)}`, detail: 'MOC', action: () => onPick({ t: 'moc', v: n.id }) }));
      if (notesOnly) {
        if (q) gvLive().filter((n) => !gvIsMoc(n) && has(baseName(n.path))).slice(0, 40).forEach((n) => out.push({ label: `📝 ${baseName(n.path)}`, detail: folderOf(n.path), action: () => onPick({ t: 'moc', v: n.id }) }));
        return out.slice(0, 80);
      }
      gvFolders().filter(has).forEach((f) => out.push({ label: `📁 ${f}`, detail: 'Carpeta', action: () => onPick({ t: 'folder', v: f }) }));
      gvTags().filter(([t]) => has(t)).slice(0, 60).forEach(([t, k]) => out.push({ label: `#${t}`, detail: plural(k, 'nota', 'notas'), action: () => onPick({ t: 'tag', v: t }) }));
      return out.slice(0, 120);
    },
  });
}

// Propiedades que usan las notas del origen, de la más usada a la menos.
function gvPropKeys(notes) {
  const c = new Map();
  notes.forEach((n) => noteFields(n).forEach((p) => {
    if (/^(tags?|alias(es)?|cssclass(es)?|fuentes?|creada|actualizada|vigencia)$/i.test(p.key)) return;
    const k = p.key.toLowerCase();
    c.set(k, { key: c.get(k)?.key || p.key, n: (c.get(k)?.n || 0) + 1 });
  }));
  return [...c.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, 'es'));
}

function gvPickProp(notes, title, onPick) {
  const keys = gvPropKeys(notes);
  openPicker({
    placeholder: title,
    hint: '<kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cerrar',
    items: (typed) => {
      const t = typed.replace(/[:\n,]/g, ' ').trim();
      const out = keys.filter((k) => fold(k.key).includes(fold(t))).map((k) => ({ label: k.key, detail: plural(k.n, 'nota', 'notas'), action: () => onPick(k.key) }));
      if (t && !keys.some((k) => k.key.toLowerCase() === t.toLowerCase())) out.push({ label: `Usar «${t}»`, create: true, action: () => onPick(t) });
      return out;
    },
  });
}

// Valor de una propiedad para agrupar: el primero, sin [[ ]].
const gvVal = (n, key) => gvClean(propValues(n, key)[0] || '');

// Cambia varias propiedades de una nota de una vez (vacío = quitarla).
function gvSetProps(note, pairs) {
  if (!note || note.enc) return false;
  const before = note.body;
  pairs.forEach(([k, v]) => (v == null || v === '' ? removeNoteProp(note, k) : setProp(note, k, v)));
  if (note.body === before) return false;
  note.updatedAt = Date.now();
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(note);
  renderAll();
  return true;
}

const gvOpen = (n, e) => openNote(n, { newTab: !!(e?.ctrlKey || e?.metaKey) });

// Cabecera compacta: título, ⓘ (la explicación, plegada salvo que se pida) y pantalla completa.
function gvHead(view, text) {
  const v = GV_VIEWS.find((x) => x.id === view);
  const open = gvCfg().help === true;
  const info = el('button', { className: `gv-icon-btn${open ? ' on' : ''}`, title: open ? 'Ocultar la explicación' : text, ariaLabel: 'Cómo se usa', ariaPressed: String(open) }, 'ⓘ');
  info.addEventListener('click', () => {
    gvCfg().help = !open;
    save();
    VIEW_RENDER[view]?.();
  });
  const full = document.documentElement.classList.contains('gv-full');
  const fs = el('button', { className: 'gv-icon-btn', title: full ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa', ariaLabel: full ? 'Salir de pantalla completa' : 'Pantalla completa' }, full ? '✕' : '⛶');
  fs.addEventListener('click', () => gvFull(!full));
  return el('div', { className: 'gv-head' }, [
    el('div', { className: 'gv-head-row' }, [el('h2', { className: 'gv-title' }, [ico(v.icon), ` ${v.title}`]), info, el('span', { className: 'gv-spacer' }), fs]),
    open ? el('p', { className: 'muted gv-sub' }, text) : '',
  ]);
}

// Pantalla completa: la vista tapa paneles y pestañas (Esc vuelve).
function gvFull(on) {
  document.documentElement.classList.toggle('gv-full', on);
  const tab = activeTab();
  if (tab?.type === 'view') VIEW_RENDER[tab.view]?.();
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !document.documentElement.classList.contains('gv-full')) return;
  if (document.querySelector('#picker:not([hidden]), #note-menu:not([hidden]), #draw:not([hidden])')) return;
  gvFull(false);
});
// Al salir de una vista gráfica, se sale de la pantalla completa.
RENDER_HOOKS.push(() => {
  const tab = activeTab();
  if (document.documentElement.classList.contains('gv-full') && !(tab?.type === 'view' && GV_VIEWS.some((v) => v.id === tab.view))) document.documentElement.classList.remove('gv-full');
});
const gvBtn = (label, fn, cls = 'gv-chip', title = '') => {
  const b = el('button', { className: cls, title }, label);
  b.addEventListener('click', fn);
  return b;
};
// Selector de opciones como botones segmentados.
function gvSeg(options, value, onPick) {
  return el('div', { className: 'view-switch gv-seg', role: 'tablist' }, options.map(([v, label]) => {
    const b = gvBtn(label, () => onPick(v), `seg${v === value ? ' active' : ''}`);
    b.setAttribute('role', 'tab');
    b.ariaSelected = String(v === value);
    return b;
  }));
}

// =========================================================
// 📋 Tableros (kanban)
// =========================================================
// Varios tableros guardados: { id, name, src, group, columns: [], show: [] }.
const gvBoards = () => gvCfg().boards;
function gvBoardSave() {
  save();
  VIEW_RENDER.tableros();
}

function gvNewBoard(seed = {}) {
  const board = { id: `b${Date.now().toString(36)}`, name: seed.name || 'Tablero nuevo', src: seed.src || { t: 'all' }, group: seed.group || 'estado', columns: seed.columns || [], show: seed.show || [] };
  gvBoards().push(board);
  gvSetOpt('tableros', { open: board.id });
  return board;
}

const GV_BOARD_PRESETS = [
  { name: 'Notas por estado', group: 'estado', columns: ['borrador', 'en desarrollo', 'completa', 'revisada'], show: ['area'] },
  { name: 'Notas por área', group: 'area', columns: [], show: ['estado'] },
  { name: 'Notas por tipo', group: 'tipo', columns: [], show: ['estado'] },
];

function renderTableros() {
  const box = $('#view-tableros');
  if (!box) return;
  const list = gvBoards();
  let board = list.find((b) => b.id === gvOpt('tableros', 'open', ''));
  if (!board && list.length) board = list[0];
  const tabs = el('div', { className: 'gv-tabs' }, [
    ...list.map((b) => {
      const t = gvBtn(b.name, () => gvSetOpt('tableros', { open: b.id }), `gv-tab${b === board ? ' active' : ''}`);
      t.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        gvSetOpt('tableros', { open: b.id });
        gvBoardMenu(b, { x: e.clientX, y: e.clientY });
      });
      return t;
    }),
    gvBtn('＋ Tablero', () => gvNewBoardMenu(), 'gv-tab gv-add', 'Crear un tablero'),
  ]);
  if (!board) {
    box.replaceChildren(
      gvHead('tableros', 'Tus notas como tarjetas en columnas según una propiedad (estado, área, tipo…). Arrastra una tarjeta a otra columna y la nota cambia sola.'),
      tabs,
      el('div', { className: 'gv-presets' }, GV_BOARD_PRESETS.map((p) => gvBtn([el('strong', {}, p.name), el('span', { className: 'muted' }, `Columnas por «${p.group}»`)], () => gvNewBoard(p), 'card gv-preset')))
    );
    return;
  }
  const notes = gvNotes(board.src);
  const cols = gvBoardColumns(notes, board);
  const total = cols.reduce((s, c) => s + c.notes.length, 0);
  const q = { group: board.group, show: board.show, filters: [], tags: [], folder: board.src.t === 'folder' ? board.src.v : null };
  const bar = el('div', { className: 'gv-bar' }, [
    gvSourceButton(board.src, (src) => { board.src = src; gvBoardSave(); }),
    gvBtn([el('span', { className: 'muted' }, 'Columnas por: '), board.group, ' ▾'], () => gvPickProp(notes, 'Columnas según la propiedad… (p. ej. estado)', (k) => { board.group = k; board.columns = []; gvBoardSave(); })),
    gvBtn([el('span', { className: 'muted' }, 'Mostrar: '), board.show.length ? board.show.join(', ') : 'nada', ' ▾'], () => gvPickProp(notes, 'Mostrar en cada tarjeta la propiedad…', (k) => {
      board.show = board.show.some((x) => x.toLowerCase() === k.toLowerCase()) ? board.show.filter((x) => x.toLowerCase() !== k.toLowerCase()) : [...board.show, k];
      gvBoardSave();
    })),
    gvBtn('＋ Columna', () => promptText({ placeholder: `Valor de «${board.group}» para la columna nueva`, action: 'Añadir', onSubmit: (v) => { if (v.trim()) { board.columns = [...cols.filter((c) => c.value).map((c) => c.value), v.trim()]; gvBoardSave(); } } })),
    el('span', { className: 'gv-spacer' }),
    el('span', { className: 'muted gv-count' }, plural(total, 'nota', 'notas')),
    gvBtn('⋯', (e) => gvBoardMenu(board, e.currentTarget), 'gv-chip', 'Más opciones del tablero'),
  ]);
  const wrap = el('div', { className: 'nb-board gv-board gv-fill' }, cols.map((c, ci) => {
    const add = gvBtn('+', () => promptText({ placeholder: `Nombre de la nota nueva (${c.value ? `${board.group}: ${c.label}` : c.label})`, action: 'Crear nota', onSubmit: (name) => {
      const folder = board.src.t === 'folder' ? board.src.v : '';
      const props = c.value ? `---\n${board.group}: ${yamlScalar(c.value)}\n---\n` : '';
      createNote({ folder, title: name, body: props, open: false, edit: false });
      renderAll();
    } }), 'nb-add', `Nueva nota en «${c.label}»`);
    const cards = el('div', { className: 'nb-cards' }, c.notes.slice(0, 200).map((n) => boardNoteCard(n, q, cols, ci)));
    if (c.notes.length > 200) cards.append(el('p', { className: 'muted kcol-more' }, `y ${c.notes.length - 200} más`));
    if (!c.notes.length) cards.append(el('p', { className: 'kcol-empty' }, 'Arrastra notas aquí'));
    const col = el('section', { className: `nb-col${c.value ? '' : ' nb-none'}`, ariaLabel: c.label }, [
      el('header', { className: 'nb-col-head' }, [el('span', { className: 'nb-col-title' }, c.label), el('span', { className: 'kcol-count' }, String(c.notes.length)), add]),
      cards,
    ]);
    col.dataset.ci = String(ci);
    return col;
  }));
  box.replaceChildren(gvHead('tableros', 'Arrastra una tarjeta a otra columna para cambiar su propiedad; tócala para abrir la nota. Clic derecho en la pestaña para renombrar o borrar el tablero.'), tabs, bar, wrap);
}

function gvBoardColumns(notes, board) {
  const listed = board.columns.map((v) => ({ key: v.toLowerCase(), label: v, value: v, notes: [] }));
  const byKey = new Map(listed.map((c) => [c.key, c]));
  const extra = [];
  const none = { key: '', label: `Sin ${board.group}`, value: null, notes: [] };
  notes.forEach((n) => {
    const v = gvVal(n, board.group);
    if (!v) return none.notes.push(n);
    let c = byKey.get(v.toLowerCase());
    if (!c) {
      c = { key: v.toLowerCase(), label: v, value: v, notes: [] };
      byKey.set(c.key, c);
      extra.push(c);
    }
    c.notes.push(n);
  });
  extra.sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
  const all = [...listed, ...extra, none];
  all.forEach((c) => sortNotesBy(c.notes, 'nombre', false));
  return all;
}

function gvNewBoardMenu() {
  openPicker({
    placeholder: 'Nombre del tablero nuevo, o elige uno de ejemplo',
    hint: '<kbd>Enter</kbd> crear · <kbd>Esc</kbd> cerrar',
    items: (typed) => {
      const t = typed.trim();
      const out = t ? [{ label: `Crear «${t}»`, create: true, action: () => gvNewBoard({ name: t }) }] : [];
      return out.concat(GV_BOARD_PRESETS.filter((p) => !t || fold(p.name).includes(fold(t))).map((p) => ({ label: p.name, detail: `por ${p.group}`, action: () => gvNewBoard(p) })));
    },
  });
}

function gvBoardMenu(board, pos) {
  showMenu(pos, [
    { label: '✏️ Renombrar', action: () => promptText({ placeholder: 'Nombre del tablero', initial: board.name, action: 'Guardar', onSubmit: (v) => { if (v.trim()) { board.name = v.trim(); gvBoardSave(); } } }) },
    { label: '↔ Orden de columnas…', action: () => promptText({ placeholder: 'Columnas separadas por comas, en orden', initial: gvBoardColumns(gvNotes(board.src), board).filter((c) => c.value).map((c) => c.value).join(', '), action: 'Guardar', onSubmit: (v) => { board.columns = splitList(v); gvBoardSave(); } }) },
    { label: '⧉ Duplicar', action: () => gvNewBoard({ ...board, name: `${board.name} (copia)` }) },
    { label: '🗑 Borrar el tablero', danger: true, action: () => {
      const cfg = gvCfg();
      cfg.boards = cfg.boards.filter((b) => b !== board);
      gvSetOpt('tableros', { open: cfg.boards[0]?.id || '' });
      showToastMessage('Tablero borrado. Las notas no cambian.');
    } },
  ]);
}

// =========================================================
// ▦ Matriz
// =========================================================
function renderMatriz() {
  const box = $('#view-matriz');
  if (!box) return;
  const src = gvOpt('matriz', 'src', { t: 'all' });
  const xk = gvOpt('matriz', 'x', 'area');
  const yk = gvOpt('matriz', 'y', 'estado');
  const show = gvOpt('matriz', 'show', 'nombre');
  const notes = gvNotes(src);
  const vals = (k) => {
    const c = new Map();
    notes.forEach((n) => {
      const v = gvVal(n, k);
      c.set(v, (c.get(v) || 0) + 1);
    });
    return [...c.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'es', { numeric: true }));
  };
  const xs = vals(xk);
  const ys = vals(yk);
  const cell = new Map();
  notes.forEach((n) => {
    const key = `${gvVal(n, xk)}\u0000${gvVal(n, yk)}`;
    if (!cell.has(key)) cell.set(key, []);
    cell.get(key).push(n);
  });
  const bar = el('div', { className: 'gv-bar' }, [
    gvSourceButton(src, (s) => gvSetOpt('matriz', { src: s })),
    gvBtn([el('span', { className: 'muted' }, 'Columnas: '), xk, ' ▾'], () => gvPickProp(notes, 'Columnas según la propiedad…', (k) => gvSetOpt('matriz', { x: k }))),
    gvBtn([el('span', { className: 'muted' }, 'Filas: '), yk, ' ▾'], () => gvPickProp(notes, 'Filas según la propiedad…', (k) => gvSetOpt('matriz', { y: k }))),
    gvBtn('⇄ Cambiar ejes', () => gvSetOpt('matriz', { x: yk, y: xk })),
    gvSeg([['nombre', 'Tarjetas'], ['cuenta', 'Solo números']], show, (v) => gvSetOpt('matriz', { show: v })),
    el('span', { className: 'gv-spacer' }),
    el('span', { className: 'muted gv-count' }, plural(notes.length, 'nota', 'notas')),
  ]);
  const max = Math.max(1, ...[...cell.values()].map((l) => l.length));
  const head = el('tr', {}, [el('th', { className: 'gvm-corner' }, `${yk} \\ ${xk}`), ...xs.map((x) => el('th', { scope: 'col' }, [x || `Sin ${xk}`, el('span', { className: 'gvm-total' }, String(notes.filter((n) => gvVal(n, xk) === x).length))]))]);
  const rows = ys.map((y) => el('tr', {}, [
    el('th', { scope: 'row' }, [y || `Sin ${yk}`, el('span', { className: 'gvm-total' }, String(notes.filter((n) => gvVal(n, yk) === y).length))]),
    ...xs.map((x) => {
      const list = sortNotesBy([...(cell.get(`${x}\u0000${y}`) || [])], 'nombre', false);
      const td = el('td', { className: 'gvm-cell' });
      td.dataset.x = x;
      td.dataset.y = y;
      td.style.setProperty('--heat', String(list.length / max));
      if (show === 'cuenta') {
        const b = gvBtn(list.length ? String(list.length) : '·', () => list.length && gvCellList(list, `${xk}: ${x || '—'} · ${yk}: ${y || '—'}`), 'gvm-num');
        td.append(b);
      } else {
        list.slice(0, 40).forEach((n) => td.append(gvMatrixCard(n, xk, yk)));
        if (list.length > 40) td.append(gvBtn(`y ${list.length - 40} más…`, () => gvCellList(list, `${xk}: ${x || '—'} · ${yk}: ${y || '—'}`), 'link'));
      }
      return td;
    }),
  ]));
  box.replaceChildren(
    gvHead('matriz', 'Cada casilla junta las notas con esos dos valores. Arrastra una tarjeta a otra casilla y la nota cambia las dos propiedades. El color indica cuántas notas hay.'),
    bar,
    notes.length ? el('div', { className: 'gvm-wrap gv-fill' }, el('table', { className: 'gvm' }, [el('thead', {}, head), el('tbody', {}, rows)])) : el('p', { className: 'empty' }, 'No hay notas en este origen.')
  );
}

function gvMatrixCard(n, xk, yk) {
  const card = el('div', { className: 'gvm-card', title: n.path, tabIndex: 0 }, baseName(n.path));
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    e.preventDefault();
    cardDrag(e, card, {
      targets: '.gvm-cell',
      onDrop: (td) => gvSetProps(n, [[xk, td.dataset.x], [yk, td.dataset.y]]),
      onClick: () => gvOpen(n, e),
    });
  });
  card.addEventListener('click', (e) => e.detail === 0 && gvOpen(n, e));
  card.addEventListener('keydown', (e) => e.key === 'Enter' && gvOpen(n, e));
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMenu({ x: e.clientX, y: e.clientY }, [
      { label: 'Abrir', action: () => gvOpen(n) },
      { label: `Cambiar ${xk}…`, action: () => promptText({ placeholder: xk, initial: gvVal(n, xk), action: 'Guardar', onSubmit: (v) => gvSetProps(n, [[xk, v.trim()]]) }) },
      { label: `Cambiar ${yk}…`, action: () => promptText({ placeholder: yk, initial: gvVal(n, yk), action: 'Guardar', onSubmit: (v) => gvSetProps(n, [[yk, v.trim()]]) }) },
    ]);
  });
  return card;
}

// Lista de notas de una casilla (o de un bloque del mosaico) en el buscador.
function gvCellList(list, title) {
  openPicker({
    placeholder: `${title} · ${plural(list.length, 'nota', 'notas')} (escribe para filtrar)`,
    hint: '<kbd>Enter</kbd> abrir · <kbd>Esc</kbd> cerrar',
    items: (typed) => list.filter((n) => fold(baseName(n.path)).includes(fold(typed))).slice(0, 200).map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => gvOpen(n) })),
  });
}

Object.assign(VIEW_RENDER, { tableros: renderTableros, matriz: renderMatriz });
