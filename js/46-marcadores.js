'use strict';

// ---------- Marcadores ----------
// Como «Bookmarks» de Obsidian: notas, títulos dentro de una nota, búsquedas y carpetas a mano en el
// panel izquierdo (pestaña ⭐ o botón de la barra). Se guardan en los ajustes, así que se sincronizan:
//   { id, type: 'note'|'heading'|'search'|'folder', ref (id de nota, ruta o consulta), heading?, title?, group? }
// Se ordenan arrastrando o con Subir/Bajar; los grupos son opcionales.
const BM_ICON = { note: '📄', heading: '#', search: '🔍', folder: '📁' };
const bmList = () => state.settings.bookmarks || [];

function bmSave(list) {
  state.settings.bookmarks = list;
  save();
  renderBookmarks();
}

const bmFind = (type, ref, heading = '') => bmList().find((b) => b.type === type && b.ref === ref && (b.heading || '') === heading);

// Nombre que se ve: el que le diste o el de lo que apunta.
function bmLabel(b) {
  if (b.title) return b.title;
  if (b.type === 'search') return b.ref;
  if (b.type === 'folder') return baseName(b.ref);
  const note = noteById(b.ref);
  const name = note ? baseName(note.path) : 'Nota eliminada';
  return b.type === 'heading' ? `${name} › ${b.heading}` : name;
}

// Apunta a algo que ya no existe (se ve atenuado).
const bmMissing = (b) => ((b.type === 'note' || b.type === 'heading') && !noteById(b.ref)) || (b.type === 'folder' && !allFolders().includes(b.ref));

function addBookmark(item) {
  if (bmFind(item.type, item.ref, item.heading)) return showToastMessage('Ya está en marcadores');
  bmSave([...bmList(), { id: uid(), ...item }]);
  showToastMessage('Añadido a marcadores');
}

function removeBookmark(id) {
  bmSave(bmList().filter((b) => b.id !== id));
  showToastMessage('Quitado de marcadores');
}

function toggleNoteBookmark(note) {
  const b = bmFind('note', note.id);
  if (b) removeBookmark(b.id);
  else addBookmark({ type: 'note', ref: note.id });
}

function openBookmark(b, { newTab = false } = {}) {
  if (b.type === 'search') {
    $('#note-search').value = b.ref;
    return showLeftPane('search');
  }
  if (b.type === 'folder') return revealFolder(b.ref);
  const note = noteById(b.ref);
  if (!note) return showToastMessage('Esa nota ya no existe');
  openNote(note, { newTab, heading: b.type === 'heading' ? b.heading : '' });
}

// Abre la carpeta (y las de encima) en el explorador y la señala.
function revealFolder(path) {
  if (!allFolders().includes(path)) return showToastMessage('Esa carpeta ya no existe');
  path.split('/').forEach((_, i, parts) => collapsedFolders.delete(parts.slice(0, i + 1).join('/')));
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedFolders]));
  } catch {
    // Sin almacenamiento.
  }
  showLeftPane('files');
  const row = [...$$('#file-tree .tree-row.folder')].find((r) => r.title === path);
  if (!row) return;
  reveal(row, { block: 'center' });
  row.classList.add('bm-flash');
  setTimeout(() => row.classList.remove('bm-flash'), 1200);
  row.focus({ preventScroll: true });
}

// Mueve un marcador delante de otro (o al final del grupo) y lo pasa a ese grupo.
function moveBookmark(id, { before = null, group } = {}) {
  const list = bmList().slice();
  const i = list.findIndex((b) => b.id === id);
  if (i < 0 || id === before) return;
  const [b] = list.splice(i, 1);
  const moved = { ...b };
  if (group !== undefined) {
    if (group) moved.group = group;
    else delete moved.group;
  }
  let j = before ? list.findIndex((x) => x.id === before) : -1;
  if (j < 0) {
    // Al final de su grupo.
    const last = list.map((x) => x.group || '').lastIndexOf(moved.group || '');
    j = last < 0 ? list.length : last + 1;
  }
  list.splice(j, 0, moved);
  bmSave(list);
}

// Subir / bajar dentro de su grupo.
function shiftBookmark(id, dir) {
  const list = bmList();
  const b = list.find((x) => x.id === id);
  const same = list.filter((x) => (x.group || '') === (b.group || ''));
  const k = same.indexOf(b) + dir;
  if (k < 0 || k >= same.length) return;
  moveBookmark(id, { before: dir < 0 ? same[k].id : same[k + 1]?.id || null });
}

const bmGroups = () => [...new Set(bmList().map((b) => b.group).filter(Boolean))];

function pickBookmarkGroup(b) {
  openPicker({
    placeholder: `Mover «${bmLabel(b)}» al grupo…`,
    items: (q) => {
      const ql = q.toLowerCase();
      const list = [{ name: '', label: '(sin grupo)' }, ...bmGroups().map((g) => ({ name: g, label: g }))]
        .filter((g) => g.name !== (b.group || '') && g.label.toLowerCase().includes(ql))
        .map((g) => ({ label: g.label, action: () => moveBookmark(b.id, { group: g.name }) }));
      if (q.trim() && !bmGroups().some((g) => g.toLowerCase() === ql.trim())) list.push({ label: `Crear el grupo «${q.trim()}»`, create: true, action: () => moveBookmark(b.id, { group: q.trim() }) });
      return list;
    },
  });
}

function bookmarkMenuItems(b) {
  const isNote = b.type === 'note' || b.type === 'heading';
  const list = bmList();
  const same = list.filter((x) => (x.group || '') === (b.group || ''));
  return [
    { label: 'Abrir', action: () => openBookmark(b) },
    ...(isNote ? [{ label: 'Abrir en pestaña nueva', kbd: 'Ctrl+clic', disabled: bmMissing(b), action: () => openBookmark(b, { newTab: true }) }] : []),
    { sep: true },
    { label: 'Renombrar…', action: () => promptText({ placeholder: 'Nombre del marcador (vacío: el original)', initial: bmLabel(b), action: 'Renombrar', onSubmit: (v) => bmSave(bmList().map((x) => (x.id === b.id ? { ...x, title: v.trim() } : x))) }) },
    { label: 'Mover a grupo…', action: () => pickBookmarkGroup(b) },
    { label: '↑ Subir', disabled: same[0] === b, action: () => shiftBookmark(b.id, -1) },
    { label: '↓ Bajar', disabled: same.at(-1) === b, action: () => shiftBookmark(b.id, 1) },
    { sep: true },
    { label: 'Quitar', danger: true, action: () => removeBookmark(b.id) },
  ];
}

let bmDragId = null;

function bookmarkRow(b) {
  const missing = bmMissing(b);
  const row = el('button', { className: `tree-row bm-item${missing ? ' missing' : ''}`, draggable: true, title: missing ? 'Ya no existe' : b.type === 'search' ? `Buscar «${b.ref}»` : b.type === 'folder' ? b.ref : noteById(b.ref)?.path || '' }, [
    el('span', { className: 'bm-ico', ariaHidden: 'true' }, BM_ICON[b.type] || '⭐'),
    el('span', { className: 'tree-name' }, bmLabel(b)),
  ]);
  row.dataset.bm = b.id;
  if (b.group) row.style.paddingLeft = '22px';
  // Vista previa al pasar el ratón (45-vista-previa.js).
  if (!missing && (b.type === 'note' || b.type === 'heading')) {
    row.dataset.pvNote = b.ref;
    if (b.heading) row.dataset.pvHeading = b.heading;
  }
  row.addEventListener('click', (e) => openBookmark(b, { newTab: e.ctrlKey || e.metaKey }));
  row.addEventListener('auxclick', (e) => e.button === 1 && openBookmark(b, { newTab: true }));
  row.addEventListener('dragstart', (e) => {
    bmDragId = b.id;
    e.dataTransfer.setData('text/x-bookmark', b.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', () => (bmDragId = null));
  bmDrop(row, () => ({ before: b.id, group: b.group || '' }));
  return row;
}

// Donde se puede soltar: otro marcador (se pone delante), un grupo o la lista (al final).
// Una nota del explorador soltada aquí se añade a marcadores.
function bmDrop(node, where) {
  node.addEventListener('dragover', (e) => {
    const types = [...e.dataTransfer.types];
    if (!types.includes('text/x-bookmark') && !types.includes('text/x-note')) return;
    e.preventDefault();
    e.stopPropagation();
    node.classList.add('drop');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop'));
  node.addEventListener('drop', (e) => {
    node.classList.remove('drop');
    const id = e.dataTransfer.getData('text/x-bookmark') || bmDragId;
    const noteId = e.dataTransfer.getData('text/x-note');
    if (!id && !noteId) return;
    e.preventDefault();
    e.stopPropagation();
    if (id) return moveBookmark(id, where());
    const note = noteById(noteId);
    if (note && !bmFind('note', note.id)) {
      const { before, group } = where();
      addBookmark({ type: 'note', ref: note.id, ...(group ? { group } : {}) });
      const added = bmFind('note', note.id);
      if (before && added) moveBookmark(added.id, { before });
    }
  });
}

function renderBookmarks() {
  const box = $('#bookmark-list');
  const list = bmList();
  if (!list.length) {
    box.replaceChildren(el('p', { className: 'muted side-empty' }, 'Sin marcadores. Añade notas, títulos, búsquedas o carpetas con el clic derecho o con ⭐.'));
  } else {
    const nodes = list.filter((b) => !b.group).map(bookmarkRow);
    bmGroups().forEach((g) => {
      const head = el('div', { className: 'tree-row folder bm-group', title: g }, [el('span', { className: 'bm-ico', ariaHidden: 'true' }, '▾'), el('span', { className: 'tree-name' }, g)]);
      head.dataset.bmGroup = g;
      bmDrop(head, () => ({ group: g }));
      nodes.push(head, ...list.filter((b) => b.group === g).map(bookmarkRow));
    });
    box.replaceChildren(...nodes);
  }
}
bmDrop($('#bookmark-list'), () => ({ group: '' }));

// Clic derecho (o tecla de menú) sobre un marcador o un grupo.
$('#bookmark-list').addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-bm]');
  const group = e.target.closest('[data-bm-group]');
  if (!row && !group) return;
  e.preventDefault();
  e.stopPropagation();
  let { clientX: x, clientY: y } = e;
  if (!x && !y) {
    const r = e.target.getBoundingClientRect();
    x = r.left + 12;
    y = r.bottom;
  }
  if (row) {
    const b = bmList().find((it) => it.id === row.dataset.bm);
    if (b) showMenuAt(x, y, bookmarkMenuItems(b));
    return;
  }
  const g = group.dataset.bmGroup;
  showMenuAt(x, y, [
    { label: 'Renombrar el grupo…', action: () => promptText({ placeholder: 'Nombre del grupo', initial: g, action: 'Renombrar', onSubmit: (v) => v.trim() && bmSave(bmList().map((b) => (b.group === g ? { ...b, group: v.trim() } : b))) }) },
    { label: 'Deshacer el grupo', action: () => bmSave(bmList().map((b) => (b.group === g ? (({ group: _g, ...rest }) => rest)(b) : b))) },
  ]);
});

// Botón de la barra: abre o cierra el panel de marcadores.
$('#rib-bookmarks').addEventListener('click', () => {
  if (isNarrow()) return showLeftPane('bookmarks');
  if (panels.left && panels.lpane === 'bookmarks') toggleSide('left');
  else showLeftPane('bookmarks');
});

// ⭐ junto a la búsqueda: guarda la consulta actual.
{
  const input = $('#note-search');
  const btn = el('button', { id: 'bm-search', className: 'side-btn', title: 'Añadir esta búsqueda a marcadores', ariaLabel: 'Añadir esta búsqueda a marcadores' }, '⭐');
  btn.addEventListener('click', () => {
    const q = input.value.trim();
    if (!q) return showToastMessage('Escribe algo que buscar primero');
    addBookmark({ type: 'search', ref: q });
  });
  const wrap = el('div', { className: 'bm-search-row' });
  input.before(wrap);
  wrap.append(input, btn);
}

// Menú ⋯ de la nota, paleta de comandos y clic derecho (43-menu-contextual.js).
NOTE_MENU_EXTRA.push((note) => ({ label: bmFind('note', note.id) ? '⭐ Quitar de marcadores' : '⭐ Añadir a marcadores', action: () => toggleNoteBookmark(note) }));
COMMANDS_EXTRA.push((note) => [
  ...(note ? [{ label: bmFind('note', note.id) ? 'Quitar la nota de marcadores' : 'Añadir la nota a marcadores', action: () => toggleNoteBookmark(note) }] : []),
  { label: 'Mostrar los marcadores', action: () => showLeftPane('bookmarks') },
]);
CTX_MENU_EXTRA.push((kind, x) => {
  if (kind === 'note') return [{ label: bmFind('note', x.id) ? '⭐ Quitar de marcadores' : '⭐ Añadir a marcadores', action: () => toggleNoteBookmark(x) }];
  if (kind === 'folder') {
    const b = bmFind('folder', x);
    return [{ label: b ? '⭐ Quitar de marcadores' : '⭐ Añadir a marcadores', action: () => (b ? removeBookmark(b.id) : addBookmark({ type: 'folder', ref: x })) }];
  }
  if (kind === 'heading') {
    const h = headingsIn(noteText(x.note) || '').find((it) => it.line === Number(x.el?.dataset.line));
    if (!h) return [];
    const b = bmFind('heading', x.note.id, h.text);
    return [{ label: b ? '⭐ Quitar el título de marcadores' : '⭐ Añadir este título a marcadores', action: () => (b ? removeBookmark(b.id) : addBookmark({ type: 'heading', ref: x.note.id, heading: h.text })) }];
  }
  return [];
});
