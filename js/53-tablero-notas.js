'use strict';

// ---------- Tablero de notas (kanban por propiedad) ----------
//   ```tablero
//   carpeta: Proyectos
//   agrupar: estado
//   columnas: pendiente, en curso, hecho
//   mostrar: autor
//   ```
// Una columna por valor: las de «columnas:» en ese orden, luego las demás que haya y «Sin estado».
// Arrastrar una tarjeta (ratón o dedo, por el asa ⠿) cambia la propiedad; «+» crea una nota con
// ese valor. Admite #etiquetas, los filtros por propiedad de ```notas, «orden:» (dentro de cada
// columna) y «límite:» (tarjetas por columna). En una propiedad lista cuenta su primer valor.

function parseBoardQuery(src) {
  const q = { folder: null, group: 'estado', columns: [], show: [], tags: [], filters: [], sort: null, desc: false, limit: 100 };
  src.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const kv = line.match(/^(carpeta|folder|agrupar|group(?: by)?|columnas|columns|mostrar|show|orden|sort|l[ií]mite|limit)\s*:\s*(.*)$/i);
    if (kv) {
      const k = fold(kv[1]);
      const v = kv[2].trim();
      if (k.startsWith('carp') || k === 'folder') q.folder = v || null;
      else if (k.startsWith('agr') || k.startsWith('group')) q.group = v.replace(/[:\n]/g, ' ').trim() || q.group;
      else if (k.startsWith('col')) q.columns = splitList(v);
      else if (k === 'mostrar' || k === 'show') q.show = splitList(v);
      else if (k === 'orden' || k === 'sort') Object.assign(q, parseQuerySort(v));
      else q.limit = Math.max(1, Math.min(500, Number(v) || 100));
      return;
    }
    const f = parsePropFilter(line);
    if (f) return q.filters.push(f);
    line.split(/\s+/).forEach((w) => w.startsWith('#') && w.length > 1 && q.tags.push(w.slice(1).toLowerCase()));
  });
  return q;
}

const boardNoteTags = (n) => [...new Set([...tagsIn(n.body), ...fmTags(n.body)])];

// Columnas con sus notas: [{ key, label, value (null = «Sin …»), notes }].
function noteBoardColumns(q, selfId) {
  const notes = state.notes
    .filter((n) => n.id !== selfId && !n.enc)
    .filter((n) => !q.folder || n.path.toLowerCase().startsWith(`${q.folder.toLowerCase()}/`))
    .filter((n) => q.tags.every((tag) => boardNoteTags(n).some((x) => x === tag || x.startsWith(`${tag}/`))))
    .filter((n) => matchPropFilters(n, q.filters));
  const listed = q.columns.map((v) => ({ key: v.toLowerCase(), label: v, value: v, notes: [] }));
  const byKey = new Map(listed.map((c) => [c.key, c]));
  const extra = [];
  const none = { key: '', label: `Sin ${q.group}`, value: null, notes: [] };
  notes.forEach((n) => {
    const v = propValues(n, q.group)[0] || '';
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
  all.forEach((c) => sortNotesBy(c.notes, q.sort || 'nombre', q.sort ? q.desc : false));
  return all;
}

// Quita una propiedad (y el bloque --- si se queda vacío).
function removeNoteProp(note, key) {
  const { props, end } = parseProps(note.body);
  const p = props.find((x) => x.key.toLowerCase() === key.toLowerCase());
  if (!p) return noteFields(note).get(key.toLowerCase())?.inline && setProp(note, key, ''); // campo en línea: se vacía
  const lines = note.body.split('\n');
  lines.splice(p.line, p.to - p.line + 1);
  const newEnd = end - (p.to - p.line + 1);
  if (lines.slice(1, newEnd).every((l) => !l.trim())) lines.splice(0, newEnd + 1);
  note.body = lines.join('\n');
}

// Mueve una nota a otra columna: cambia la propiedad (o la quita, si es «Sin …»).
function moveBoardNote(note, key, value) {
  if (!note || note.enc) return false;
  const before = note.body;
  // Lista (etiquetas: [a, b]): la columna sale del primer valor; solo cambia ese y los demás se quedan.
  const items = (noteFields(note).get(String(key).toLowerCase())?.items || []).map((x) => String(x).trim()).filter(Boolean);
  if (items.length > 1) {
    const rest = items.slice(1).filter((x) => !value || x.toLowerCase() !== String(value).toLowerCase());
    setProp(note, key, (value ? [value, ...rest] : rest).join(', '));
  } else if (value == null || value === '') removeNoteProp(note, key);
  else setProp(note, key, value);
  if (note.body === before) return false;
  note.updatedAt = Date.now();
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(note);
  renderAll();
  return true;
}

// «+» de una columna: nota nueva en la carpeta con ese valor (y los filtros «clave: valor» del bloque).
function addBoardNote(q, value, title) {
  const props = [];
  if (value) props.push(`${q.group}: ${yamlScalar(value)}`);
  q.filters.filter((f) => f.op === '=' && f.key.toLowerCase() !== q.group.toLowerCase()).forEach((f) => props.push(`${f.key}: ${yamlScalar(f.value)}`));
  if (q.tags.length) props.push(`tags: [${q.tags.join(', ')}]`);
  const note = createNote({ folder: q.folder || '', title, body: props.length ? `---\n${props.join('\n')}\n---\n` : '', open: false, edit: false });
  renderAll();
  return note;
}

function boardNoteCard(n, q, cols, ci) {
  const name = baseName(n.path);
  const handle = el('button', { className: 'nb-handle', title: 'Arrastra a otra columna (o usa ← →)', ariaLabel: `Mover «${name}» (flechas izquierda y derecha)` }, '⠿');
  const title = el('button', { className: 'nb-title', title: n.path }, name);
  const props = q.show.map((k) => [k, propValues(n, k).join(', ')]).filter(([, v]) => v);
  const tags = boardNoteTags(n);
  const card = el('div', { className: 'nb-card' }, [
    el('div', { className: 'nb-row' }, [handle, title]),
    props.length ? el('div', { className: 'nb-props' }, props.map(([k, v]) => el('div', {}, [el('span', { className: 'muted' }, `${k}: `), v]))) : '',
    tags.length ? el('div', { className: 'nb-tags' }, tags.slice(0, 6).map((t) => el('span', { className: 'nb-tag' }, `#${t}`))) : '',
  ]);
  card.dataset.id = n.id;
  const open = (e) => openNote(n, { newTab: !!(e?.ctrlKey || e?.metaKey) });
  const move = (c) => c && c !== cols[ci] && moveBoardNote(n, q.group, c.value);
  let pt = '';
  // Con ratón se arrastra desde cualquier punto; con el dedo, desde el asa (así la página se desplaza).
  card.addEventListener('pointerdown', (e) => {
    pt = e.pointerType;
    if (e.pointerType !== 'mouse' && !e.target.closest('.nb-handle')) return;
    e.preventDefault();
    cardDrag(e, card, {
      targets: '.nb-col',
      onDrop: (col) => col.closest('.nb-board') === card.closest('.nb-board') && move(cols[Number(col.dataset.ci)]),
      onClick: () => !e.target.closest('.nb-handle') && open(e),
    });
  });
  card.addEventListener('click', (e) => {
    if (e.target.closest('.nb-handle')) return;
    if (e.detail === 0 || (pt && pt !== 'mouse')) open(e);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    if (move(cols[ci + (e.key === 'ArrowLeft' ? -1 : 1)])) $(`.nb-card[data-id="${CSS.escape(n.id)}"] .nb-handle`)?.focus();
  });
  return card;
}

function renderNoteBoard(box, src, selfId) {
  const q = parseBoardQuery(src);
  const cols = noteBoardColumns(q, selfId);
  const total = cols.reduce((s, c) => s + c.notes.length, 0);
  const head = el('div', { className: 'query-head' }, `Tablero de notas · ${q.group}${q.folder ? ` · ${q.folder}` : ''} · ${plural(total, 'nota', 'notas')}`);
  const board = el('div', { className: 'nb-board' }, cols.map((c, ci) => {
    const add = el('button', { className: 'nb-add', title: `Nueva nota en «${c.label}»`, ariaLabel: `Nueva nota en «${c.label}»` }, '+');
    add.addEventListener('click', () =>
      promptText({ placeholder: `Nombre de la nota nueva (${c.value ? `${q.group}: ${c.label}` : c.label})`, action: 'Crear nota', onSubmit: (name) => addBoardNote(q, c.value, name) })
    );
    const cards = el('div', { className: 'nb-cards' }, c.notes.slice(0, q.limit).map((n) => boardNoteCard(n, q, cols, ci)));
    if (c.notes.length > q.limit) cards.append(el('p', { className: 'muted kcol-more' }, `y ${c.notes.length - q.limit} más`));
    if (!c.notes.length) cards.append(el('p', { className: 'kcol-empty' }, 'Arrastra notas aquí'));
    const col = el('section', { className: `nb-col${c.value ? '' : ' nb-none'}`, ariaLabel: c.label }, [
      el('header', { className: 'nb-col-head' }, [el('span', { className: 'nb-col-title' }, c.label), el('span', { className: 'kcol-count' }, String(c.notes.length)), add]),
      cards,
    ]);
    col.dataset.ci = String(ci);
    return col;
  }));
  box.replaceChildren(head, board);
}

// «Ver como tablero…» en el menú de una carpeta: pregunta la propiedad y abre (o crea) Tableros/<carpeta> por <propiedad>.
function openFolderBoard(folder, group) {
  const title = `${folder.replace(/\//g, ' - ')} por ${group}`;
  const existing = findNoteByName(`Tableros/${title}`);
  if (existing) return openNote(existing);
  if (!state.folders.includes('Tableros')) state.folders.push('Tableros');
  return createNote({ folder: 'Tableros', title, body: `Notas de «${folder}» agrupadas por «${group}». Arrastra una tarjeta para cambiar su ${group}.\n\n\`\`\`tablero\ncarpeta: ${folder}\nagrupar: ${group}\n\`\`\`\n`, edit: false, log: false });
}

function askFolderBoard(folder) {
  const counts = new Map();
  state.notes
    .filter((n) => !n.enc && n.path.toLowerCase().startsWith(`${folder.toLowerCase()}/`))
    .forEach((n) => noteFields(n).forEach((p) => {
      if (/^(tags?|alias(es)?|cssclass(es)?)$/i.test(p.key)) return;
      const k = p.key.toLowerCase();
      counts.set(k, { key: counts.get(k)?.key || p.key, n: (counts.get(k)?.n || 0) + 1 });
    }));
  const keys = [...counts.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, 'es'));
  openPicker({
    placeholder: 'Agrupar por la propiedad… (p. ej. estado)',
    hint: 'Una columna por cada valor · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cerrar',
    items: (typed) => {
      const t = typed.replace(/[:\n,]/g, ' ').trim();
      const out = keys.filter((k) => fold(k.key).includes(fold(t))).map((k) => ({ label: k.key, detail: plural(k.n, 'nota', 'notas'), action: () => openFolderBoard(folder, k.key) }));
      if (t && !keys.some((k) => k.key.toLowerCase() === t.toLowerCase())) out.push({ label: `Agrupar por «${t}»`, create: true, action: () => openFolderBoard(folder, t) });
      if (!t && !keys.length) out.push({ label: 'estado', detail: 'propiedad nueva', action: () => openFolderBoard(folder, 'estado') });
      return out;
    },
  });
}

// Se añade tras «Ver como tabla» en el menú de carpeta (botón ⋯ y clic derecho).
const folderMenuBase = folderMenuItems;
folderMenuItems = (f) => {
  const items = folderMenuBase(f);
  const i = items.findIndex((x) => x.label === 'Ver como tabla');
  items.splice(i < 0 ? 1 : i + 1, 0, { label: 'Ver como tablero…', action: () => askFolderBoard(f) });
  return items;
};
