'use strict';

// ---------- Iconos ----------
// Trazos sencillos de 24×24 que heredan el color del texto.
const ICONS = {
  files: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3v3H8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V21.5M8 7h8M8 11h6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.6 0-3.4-2.3-5.6-4-7.4-.3 2.2-1.3 3.3-2.4 3.8C13 8.7 11.6 5 9 2c0 4-4 6.6-4 11.4C5 19.3 8 22 12 22z"/>',
  canvas: '<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><rect x="14" y="3" width="7" height="6" rx="1.5"/><path d="M10 6h4M17.5 9v6"/>',
  sparkle: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  review: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  'file-plus': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/>',
  'folder-plus': '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  'panel-left': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  'panel-right': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  read: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="9" cy="18" r="2.5"/><circle cx="19" cy="18" r="2"/><path d="M8.3 7l7.4.6M7 8.3l1.5 7.3M11.3 17.2l5.8.6M17.7 10.4l.9 5.6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
};

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function paintIcons(root = document) {
  root.querySelectorAll('.ico[data-icon]').forEach((n) => {
    if (n.dataset.painted !== n.dataset.icon) {
      n.innerHTML = iconSvg(n.dataset.icon);
      n.dataset.painted = n.dataset.icon;
    }
  });
}

const ico = (name) => {
  const s = el('span', { className: 'ico' });
  s.dataset.icon = name;
  s.innerHTML = iconSvg(name);
  s.dataset.painted = name;
  return s;
};

// ---------- Rutas de notas ----------
const baseName = (path) => path.split('/').pop();
const folderOf = (path) => path.split('/').slice(0, -1).join('/');
const joinPath = (folder, name) => (folder ? `${folder}/${name}` : name);
const cleanName = (s) => s.replace(/[\\/:*?"<>|[\]#^]/g, ' ').replace(/\s+/g, ' ').trim();

// Índice de notas por ruta, por nombre y por id. Se rehace cuando cambian los datos (dataRev)
// o la lista de notas; cada acierto se comprueba, así que un índice viejo nunca da una nota equivocada.
const noteIndex = { key: '', list: null, byPath: new Map(), byName: new Map(), byId: new Map(), resolved: new Map() };

function notesIndexed() {
  const key = `${dataRev}:${state.notes.length}`;
  if (noteIndex.key === key && noteIndex.list === state.notes) return noteIndex;
  noteIndex.key = key;
  noteIndex.list = state.notes;
  noteIndex.byPath = new Map();
  noteIndex.byName = new Map();
  noteIndex.byId = new Map();
  noteIndex.resolved = new Map();
  for (const x of state.notes) {
    const lower = x.path.toLowerCase();
    if (!noteIndex.byPath.has(lower)) noteIndex.byPath.set(lower, x);
    const name = baseName(lower);
    if (!noteIndex.byName.has(name)) noteIndex.byName.set(name, x);
    noteIndex.byId.set(x.id, x);
  }
  return noteIndex;
}

function findNoteByName(name) {
  const idx = notesIndexed();
  // Los enlaces se repiten mucho (grafo, enlaces entrantes): cada texto se resuelve una vez por versión.
  if (idx.resolved.has(name)) return idx.resolved.get(name);
  const found = resolveNoteName(name, idx);
  idx.resolved.set(name, found);
  return found;
}

function resolveNoteName(name, idx) {
  const n = name.trim().replace(/\.md$/i, '').toLowerCase();
  if (!n) return null;
  const hit = idx.byPath.get(n) || idx.byName.get(n);
  // Sin acierto, el índice (que se rehace al cambiar rutas) es fiable: no hay tal nota.
  if (!hit) return null;
  if (hit.path.toLowerCase() === n || baseName(hit.path).toLowerCase() === n) return hit;
  return state.notes.find((x) => x.path.toLowerCase() === n) || state.notes.find((x) => baseName(x.path).toLowerCase() === n) || null;
}

function noteById(id) {
  const hit = notesIndexed().byId.get(id);
  return hit && hit.id === id ? hit : state.notes.find((n) => n.id === id);
}

function allFolders() {
  const set = new Set(state.folders);
  state.notes.forEach((n) => {
    const parts = n.path.split('/').slice(0, -1);
    parts.forEach((_, i) => set.add(parts.slice(0, i + 1).join('/')));
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

function uniquePath(folder, name) {
  let candidate = joinPath(folder, name);
  let k = 2;
  while (state.notes.some((n) => n.path.toLowerCase() === candidate.toLowerCase())) candidate = joinPath(folder, `${name} ${k++}`);
  return candidate;
}

// Enlaces [[...]] de un texto, sin contar los que están dentro de bloques de código.
// Los resultados se recuerdan por texto: el grafo, los enlaces entrantes y las consultas
// vuelven a pedir los mismos cuerpos de nota muchas veces.
const parseMemo = { links: new Map(), tags: new Map() };
function memoBy(map, body, fn) {
  let v = map.get(body);
  if (v === undefined) {
    if (map.size > 8000) map.clear();
    v = fn(body);
    map.set(body, v);
  }
  return v;
}

function linksIn(body) {
  return memoBy(parseMemo.links, body, parseLinks);
}

function tagsIn(body) {
  return memoBy(parseMemo.tags, body, parseTags);
}

function parseLinks(body) {
  const out = [];
  let inCode = false;
  body.split('\n').forEach((line, idx) => {
    if (/^```/.test(line)) inCode = !inCode;
    if (inCode) return;
    // El código entre comillas invertidas no cuenta como enlace.
    const plain = line.replace(/`[^`]*`/g, (c) => ' '.repeat(c.length));
    for (const m of plain.matchAll(WIKILINK_RE)) out.push({ ...parseWikiInner(m[2]), line: idx, text: line, embed: !!m[1] });
  });
  return out;
}

function parseTags(body) {
  const tags = new Set();
  let inCode = false;
  body.split('\n').forEach((line) => {
    if (/^```/.test(line)) inCode = !inCode;
    if (inCode) return;
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/(^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu)) tags.add(m[2].toLowerCase());
  });
  return [...tags];
}

function headingsIn(body) {
  const out = [];
  const ids = new Map();
  let inCode = false;
  body.split('\n').forEach((line, idx) => {
    if (/^```/.test(line)) inCode = !inCode;
    const m = !inCode && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) return;
    let id = `h-${slugify(m[2]) || 'seccion'}`;
    const n = ids.get(id) || 0;
    ids.set(id, n + 1);
    if (n) id += `-${n}`;
    out.push({ level: m[1].length, text: m[2], line: idx, id });
  });
  return out;
}

// ---------- Crear, renombrar, mover y borrar ----------
function createNote({ folder = '', title = 'Sin título', body = '', open = true, newTab = false, edit = true, log = true } = {}) {
  const note = { id: uid(), path: uniquePath(folder, cleanName(title) || 'Sin título'), body, createdAt: Date.now(), updatedAt: Date.now() };
  state.notes.push(note);
  if (log) logEvent('note', `Nueva nota: ${baseName(note.path)}`, { ref: note.id });
  save();
  if (open) {
    noteMode.set(note.id, edit ? 'edit' : 'read');
    openTab({ type: 'note', id: note.id }, { newTab });
    // Una nota sin nombre empieza por el título; las demás, por el texto.
    if (edit && /^Sin título/.test(baseName(note.path))) {
      $('#note-title').focus();
      $('#note-title').select();
    } else if (edit) {
      const ta = $('#note-editor');
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }
  return note;
}

// Cambia los [[enlaces]] que apuntan a una nota cuando cambia de nombre o de carpeta.
function relinkAll(oldPath, newPath) {
  const oldBase = baseName(oldPath).toLowerCase();
  const oldFull = oldPath.toLowerCase();
  let changed = 0;
  state.notes.forEach((n) => {
    const body = n.body.replace(/(!?\[\[)([^\]|#\n]+)((?:#[^\]|\n]*)?)((?:\|[^\]\n]*)?)\]\]/g, (m, open, target, head, alias) => {
      const t = target.trim().toLowerCase();
      if (t === oldFull) return `${open}${newPath}${head}${alias}]]`;
      // Enlace por nombre: se actualiza si ya no queda otra nota con el nombre antiguo.
      if (t === oldBase && !findNoteByName(target)) return `${open}${baseName(newPath)}${head}${alias}]]`;
      return m;
    });
    if (body !== n.body) {
      n.body = body;
      n.updatedAt = Date.now();
      changed++;
    }
  });
  return changed;
}

function movePath(note, newPath) {
  if (newPath === note.path) return true;
  if (state.notes.some((n) => n !== note && n.path.toLowerCase() === newPath.toLowerCase())) {
    showToastMessage(`Ya existe una nota llamada «${baseName(newPath)}» en esa carpeta.`);
    return false;
  }
  const oldPath = note.path;
  note.path = newPath;
  noteIndex.key = '';
  note.updatedAt = Date.now();
  const changed = relinkAll(oldPath, newPath);
  save();
  renderAll();
  if (changed) showToastMessage(`Enlaces actualizados en ${plural(changed, 'nota', 'notas')}.`);
  return true;
}

function renameNote(note, title) {
  const name = cleanName(title);
  if (!name || name === baseName(note.path)) return false;
  return movePath(note, joinPath(folderOf(note.path), name));
}

function deleteNote(note) {
  withUndo(`Nota «${baseName(note.path)}» eliminada`, () => {
    state.notes = state.notes.filter((n) => n.id !== note.id);
  });
}

// ---------- Pestañas del espacio de trabajo ----------
const TABS_KEY = 'enfoque:tabs';
const VIEW_TITLES = { today: 'Hoy', tasks: 'Tareas', projects: 'Proyectos', journal: 'Diario', ideas: 'Ideas', timer: 'Pomodoro', habits: 'Hábitos', progress: 'Progreso', review: 'Revisión semanal', ask: 'Preguntar', canvas: 'Lienzos', settings: 'Ajustes' };
const VIEW_ICONS = { today: 'sun', tasks: 'check', projects: 'briefcase', journal: 'book', ideas: 'bulb', timer: 'timer', habits: 'flame', progress: 'chart', review: 'review', ask: 'sparkle', canvas: 'canvas', settings: 'gear' };
const noteMode = new Map(); // id -> 'edit' | 'read'
let ws = { tabs: [{ type: 'view', view: 'today' }], active: 0 };
try {
  const saved = JSON.parse(localStorage.getItem(TABS_KEY));
  if (saved?.tabs?.length) ws = saved;
} catch {
  // Sin almacenamiento: se empieza con la pestaña Hoy.
}

const saveTabs = () => {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(ws));
  } catch {
    // Sin almacenamiento: las pestañas no se recuerdan.
  }
};
const sameTab = (a, b) => a.type === b.type && (a.type === 'note' ? a.id === b.id : a.type === 'view' ? a.view === b.view : true);
const activeTab = () => ws.tabs[ws.active];
const activeNote = () => (activeTab()?.type === 'note' ? noteById(activeTab().id) : null);

function openTab(tab, { newTab = false } = {}) {
  const found = ws.tabs.findIndex((t) => sameTab(t, tab));
  if (found >= 0) ws.active = found;
  else {
    const cur = activeTab();
    if (!newTab && cur && cur.type === tab.type) ws.tabs[ws.active] = tab;
    else {
      ws.tabs.splice(ws.active + 1, 0, tab);
      ws.active += 1;
    }
  }
  saveTabs();
  closeDrawers();
  renderWorkspace();
}

function closeTab(i) {
  ws.tabs.splice(i, 1);
  if (!ws.tabs.length) ws.tabs = [{ type: 'view', view: 'today' }];
  if (i < ws.active || ws.active >= ws.tabs.length) ws.active = Math.max(0, ws.active - 1);
  saveTabs();
  renderWorkspace();
}

function openNote(note, { newTab = false, heading = '' } = {}) {
  openTab({ type: 'note', id: note.id }, { newTab });
  if (heading) scrollToHeading(note, heading);
}

function openNoteByLink(target, { heading = '', newTab = false, fromNote = null } = {}) {
  if (!target && heading && fromNote) return scrollToHeading(fromNote, heading);
  const note = findNoteByName(target);
  if (note) return openNote(note, { newTab, heading });
  // Un enlace a una nota que no existe la crea (si trae carpeta, en esa carpeta).
  const created = createNote({ folder: folderOf(target), title: baseName(target), body: '', newTab, edit: true });
  return created;
}

// ---------- Paneles laterales ----------
const PANELS_KEY = 'enfoque:panels';
let panels = { left: true, right: true, lpane: 'files', rpane: 'backlinks' };
try {
  panels = { ...panels, ...JSON.parse(localStorage.getItem(PANELS_KEY)) };
} catch {
  // Valores por defecto.
}
const savePanels = () => {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
  } catch {
    // Sin almacenamiento.
  }
};
const isNarrow = () => window.matchMedia('(max-width: 899px)').matches;

function applyPanels() {
  const app = $('#app');
  app.classList.toggle('left-collapsed', !panels.left);
  app.classList.toggle('right-collapsed', !panels.right);
  $$('[data-lpane]').forEach((b) => b.classList.toggle('active', b.dataset.lpane === panels.lpane));
  $$('[data-rpane]').forEach((b) => b.classList.toggle('active', b.dataset.rpane === panels.rpane));
  $('#lp-files').hidden = panels.lpane !== 'files';
  $('#lp-search').hidden = panels.lpane !== 'search';
  $('#lp-tags').hidden = panels.lpane !== 'tags';
  $('#rp-backlinks').hidden = panels.rpane !== 'backlinks';
  $('#rp-outline').hidden = panels.rpane !== 'outline';
  $('#rp-graph').hidden = panels.rpane !== 'graph';
}

function toggleSide(side) {
  if (isNarrow()) {
    const open = !document.body.classList.contains(`${side}-open`);
    closeDrawers();
    document.body.classList.toggle(`${side}-open`, open);
    $('#scrim').hidden = !open;
    return;
  }
  panels[side] = !panels[side];
  savePanels();
  applyPanels();
}

function closeDrawers() {
  document.body.classList.remove('left-open', 'right-open');
  $('#scrim').hidden = true;
}

function showLeftPane(name) {
  panels.lpane = name;
  if (!isNarrow()) panels.left = true;
  savePanels();
  applyPanels();
  if (isNarrow() && !document.body.classList.contains('left-open')) toggleSide('left');
  renderSidePanes();
}

$$('[data-lpane]').forEach((b) => b.addEventListener('click', () => showLeftPane(b.dataset.lpane)));
$$('[data-rpane]').forEach((b) =>
  b.addEventListener('click', () => {
    panels.rpane = b.dataset.rpane;
    savePanels();
    applyPanels();
    renderRightPanel();
  })
);
$('#toggle-left').addEventListener('click', () => toggleSide('left'));
$('#toggle-right').addEventListener('click', () => toggleSide('right'));
$('#toggle-right-desk').addEventListener('click', () => toggleSide('right'));
$('#close-left').addEventListener('click', closeDrawers);
$('#close-right').addEventListener('click', closeDrawers);
$('#scrim').addEventListener('click', closeDrawers);
$('#rib-files').addEventListener('click', () => {
  if (isNarrow()) return showLeftPane('files');
  if (panels.left && panels.lpane === 'files') toggleSide('left');
  else showLeftPane('files');
});
$('#rib-daily').addEventListener('click', () => openDailyNote());
$('#rib-switcher').addEventListener('click', () => openSwitcher());
$('#rib-palette').addEventListener('click', () => openPalette());
$('#new-note').addEventListener('click', () => createNote({ folder: activeNote() ? folderOf(activeNote().path) : '' }));
$('#ws-new-tab').addEventListener('click', () => createNote({ newTab: true }));
$('#new-folder').addEventListener('click', () => promptText({ placeholder: 'Nombre de la carpeta (p. ej. Trabajo/Clientes)', action: 'Crear carpeta', onSubmit: createFolder }));
$$('.rib[data-view]').forEach((b) => b.addEventListener('click', (e) => showView(b.dataset.view, { newTab: e.ctrlKey || e.metaKey })));

// ---------- Explorador de archivos ----------
const COLLAPSED_KEY = 'enfoque:collapsed';
let collapsedFolders = new Set();
try {
  collapsedFolders = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || []);
} catch {
  // Todas desplegadas.
}

function createFolder(name) {
  const path = name.split('/').map(cleanName).filter(Boolean).join('/');
  if (!path) return;
  if (!state.folders.includes(path)) state.folders.push(path);
  collapsedFolders.delete(path);
  save();
  renderSidePanes();
  showLeftPane('files');
}

function renameFolder(oldPath, newName) {
  const newPath = joinPath(folderOf(oldPath), cleanName(newName));
  if (!cleanName(newName) || newPath === oldPath) return;
  const prefix = `${oldPath}/`;
  state.notes.forEach((n) => {
    if (n.path.startsWith(prefix)) {
      const p = newPath + n.path.slice(oldPath.length);
      relinkAll(n.path, p);
      n.path = p;
      noteIndex.key = '';
    }
  });
  state.folders = state.folders.map((f) => (f === oldPath || f.startsWith(prefix) ? newPath + f.slice(oldPath.length) : f));
  save();
  renderAll();
}

function deleteFolder(path) {
  const prefix = `${path}/`;
  const inside = state.notes.filter((n) => n.path.startsWith(prefix)).length;
  withUndo(inside ? `Carpeta «${baseName(path)}» y ${plural(inside, 'nota', 'notas')} eliminadas` : `Carpeta «${baseName(path)}» eliminada`, () => {
    state.notes = state.notes.filter((n) => !n.path.startsWith(prefix));
    state.folders = state.folders.filter((f) => f !== path && !f.startsWith(prefix));
  });
}

function moveNoteToFolder(note, folder) {
  movePath(note, joinPath(folder, baseName(note.path)));
}

let treeKey = '';

function renderTree() {
  const current = activeNote();
  const folders = allFolders();
  // Si no cambió ninguna ruta, ni la nota activa, ni las carpetas plegadas, el árbol se deja como está.
  const key = [[...collapsedFolders].join('|'), folders.join('|'), state.notes.map((n) => n.path).join('\n')].join('\u0000');
  if (key === treeKey && $('#file-tree').childElementCount) {
    // Solo cambió la nota abierta: se mueve el resaltado.
    $$('#file-tree .tree-row.file.active').forEach((r) => r.classList.remove('active'));
    if (current) $(`#file-tree .tree-row.file[data-id="${CSS.escape(current.id)}"]`)?.classList.add('active');
    return;
  }
  treeKey = key;
  // Notas agrupadas por carpeta y número de notas dentro de cada carpeta (subcarpetas incluidas).
  const byFolder = new Map();
  const counts = new Map();
  for (const n of state.notes) {
    const f = folderOf(n.path);
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f).push(n);
    for (let i = f.indexOf('/'); ; i = f.indexOf('/', i + 1)) {
      const part = i < 0 ? f : f.slice(0, i);
      if (part) counts.set(part, (counts.get(part) || 0) + 1);
      if (i < 0) break;
    }
  }
  const build = (folder, depth) => {
    const nodes = [];
    folders
      .filter((f) => folderOf(f) === folder)
      .forEach((f) => {
        const open = !collapsedFolders.has(f);
        const count = counts.get(f) || 0;
        const row = el('div', { className: 'tree-row folder', role: 'treeitem', ariaExpanded: String(open), title: f, tabIndex: 0 }, [
          el('span', { className: `chev${open ? ' open' : ''}` }, ico('chevron')),
          el('span', { className: 'tree-name' }, baseName(f)),
          el('span', { className: 'tree-count' }, count ? String(count) : ''),
        ]);
        row.style.paddingLeft = `${8 + depth * 14}px`;
        const more = el('button', { className: 'tree-more', title: 'Opciones de la carpeta', ariaLabel: `Opciones de ${baseName(f)}` }, ico('more'));
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          showMenu(more, [
            { label: 'Nueva nota aquí', action: () => createNote({ folder: f }) },
            { label: 'Ver como tabla', action: () => openFolderTable(f) },
            { label: 'Nueva subcarpeta', action: () => promptText({ placeholder: 'Nombre de la subcarpeta', action: 'Crear carpeta', onSubmit: (v) => createFolder(joinPath(f, v)) }) },
            { label: 'Renombrar', action: () => promptText({ placeholder: 'Nuevo nombre', initial: baseName(f), action: 'Renombrar', onSubmit: (v) => renameFolder(f, v) }) },
            { label: 'Eliminar carpeta', danger: true, action: () => deleteFolder(f) },
          ]);
        });
        row.append(more);
        const toggle = () => {
          if (open) collapsedFolders.add(f);
          else collapsedFolders.delete(f);
          try {
            localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedFolders]));
          } catch {
            // Sin almacenamiento.
          }
          renderTree();
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        });
        dropTarget(row, f);
        nodes.push(row);
        if (open) nodes.push(...build(f, depth + 1));
      });
    (byFolder.get(folder) || [])
      .slice()
      .sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), 'es', { numeric: true }))
      .forEach((n) => {
        const row = el('button', { className: `tree-row file${current && current.id === n.id ? ' active' : ''}`, role: 'treeitem', title: n.path, draggable: true }, [
          el('span', { className: 'tree-name' }, baseName(n.path)),
        ]);
        row.dataset.id = n.id;
        row.style.paddingLeft = `${22 + depth * 14}px`;
        row.addEventListener('click', (e) => openNote(n, { newTab: e.ctrlKey || e.metaKey }));
        row.addEventListener('auxclick', (e) => {
          if (e.button === 1) openNote(n, { newTab: true });
        });
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/x-note', n.id);
          e.dataTransfer.effectAllowed = 'move';
        });
        nodes.push(row);
      });
    return nodes;
  };
  const tree = $('#file-tree');
  tree.replaceChildren(...build('', 0));
  if (!state.notes.length && !folders.length) tree.append(el('p', { className: 'muted side-empty' }, 'Aún no hay notas. Crea una con el botón + o abre la nota diaria.'));
  dropTarget(tree, '');
}

function dropTarget(node, folder) {
  node.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('text/x-note')) return;
    e.preventDefault();
    e.stopPropagation();
    node.classList.add('drop');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop'));
  node.addEventListener('drop', (e) => {
    const id = e.dataTransfer.getData('text/x-note');
    node.classList.remove('drop');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    const note = noteById(id);
    if (note) moveNoteToFolder(note, folder);
  });
}

// ---------- Búsqueda y etiquetas ----------
let searchTimer = null;
$('#note-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderSearch, 150);
});

function highlight(text, terms) {
  let html = escHtml(text);
  terms.filter(Boolean).forEach((t) => {
    const re = new RegExp(`(${escHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    html = html.replace(re, '<mark>$1</mark>');
  });
  return html;
}

function renderSearch() {
  const q = $('#note-search').value.trim().toLowerCase();
  const box = $('#search-results');
  if (!q) {
    box.replaceChildren(el('p', { className: 'muted side-empty' }, 'Escribe para buscar en títulos y contenido. Usa #etiqueta para filtrar por etiqueta.'));
    return;
  }
  const terms = q.split(/\s+/);
  const tagTerms = terms.filter((t) => t.startsWith('#')).map((t) => t.slice(1));
  const words = terms.filter((t) => !t.startsWith('#'));
  const results = state.notes
    .filter((n) => {
      const hay = `${n.path}\n${n.body}`.toLowerCase();
      const tags = tagsIn(n.body);
      return words.every((w) => hay.includes(w)) && tagTerms.every((t) => tags.some((x) => x === t || x.startsWith(`${t}/`)));
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  box.replaceChildren(
    el('p', { className: 'muted search-count' }, plural(results.length, 'resultado', 'resultados')),
    ...results.map((n) => {
      const lines = n.body.split('\n').filter((l) => terms.some((t) => l.toLowerCase().includes(t))).slice(0, 3);
      const item = el('button', { className: 'search-hit' });
      item.innerHTML = `<span class="sh-title">${highlight(baseName(n.path), words)}</span>${folderOf(n.path) ? `<span class="sh-path">${escHtml(folderOf(n.path))}</span>` : ''}${lines.map((l) => `<span class="sh-line">${highlight(l.trim().slice(0, 140), terms)}</span>`).join('')}`;
      item.addEventListener('click', (e) => openNote(n, { newTab: e.ctrlKey || e.metaKey }));
      return item;
    })
  );
}

function searchTag(tag) {
  $('#note-search').value = `#${tag}`;
  showLeftPane('search');
  renderSearch();
}

function renderTagPane() {
  const counts = new Map();
  state.notes.forEach((n) => tagsIn(n.body).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const list = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  $('#tag-pane').replaceChildren(
    ...(list.length
      ? list.map(([t, c]) => {
          const b = el('button', { className: 'tag-row' }, [el('span', {}, `#${t}`), el('span', { className: 'tree-count' }, String(c))]);
          b.addEventListener('click', () => searchTag(t));
          return b;
        })
      : [el('p', { className: 'muted side-empty' }, 'Escribe #etiquetas en tus notas y aparecerán aquí.')])
  );
}

function renderSidePanes() {
  renderTree();
  if (panels.lpane === 'search') renderSearch();
  if (panels.lpane === 'tags') renderTagPane();
}

// ---------- Panel derecho: enlaces y esquema ----------
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function backlinksOf(note) {
  const linked = [];
  const unlinked = [];
  const title = baseName(note.path);
  const mention = title.length >= 3 ? new RegExp(`(?<![\\p{L}\\p{N}])${escRe(title)}(?![\\p{L}\\p{N}])`, 'iu') : null;
  state.notes.forEach((n) => {
    if (n.id === note.id) return;
    const hits = linksIn(n.body).filter((l) => l.target && findNoteByName(l.target)?.id === note.id);
    if (hits.length) linked.push({ note: n, lines: [...new Set(hits.map((h) => h.line))].map((i) => ({ i, text: n.body.split('\n')[i] })) });
    else if (mention) {
      const lines = n.body.split('\n').map((text, i) => ({ i, text })).filter((l) => mention.test(l.text.replace(WIKILINK_RE, '')));
      if (lines.length) unlinked.push({ note: n, lines });
    }
  });
  return { linked, unlinked };
}

// Convierte la primera mención (fuera de enlaces) de un título en [[enlace]].
function linkMention(n, lineIdx, title) {
  const lines = n.body.split('\n');
  const parts = lines[lineIdx].split(/(!?\[\[[^\]\n]+?\]\])/);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escRe(title)})(?![\\p{L}\\p{N}])`, 'iu');
  let done = false;
  lines[lineIdx] = parts.map((p, k) => (done || k % 2 ? p : p.replace(re, (m) => ((done = true), `[[${title}${m !== title ? `|${m}` : ''}]]`)))).join('');
  n.body = lines.join('\n');
  n.updatedAt = Date.now();
  save();
  renderAll();
}

function renderRightPanel() {
  const note = activeNote();
  const bl = $('#rp-backlinks');
  const ol = $('#rp-outline');
  if (!note) {
    renderLocalGraph();
    bl.replaceChildren(el('p', { className: 'muted side-empty' }, 'Abre una nota para ver qué otras notas la enlazan.'));
    ol.replaceChildren(el('p', { className: 'muted side-empty' }, 'Abre una nota para ver sus títulos.'));
    return;
  }
  const { linked, unlinked } = backlinksOf(note);
  const group = (title, items, withButton) => {
    const box = el('section', { className: 'bl-group' }, el('h4', { className: 'bl-head' }, `${title} · ${items.length}`));
    if (!items.length) box.append(el('p', { className: 'muted side-empty' }, withButton ? 'Ninguna nota menciona este título sin enlazarlo.' : 'Ninguna nota enlaza aquí todavía. Escribe [[' + baseName(note.path) + ']] en otra nota.'));
    items.forEach(({ note: n, lines }) => {
      const head = el('button', { className: 'bl-note' }, [ico('note'), el('span', {}, baseName(n.path))]);
      head.addEventListener('click', (e) => openNote(n, { newTab: e.ctrlKey || e.metaKey }));
      box.append(head);
      lines.slice(0, 4).forEach(({ i, text }) => {
        const row = el('div', { className: 'bl-line md' });
        row.innerHTML = inlineMd(text.trim().slice(0, 220));
        if (withButton) {
          const link = el('button', { className: 'link bl-link' }, 'Enlazar');
          link.addEventListener('click', () => linkMention(n, i, baseName(note.path)));
          row.append(' ', link);
        }
        box.append(row);
      });
    });
    return box;
  };
  bl.replaceChildren(group('Enlaces entrantes', linked, false), group('Menciones sin enlazar', unlinked, true));

  renderLocalGraph();
  const heads = headingsIn(note.body);
  ol.replaceChildren(
    ...(heads.length
      ? heads.map((h) => {
          const b = el('button', { className: `ol-item lvl-${Math.min(h.level, 4)}` }, h.text);
          b.addEventListener('click', () => scrollToHeading(note, h.text));
          return b;
        })
      : [el('p', { className: 'muted side-empty' }, 'Esta nota no tiene títulos. Empieza una línea con # para crear uno.')])
  );
}

function scrollToHeading(note, heading) {
  const h = headingsIn(note.body).find((x) => x.text.toLowerCase() === heading.toLowerCase());
  if (!h) return;
  if (noteMode.get(note.id) === 'edit') {
    const ta = $('#note-editor');
    const pos = note.body.split('\n').slice(0, h.line).join('\n').length + (h.line ? 1 : 0);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(pos, pos);
    const scroller = $('#note-scroll');
    scroller.scrollTop = ta.offsetTop + (h.line / Math.max(1, note.body.split('\n').length)) * ta.scrollHeight - 40;
  } else {
    setTimeout(() => document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

// ---------- Editor ----------
let noteSaveTimer = null;

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 4}px`;
}

// Texto de una nota. Las notas con contraseña (27-notas-protegidas.js) guardan en `body` solo un
// aviso; su texto real vive cifrado en `enc` y, una vez desbloqueadas, en memoria (unlockedNotes).
const unlockedNotes = new Map();
const noteText = (note) => (note.enc ? unlockedNotes.get(note.id) ?? null : note.body);

// Opciones extra del menú ⋯ de la nota (las añaden otros módulos): (nota) => opción | null.
const NOTE_MENU_EXTRA = [];

function renderNotePane(note) {
  const text = noteText(note);
  const locked = text === null || (lockUI.mode === 'setup' && lockUI.noteId === note.id);
  $('#note-lock').hidden = !locked;
  if (locked) {
    // Nota protegida y bloqueada: se pide la contraseña.
    const folder = folderOf(note.path);
    $('#note-crumbs').replaceChildren(...(folder ? folder.split('/').flatMap((f) => [el('span', {}, f), el('span', { className: 'sep' }, '/')]) : []), el('span', { className: 'crumb-name' }, `🔒 ${baseName(note.path)}`));
    if (document.activeElement !== $('#note-title')) $('#note-title').value = baseName(note.path);
    $('#note-editor').hidden = true;
    $('#note-reading').hidden = true;
    renderLockPanel(note);
    $('#status-note').textContent = text === null ? 'Nota protegida con contraseña' : '';
    return;
  }
  ensureBaseline(note);
  const mode = noteMode.get(note.id) || (text.trim() ? 'read' : 'edit');
  noteMode.set(note.id, mode);
  const folder = folderOf(note.path);
  $('#note-crumbs').replaceChildren(...(folder ? folder.split('/').flatMap((f) => [el('span', {}, f), el('span', { className: 'sep' }, '/')]) : []), el('span', { className: 'crumb-name' }, baseName(note.path)));
  const title = $('#note-title');
  if (document.activeElement !== title) title.value = baseName(note.path);
  const ta = $('#note-editor');
  const reading = $('#note-reading');
  ta.hidden = mode !== 'edit';
  reading.hidden = mode !== 'read';
  const btn = $('#note-mode');
  btn.querySelector('.ico').dataset.icon = mode === 'edit' ? 'read' : 'pencil';
  btn.title = mode === 'edit' ? 'Ver en modo lectura (Ctrl+E)' : 'Editar (Ctrl+E)';
  btn.ariaLabel = btn.title;
  paintIcons(btn);
  if (mode === 'edit') {
    if (ta.dataset.note !== note.id || (document.activeElement !== ta && ta.value !== text)) {
      ta.value = text;
      ta.dataset.note = note.id;
    }
    autosize(ta);
  } else {
    reading.dataset.note = note.id;
    reading.innerHTML = text.trim() ? renderMd(text, { noteId: note.id, noTasks: !!note.enc }) : '<p class="muted">Nota vacía. Haz doble clic o pulsa Ctrl+E para escribir.</p>';
    hydrateQueries(reading, note.id);
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  const { linked } = backlinksOf(note);
  $('#status-note').textContent = `${note.enc ? '🔒 ' : ''}${plural(words, 'palabra', 'palabras')} · ${plural(text.length, 'carácter', 'caracteres')} · ${plural(linked.length, 'enlace entrante', 'enlaces entrantes')}`;
}

function setNoteMode(note, mode) {
  noteMode.set(note.id, mode);
  renderNotePane(note);
  if (mode === 'edit') {
    const ta = $('#note-editor');
    ta.focus({ preventScroll: true });
  }
}

function toggleNoteMode() {
  const note = activeNote();
  if (!note) return;
  flushNoteSave();
  setNoteMode(note, noteMode.get(note.id) === 'edit' ? 'read' : 'edit');
}

function flushNoteSave() {
  if (!noteSaveTimer) return;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = null;
  save();
  renderSidePanes();
  renderRightPanel();
}

$('#note-mode').addEventListener('click', toggleNoteMode);
$('#note-reading').addEventListener('dblclick', (e) => {
  if (e.target.closest('a, input, button, .embed, .query')) return;
  const note = activeNote();
  if (note) setNoteMode(note, 'edit');
});

$('#note-editor').addEventListener('input', (e) => {
  const note = activeNote();
  if (!note) return;
  if (note.enc) {
    // Nota protegida: el texto se queda en memoria y se vuelve a cifrar (nunca se guarda en claro).
    if (!unlockedNotes.has(note.id)) return;
    unlockedNotes.set(note.id, e.target.value);
    scheduleEncrypt(note);
  } else note.body = e.target.value;
  note.updatedAt = Date.now();
  dataRev++;
  autosize(e.target);
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    noteSaveTimer = null;
    save();
    snapshotNote(note);
    renderSidePanes();
    renderRightPanel();
    const text = noteText(note) ?? '';
    const words = text.split(/\s+/).filter(Boolean).length;
    $('#status-note').textContent = `${note.enc ? '🔒 ' : ''}${plural(words, 'palabra', 'palabras')} · ${plural(text.length, 'carácter', 'caracteres')}`;
  }, 500);
  updateSuggest();
});
$('#note-editor').addEventListener('blur', () => {
  flushNoteSave();
  setTimeout(() => {
    if (!$('#link-suggest').matches(':hover')) hideSuggest();
  }, 150);
});

// Enter continúa la lista; Tab sangra; las sugerencias de [[ se manejan con el teclado.
$('#note-editor').addEventListener('keydown', (e) => {
  const ta = e.target;
  if (!$('#link-suggest').hidden && suggestKey(e)) return;
  const { selectionStart: s, selectionEnd: end, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const line = value.slice(lineStart, s);
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && s === end) {
    const m = line.match(/^(\s*)([-*+]|(\d+)([.)]))\s+(\[[ xX/]\]\s+)?/);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[0].trim()) {
      // Línea de lista vacía: se termina la lista.
      ta.setRangeText('', lineStart, s, 'end');
    } else {
      const bullet = m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2];
      ta.setRangeText(`\n${m[1]}${bullet} ${m[5] ? '[ ] ' : ''}`, s, end, 'end');
    }
    ta.dispatchEvent(new Event('input'));
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) {
      const removed = value.slice(lineStart).match(/^( {1,2}|\t)/);
      if (removed) {
        ta.setRangeText('', lineStart, lineStart + removed[0].length, 'preserve');
        ta.setSelectionRange(s - removed[0].length, end - removed[0].length);
      }
    } else if (/^\s*([-*+]|\d+[.)])\s/.test(value.slice(lineStart))) {
      ta.setRangeText('  ', lineStart, lineStart, 'preserve');
      ta.setSelectionRange(s + 2, end + 2);
    } else {
      ta.setRangeText('  ', s, end, 'end');
    }
    ta.dispatchEvent(new Event('input'));
  }
});

$('#note-title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
    const note = activeNote();
    if (note) setNoteMode(note, 'edit');
  } else if (e.key === 'Escape') {
    e.target.value = baseName(activeNote()?.path || '');
    e.target.blur();
  }
});
$('#note-title').addEventListener('change', (e) => {
  const note = activeNote();
  if (!note) return;
  if (!renameNote(note, e.target.value)) e.target.value = baseName(note.path);
});

// Clics en la vista de lectura (también dentro de notas incrustadas).
$('#note-reading').addEventListener('click', (e) => {
  const link = e.target.closest('a.wikilink');
  if (link) {
    e.preventDefault();
    openNoteByLink(link.dataset.target, { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey, fromNote: activeNote() });
    return;
  }
  const tag = e.target.closest('a.tag-link');
  if (tag) {
    e.preventDefault();
    searchTag(tag.dataset.tag);
    return;
  }
  const box = e.target.closest('input.task-check');
  if (box) {
    // Pasa por el mismo camino que en Tareas: fecha de completada, estadísticas y bitácora.
    toggleNoteTask(box.closest('[data-note]').dataset.note, Number(box.dataset.line), box.checked);
  }
});

// Los enlaces del panel derecho y de los resultados también navegan.
$('#rp-backlinks').addEventListener('click', (e) => {
  const link = e.target.closest('a.wikilink');
  if (link) {
    e.preventDefault();
    openNoteByLink(link.dataset.target, { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey });
  }
  const tag = e.target.closest('a.tag-link');
  if (tag) {
    e.preventDefault();
    searchTag(tag.dataset.tag);
  }
});

$('#note-more').addEventListener('click', () => {
  const note = activeNote();
  if (!note) return;
  showMenu($('#note-more'), [
    { label: 'Renombrar', action: () => $('#note-title').select() },
    { label: 'Mover a carpeta…', action: () => pickFolder(note) },
    { label: 'Abrir en pestaña nueva', action: () => openNote(note, { newTab: true }) },
    { label: 'Copiar enlace [[…]]', action: () => copyText(`[[${baseName(note.path)}]]`, 'Enlace copiado') },
    { label: 'Insertar plantilla…', action: insertTemplate },
    { label: 'Crear mapa mental de esta nota', action: () => mapFromNote(note) },
    { label: 'Ver en el grafo', action: () => {
      panels.rpane = 'graph';
      if (!isNarrow()) panels.right = true;
      savePanels();
      applyPanels();
      if (isNarrow()) toggleSide('right');
      renderRightPanel();
    } },
    ...NOTE_MENU_EXTRA.map((f) => f(note)).filter(Boolean),
    ...(note.enc ? [] : [{ label: 'Duplicar', action: () => createNote({ folder: folderOf(note.path), title: `${baseName(note.path)} (copia)`, body: note.body, edit: false }) }]),
    { label: 'Eliminar nota', danger: true, action: () => deleteNote(note) },
  ]);
});

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    showToastMessage(done);
  } catch {
    showToastMessage(`No se pudo copiar. Escribe ${text} a mano.`);
  }
}

// ---------- Sugerencias al escribir [[ ----------
let suggestState = null;

// Coordenadas del cursor en el textarea, con un "espejo" que copia su estilo.
function caretCoords(ta, pos) {
  const mirror = document.createElement('div');
  const cs = getComputedStyle(ta);
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap', 'tabSize'].forEach((p) => (mirror.style[p] = cs[p]));
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', wordWrap: 'break-word', width: `${ta.clientWidth}px`, top: '0', left: '-9999px' });
  mirror.textContent = ta.value.slice(0, pos);
  const mark = el('span', {}, '​');
  mirror.append(mark);
  document.body.append(mirror);
  const r = ta.getBoundingClientRect();
  const top = r.top + mark.offsetTop - ta.scrollTop;
  const left = r.left + mark.offsetLeft;
  const lh = parseFloat(cs.lineHeight) || 22;
  mirror.remove();
  return { top, left, lh };
}

function updateSuggest() {
  const ta = $('#note-editor');
  const before = ta.value.slice(0, ta.selectionStart);
  const m = before.match(/\[\[([^\]\n|#]*)$/);
  // Sin [[ abierto, quizá es un comando «/» (24-comando-barra.js).
  if (!m) return slashSuggest(ta, before);
  const q = m[1].toLowerCase();
  const current = activeNote();
  const items = state.notes
    .filter((n) => n !== current && (baseName(n.path).toLowerCase().includes(q) || n.path.toLowerCase().includes(q)))
    .sort((a, b) => (baseName(b.path).toLowerCase().startsWith(q) ? 1 : 0) - (baseName(a.path).toLowerCase().startsWith(q) ? 1 : 0) || b.updatedAt - a.updatedAt)
    .slice(0, 8)
    .map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), insert: baseName(n.path) }));
  if (m[1].trim() && !findNoteByName(m[1])) items.push({ label: `Enlazar nota nueva «${m[1].trim()}»`, detail: 'se creará al abrir el enlace', insert: m[1].trim() });
  if (!items.length) return hideSuggest();
  showSuggestBox(ta, items, ta.selectionStart - m[1].length);
}

// Muestra la lista de sugerencias bajo el cursor. Cada elemento inserta texto o, con `run`, hace algo.
function showSuggestBox(ta, items, start) {
  suggestState = { items, index: 0, start };
  const box = $('#link-suggest');
  box.replaceChildren(
    ...items.map((it, i) => {
      const text = [el('span', { className: 'sg-label' }, it.label), it.detail ? el('span', { className: 'sg-detail' }, it.detail) : ''];
      const li = it.icon
        ? el('li', { className: `sg-item has-icon${i === 0 ? ' active' : ''}`, role: 'option' }, [el('span', { className: 'sg-icon', ariaHidden: 'true' }, it.icon), el('span', { className: 'sg-text' }, text)])
        : el('li', { className: `sg-item${i === 0 ? ' active' : ''}`, role: 'option' }, text);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        acceptSuggest(i);
      });
      return li;
    })
  );
  const { top, left, lh } = caretCoords(ta, ta.selectionStart);
  box.hidden = false;
  const w = box.offsetWidth;
  box.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`;
  box.style.top = `${top + lh + 4 + box.offsetHeight > window.innerHeight ? top - box.offsetHeight - 4 : top + lh + 4}px`;
}

function hideSuggest() {
  suggestState = null;
  $('#link-suggest').hidden = true;
}

function acceptSuggest(i) {
  const ta = $('#note-editor');
  const it = suggestState.items[i];
  if (it.run) {
    const start = suggestState.start;
    hideSuggest();
    it.run(ta, start, ta.selectionStart);
    return;
  }
  const after = ta.value.slice(ta.selectionStart);
  const close = after.startsWith(']]') ? '' : ']]';
  ta.setRangeText(`${it.insert}${close}`, suggestState.start, ta.selectionStart, 'end');
  if (!close) ta.setSelectionRange(ta.selectionStart + 2, ta.selectionStart + 2);
  hideSuggest();
  ta.dispatchEvent(new Event('input'));
  hideSuggest();
}

function suggestKey(e) {
  if (!suggestState) return false;
  const n = suggestState.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    suggestState.index = (suggestState.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    $$('#link-suggest .sg-item').forEach((li, i) => li.classList.toggle('active', i === suggestState.index));
    $('#link-suggest .sg-item.active')?.scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    acceptSuggest(suggestState.index);
    return true;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    hideSuggest();
    return true;
  }
  return false;
}

// ---------- Menú contextual ----------
function showMenu(anchor, items) {
  const menu = $('#note-menu');
  menu.replaceChildren(
    ...items.map((it) => {
      const b = el('button', { className: `menu-item${it.danger ? ' danger' : ''}`, role: 'menuitem' }, it.label);
      b.addEventListener('click', () => {
        hideMenu();
        it.action();
      });
      return b;
    })
  );
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.querySelector('button')?.focus();
}
const hideMenu = () => ($('#note-menu').hidden = true);
document.addEventListener('pointerdown', (e) => {
  if (!$('#note-menu').hidden && !e.target.closest('#note-menu')) hideMenu();
});

// ---------- Selector (buscar nota, comandos, carpetas, texto) ----------
let picker = null;

function openPicker({ placeholder, items, hint = '', initial = '' }) {
  picker = { items, index: 0, list: [] };
  $('#picker').hidden = false;
  const input = $('#picker-input');
  input.placeholder = placeholder;
  input.value = initial;
  $('#picker-hint').innerHTML = hint;
  renderPicker();
  input.focus();
  input.select();
}

function closePicker() {
  picker = null;
  $('#picker').hidden = true;
}

function renderPicker() {
  if (!picker) return;
  const q = $('#picker-input').value.trim();
  picker.list = picker.items(q);
  picker.index = Math.min(picker.index, Math.max(0, picker.list.length - 1));
  $('#picker-list').replaceChildren(
    ...picker.list.map((it, i) => {
      const li = el('li', { className: `pk-item${i === picker.index ? ' active' : ''}${it.create ? ' create' : ''}`, role: 'option', ariaSelected: String(i === picker.index) }, [
        el('span', { className: 'pk-label' }, it.label),
        it.detail ? el('span', { className: 'pk-detail' }, it.detail) : '',
        it.kbd ? el('kbd', {}, it.kbd) : '',
      ]);
      li.addEventListener('click', (e) => runPicker(i, e.ctrlKey || e.metaKey));
      li.addEventListener('mousemove', () => {
        if (picker.index !== i) {
          picker.index = i;
          $$('#picker-list .pk-item').forEach((n, k) => n.classList.toggle('active', k === i));
        }
      });
      return li;
    })
  );
  if (!picker.list.length) $('#picker-list').append(el('li', { className: 'pk-empty' }, 'Sin resultados'));
  $('#picker-list .pk-item.active')?.scrollIntoView({ block: 'nearest' });
}

function runPicker(i, newTab = false) {
  const it = picker?.list[i];
  if (!it) return;
  closePicker();
  it.action({ newTab });
}

$('#picker-input').addEventListener('input', () => {
  picker.index = 0;
  renderPicker();
});
$('#picker-input').addEventListener('keydown', (e) => {
  if (!picker) return;
  const n = picker.list.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!n) return;
    picker.index = (picker.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    renderPicker();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    runPicker(picker.index, e.ctrlKey || e.metaKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePicker();
  }
});
$('#picker').addEventListener('pointerdown', (e) => {
  if (e.target.id === 'picker') closePicker();
});

// Puntuación sencilla: empieza por > contiene palabra > contiene; se prefieren las recientes.
function scoreNote(n, q) {
  const t = baseName(n.path).toLowerCase();
  const p = n.path.toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  if (p.includes(q)) return 20;
  const words = q.split(/\s+/);
  if (words.every((w) => p.includes(w))) return 10;
  return 0;
}

function openSwitcher() {
  openPicker({
    placeholder: 'Escribe el nombre de una nota…',
    hint: '<kbd>↑↓</kbd> moverse · <kbd>Enter</kbd> abrir · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> en pestaña nueva · <kbd>Esc</kbd> cerrar',
    items: (q) => {
      const ql = q.toLowerCase();
      const list = state.notes
        .map((n) => ({ n, s: scoreNote(n, ql) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || b.n.updatedAt - a.n.updatedAt)
        .slice(0, 30)
        .map(({ n }) => ({ label: baseName(n.path), detail: folderOf(n.path), action: ({ newTab }) => openNote(n, { newTab }) }));
      if (q && !findNoteByName(q)) list.push({ label: `Crear nota «${cleanName(q)}»`, create: true, kbd: 'Enter', action: ({ newTab }) => createNote({ folder: folderOf(q), title: baseName(q), newTab }) });
      return list;
    },
  });
}

function pickFolder(note) {
  openPicker({
    placeholder: `Mover «${baseName(note.path)}» a…`,
    items: (q) => {
      const ql = q.toLowerCase();
      const list = [{ path: '', label: '/ (raíz)' }, ...allFolders().map((f) => ({ path: f, label: f }))]
        .filter((f) => f.path !== folderOf(note.path) && f.label.toLowerCase().includes(ql))
        .map((f) => ({ label: f.label, action: () => moveNoteToFolder(note, f.path) }));
      if (q && !allFolders().some((f) => f.toLowerCase() === ql)) list.push({ label: `Crear carpeta «${q}» y mover`, create: true, action: () => {
        createFolder(q);
        moveNoteToFolder(note, q.split('/').map(cleanName).filter(Boolean).join('/'));
      } });
      return list;
    },
  });
}

function promptText({ placeholder, initial = '', action, onSubmit }) {
  openPicker({
    placeholder,
    initial,
    hint: '<kbd>Enter</kbd> aceptar · <kbd>Esc</kbd> cancelar',
    items: (q) => (q ? [{ label: `${action}: «${q}»`, create: true, action: () => onSubmit(q) }] : [{ label: 'Escribe un nombre', action: () => {} }]),
  });
}

// ---------- Nota diaria ----------
function openDailyNote({ newTab = false } = {}) {
  const key = dateKey();
  const path = `Diario/${key}`;
  const existing = findNoteByName(path);
  if (existing) return openNote(existing, { newTab });
  if (!state.folders.includes('Diario')) state.folders.push('Diario');
  const long = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const prev = dateKey(addDays(new Date(), -1));
  const next = dateKey(addDays(new Date(), 1));
  const tpl = findNoteByName(`${TEMPLATE_FOLDER}/Nota diaria`);
  const body = tpl ? fillTemplate(tpl.body, key) : `# ${long.charAt(0).toUpperCase() + long.slice(1)}\n\n← [[${prev}]] · [[${next}]] →\n\n## 🧠 Vaciado mental\n- \n\n## ✅ Tareas\n- [ ] \n\n## 📝 Notas\n\n`;
  const note = createNote({ folder: 'Diario', title: key, body, newTab, edit: true });
  return note;
}

// ---------- Paleta de comandos ----------
function commands() {
  const note = activeNote();
  const list = [
    { label: 'Abrir nota…', kbd: 'Ctrl+O', action: openSwitcher },
    { label: 'Nueva nota', kbd: 'Ctrl+N', action: () => createNote({ folder: note ? folderOf(note.path) : '' }) },
    { label: 'Nueva nota en pestaña nueva', action: () => createNote({ newTab: true }) },
    { label: 'Nueva nota desde plantilla…', action: newNoteFromTemplate },
    { label: 'Insertar plantilla en la nota', action: insertTemplate },
    { label: 'Abrir la nota diaria de hoy', kbd: 'Alt+D', action: () => openDailyNote() },
    { label: 'Nueva carpeta', action: () => $('#new-folder').click() },
    { label: 'Buscar en todas las notas', action: () => {
      showLeftPane('search');
      $('#note-search').focus();
    } },
    { label: 'Ver etiquetas', action: () => showLeftPane('tags') },
    { label: 'Resumen semanal con Claude', action: () => {
      showView('progress');
      if (aiReady()) generateSummary();
    } },
    { label: 'Preguntar a tus notas (Claude)', action: ({ newTab }) => showView('ask', { newTab }) },
    { label: 'Nuevo lienzo', action: () => {
      showView('canvas');
      $('#canvas-title').focus();
    } },
    { label: 'Hacer la revisión semanal', action: ({ newTab }) => showView('review', { newTab }) },
    { label: 'Abrir vista de grafo', kbd: 'Ctrl+G', action: ({ newTab }) => openTab({ type: 'graph' }, { newTab }) },
    { label: 'Mostrar u ocultar el panel izquierdo', action: () => toggleSide('left') },
    { label: 'Mostrar u ocultar el panel derecho', action: () => toggleSide('right') },
  ];
  if (note) {
    list.push(
      { label: noteMode.get(note.id) === 'edit' ? 'Cambiar a modo lectura' : 'Cambiar a modo edición', kbd: 'Ctrl+E', action: toggleNoteMode },
      { label: 'Renombrar la nota', action: () => $('#note-title').select() },
      { label: 'Mover la nota a otra carpeta', action: () => pickFolder(note) },
      { label: 'Copiar enlace a la nota', action: () => copyText(`[[${baseName(note.path)}]]`, 'Enlace copiado') },
      { label: 'Crear mapa mental de esta nota', action: () => mapFromNote(note) },
      { label: 'Eliminar la nota', action: () => deleteNote(note) },
      { label: 'Ver enlaces entrantes', action: () => {
        panels.rpane = 'backlinks';
        if (!isNarrow()) panels.right = true;
        savePanels();
        applyPanels();
        if (isNarrow()) toggleSide('right');
        renderRightPanel();
      } }
    );
  }
  list.push({ label: 'Cerrar la pestaña actual', action: () => closeTab(ws.active) });
  Object.entries(VIEW_TITLES).forEach(([v, t]) => list.push({ label: `Ir a ${t}`, action: ({ newTab }) => showView(v, { newTab }) }));
  return list;
}

function openPalette() {
  openPicker({
    placeholder: 'Escribe un comando…',
    hint: '<kbd>↑↓</kbd> moverse · <kbd>Enter</kbd> ejecutar · <kbd>Esc</kbd> cerrar',
    items: (q) => {
      const ql = q.toLowerCase();
      return commands().filter((c) => !ql || ql.split(/\s+/).every((w) => c.label.toLowerCase().includes(w)));
    },
  });
}

// ---------- Dibujar el espacio de trabajo ----------
function renderWorkspace() {
  // Pestañas de notas que ya no existen (borradas aquí o en otro dispositivo).
  const before = ws.tabs.length;
  ws.tabs = ws.tabs.filter((t) => t.type !== 'note' || noteById(t.id));
  if (!ws.tabs.length) ws.tabs = [{ type: 'view', view: 'today' }];
  if (ws.tabs.length !== before || ws.active >= ws.tabs.length) {
    ws.active = Math.min(ws.active, ws.tabs.length - 1);
    saveTabs();
  }
  const tab = activeTab();

  $('#ws-tabs').replaceChildren(
    ...ws.tabs.map((t, i) => {
      const note = t.type === 'note' ? noteById(t.id) : null;
      const label = note ? baseName(note.path) : t.type === 'graph' ? 'Grafo' : VIEW_TITLES[t.view];
      const b = el('div', { className: `ws-tab${i === ws.active ? ' active' : ''}`, role: 'tab', ariaSelected: String(i === ws.active), title: note ? note.path : label, tabIndex: 0 }, [
        ico(note ? 'note' : t.type === 'graph' ? 'graph' : VIEW_ICONS[t.view]),
        el('span', { className: 'ws-tab-label' }, label),
      ]);
      const x = el('button', { className: 'ws-tab-close', ariaLabel: `Cerrar ${label}`, title: 'Cerrar' }, ico('x'));
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        flushNoteSave();
        closeTab(i);
      });
      b.append(x);
      b.addEventListener('click', () => {
        flushNoteSave();
        ws.active = i;
        saveTabs();
        renderWorkspace();
      });
      b.addEventListener('auxclick', (e) => {
        if (e.button === 1) closeTab(i);
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') b.click();
      });
      return b;
    })
  );
  // Solo la barra de pestañas se desplaza (scrollIntoView movería también el resto de la página).
  const activeEl = $('#ws-tabs .ws-tab.active');
  const bar = $('#ws-tabs');
  if (activeEl && bar.scrollWidth > bar.clientWidth) {
    const l = activeEl.offsetLeft, r = l + activeEl.offsetWidth;
    if (l < bar.scrollLeft) bar.scrollLeft = l;
    else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth;
  }

  const isNote = tab.type === 'note';
  const isGraph = tab.type === 'graph';
  $('#note-pane').hidden = !isNote;
  $('#graph-pane').hidden = !isGraph;
  $('#views-pane').hidden = isNote || isGraph;
  $$('.rib[data-view]').forEach((b) => b.classList.toggle('active', tab.type === 'view' && b.dataset.view === tab.view));
  $('#rib-graph').classList.toggle('active', isGraph);
  $('#open-settings').classList.toggle('active', tab.type === 'view' && tab.view === 'settings');
  if (isGraph) {
    $('#mobile-title').textContent = 'Grafo';
    $('#status-note').textContent = '';
    renderGraph();
  } else if (isNote) {
    const note = noteById(tab.id);
    renderNotePane(note);
    $('#mobile-title').textContent = baseName(note.path);
  } else {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab.view}`));
    // Al abrir una sección se redibuja: las notas pueden haber cambiado sus tareas.
    if (renderingWorkspaceFromAll === false) VIEW_RENDER[tab.view]?.();
    $('#mobile-title').textContent = VIEW_TITLES[tab.view];
    $('#status-note').textContent = '';
    // El mapa mental necesita estar visible para medir sus nodos.
    if (tab.view === 'ideas' && openMapId) renderIdeas();
  }
  renderTree();
  renderRightPanel();
}

const VIEW_RENDER = {
  today: () => {
    renderToday();
    renderLog();
  },
  tasks: () => renderTasks(),
  projects: () => renderProjects(),
  journal: () => renderJournal(),
  ideas: () => renderIdeas(),
  timer: () => {
    renderTimer();
    renderTimerTaskOptions();
  },
  habits: () => renderHabits(),
  progress: () => renderProgress(),
  review: () => renderReviewStep(),
  canvas: () => {
    renderCanvasView();
    if (cv.id) requestAnimationFrame(applyView);
  },
  ask: () => {
    renderAsk();
    if (aiReady()) $('#ask-input').focus();
  },
  settings: () => {
    renderAccents();
    renderStorage();
  },
};
// renderAll ya dibuja todas las secciones; así no se repite el trabajo.
let renderingWorkspaceFromAll = false;

function renderNotesUI() {
  renderingWorkspaceFromAll = true;
  renderSidePanes();
  renderWorkspace();
  renderingWorkspaceFromAll = false;
}

// Una sola vez: una nota de bienvenida que enseña cómo funcionan las notas.
function welcomeNote() {
  if (state.settings.notesWelcome || state.notes.length) return;
  state.settings.notesWelcome = true;
  const note = createNote({
    title: 'Bienvenida',
    open: false,
    log: false,
    body: `Aquí puedes escribir notas en **Markdown** y enlazarlas entre sí, como un segundo cerebro.

## Cómo funciona
- Escribe \`[[\` para enlazar otra nota. Prueba este enlace: [[Ideas para el fin de semana]]
- Si la nota no existe, se crea al abrir el enlace.
- Usa #etiquetas para agrupar notas; aparecen en el panel izquierdo.
- **Ctrl+E** alterna entre editar y leer, **Ctrl+O** abre cualquier nota y **Ctrl+P** muestra todos los comandos.
- El botón del calendario abre la **nota diaria** de hoy.

## Tareas dentro de las notas
Cada casilla de una nota aparece también en la pestaña **Tareas** (y en **Hoy** si vence hoy). Añade \`📅 mañana\`, \`!alta\` o #etiquetas a la línea.
- [ ] Prueba a marcar esta tarea aquí o en Tareas (puedes borrarla después)

> [!tip] Consejo
> En el panel derecho verás qué notas enlazan a la que tienes abierta, y las que la mencionan sin enlazarla.
`,
  });
  ws.tabs.push({ type: 'note', id: note.id });
  saveTabs();
}

window.addEventListener('resize', () => {
  if (!isNarrow()) closeDrawers();
});
