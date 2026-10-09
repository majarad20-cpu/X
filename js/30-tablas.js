'use strict';

// ---------- Tablas de notas ----------
// Un bloque ```tabla muestra notas como filas y sus propiedades (--- clave: valor ---) como
// columnas, como las bases de datos de Notion o las Bases de Obsidian. Las celdas se editan ahí
// mismo y cambian la propiedad en su nota. Opciones del bloque:
//   carpeta: Libros       #etiqueta        columnas: autor, estado, nota       orden: nota desc
const tableSort = new Map(); // orden elegido al tocar una cabecera (por bloque, mientras dura la sesión)

function parseProps(body) {
  const lines = body.split('\n');
  if (lines[0]?.trim() !== '---') return { props: [], end: -1 };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { props: [], end: -1 };
  const props = [];
  for (let i = 1; i < end; i++) {
    // La clave es todo lo que hay hasta los primeros dos puntos (¿Leído?, Precio €…), como la escribe setProp.
    const m = lines[i].match(/^\s*([^\s:#-][^:]*?)\s*:\s*(.*)$/u);
    if (m) props.push({ key: m[1].trim(), value: m[2].trim(), line: i });
  }
  return { props, end };
}

const propOf = (note, key) => parseProps(note.body).props.find((p) => p.key.toLowerCase() === key.toLowerCase())?.value ?? '';

function setProp(note, rawKey, value) {
  const key = String(rawKey).replace(/[:\n]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!key) return;
  const lines = note.body.split('\n');
  const { props, end } = parseProps(note.body);
  const clean = String(value).replace(/\n/g, ' ').trim();
  const found = props.find((p) => p.key.toLowerCase() === key.toLowerCase());
  if (found) lines[found.line] = `${found.key}: ${clean}`;
  else if (end > 0) lines.splice(end, 0, `${key}: ${clean}`);
  else lines.unshift('---', `${key}: ${clean}`, '---');
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
}

function parseTableQuery(src) {
  const q = { folder: null, tags: [], columns: null, sort: null, desc: false, limit: 200 };
  src.split('\n').forEach((raw) => {
    const line = raw.trim();
    const kv = line.match(/^(carpeta|folder|columnas|columns|orden|sort|l[ií]mite|limit)\s*:\s*(.*)$/i);
    if (kv) {
      const k = fold(kv[1]);
      const v = kv[2].trim();
      if (k.startsWith('carp') || k === 'folder') q.folder = v;
      else if (k.startsWith('col')) q.columns = v.split(',').map((c) => c.trim()).filter(Boolean);
      else if (k === 'orden' || k === 'sort') {
        const m = v.match(/^(.*?)(?:\s+(asc|desc))?$/i);
        q.sort = m[1].trim();
        q.desc = /desc/i.test(m[2] || '');
      } else q.limit = Math.max(1, Math.min(1000, Number(v) || 200));
      return;
    }
    line.split(/\s+/).forEach((w) => {
      if (w.startsWith('#') && w.length > 1) q.tags.push(w.slice(1).toLowerCase());
    });
  });
  return q;
}

// Compara números como números y fechas o textos como texto.
function compareCells(a, b) {
  const na = Number(String(a).replace(',', '.'));
  const nb = Number(String(b).replace(',', '.'));
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (a === '' && b !== '') return 1;
  if (b === '' && a !== '') return -1;
  return String(a).localeCompare(String(b), 'es', { numeric: true });
}

function renderNoteTable(box, src, selfId) {
  const q = parseTableQuery(src);
  const rows = state.notes
    .filter((n) => n.id !== selfId && !n.enc)
    .filter((n) => !q.folder || n.path.toLowerCase().startsWith(`${q.folder.toLowerCase()}/`))
    .filter((n) => q.tags.every((tag) => tagsIn(n.body).some((x) => x === tag || x.startsWith(`${tag}/`))));
  let columns = q.columns;
  if (!columns) {
    const seen = new Map();
    rows.forEach((n) => parseProps(n.body).props.forEach((p) => !seen.has(p.key.toLowerCase()) && seen.set(p.key.toLowerCase(), p.key)));
    columns = [...seen.values()].slice(0, 10);
  }
  const sortKey = `${selfId}|${src}`;
  const sort = tableSort.get(sortKey) || (q.sort ? { col: q.sort, desc: q.desc } : { col: 'Nota', desc: false });
  const cell = (n, col) => (col === 'Nota' ? baseName(n.path) : col === 'Modificada' ? dateKey(new Date(n.updatedAt)) : propOf(n, col));
  rows.sort((a, b) => compareCells(cell(a, sort.col), cell(b, sort.col)) * (sort.desc ? -1 : 1) || baseName(a.path).localeCompare(baseName(b.path), 'es'));
  const shown = rows.slice(0, q.limit);

  const th = (col) => {
    const on = sort.col === col;
    const b = el('button', { className: `nt-sort${on ? ' on' : ''}`, title: 'Ordenar' }, `${col}${on ? (sort.desc ? ' ↓' : ' ↑') : ''}`);
    b.addEventListener('click', () => {
      tableSort.set(sortKey, { col, desc: on ? !sort.desc : false });
      renderNoteTable(box, src, selfId);
    });
    return el('th', { scope: 'col', ariaSort: on ? (sort.desc ? 'descending' : 'ascending') : null }, b);
  };
  const editable = (n, col) => {
    const td = el('td', { className: 'nt-cell', tabIndex: 0, title: 'Toca para editar' }, propOf(n, col));
    const edit = () => {
      if (td.querySelector('input')) return;
      const input = el('input', { type: 'text', value: propOf(n, col), ariaLabel: `${col} de ${baseName(n.path)}` });
      let done = false;
      const commit = (keep) => {
        if (done) return;
        done = true;
        if (keep && input.value.trim() !== propOf(n, col)) {
          setProp(n, col, input.value);
          save();
          renderAll();
        } else renderNoteTable(box, src, selfId);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit(true);
        if (e.key === 'Escape') commit(false);
      });
      input.addEventListener('blur', () => commit(true));
      td.replaceChildren(input);
      input.focus();
      input.select();
    };
    td.addEventListener('click', edit);
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        edit();
      }
    });
    return td;
  };
  const link = (n) => {
    const a = el('a', { href: '#', className: 'wikilink', title: n.path }, baseName(n.path));
    a.dataset.target = n.path;
    a.dataset.heading = '';
    return a;
  };

  const head = el('div', { className: 'query-head' }, `Tabla de notas${q.folder ? ` · ${q.folder}` : ''} · ${plural(rows.length, 'fila', 'filas')}`);
  const table = el('table', { className: 'note-table' }, [
    el('thead', {}, el('tr', {}, [th('Nota'), ...columns.map(th), th('Modificada')])),
    el('tbody', {}, shown.map((n) => el('tr', {}, [el('td', { className: 'nt-name' }, link(n)), ...columns.map((c) => editable(n, c)), el('td', { className: 'muted nt-date' }, dateKey(new Date(n.updatedAt)))]))),
  ]);
  const addRow = el('button', { className: 'chip' }, '+ Fila');
  addRow.addEventListener('click', () =>
    promptText({
      placeholder: 'Nombre de la nota nueva',
      action: 'Crear fila',
      onSubmit: (name) => {
        const props = columns.map((c) => `${c}: `).join('\n');
        createNote({ folder: q.folder || '', title: name, body: props ? `---\n${props}\n---\n` : '', open: false, edit: false });
        renderAll();
      },
    })
  );
  const addCol = el('button', { className: 'chip' }, '+ Columna');
  addCol.addEventListener('click', () =>
    promptText({
      placeholder: 'Nombre de la columna (p. ej. estado)',
      action: 'Añadir columna',
      onSubmit: (name) => {
        const col = name.replace(/[:\n,]/g, ' ').trim();
        if (!col) return;
        const lines = src.split('\n').filter((l) => !/^\s*(columnas|columns)\s*:/i.test(l));
        const next = [...lines.filter((l) => l.trim()), `columnas: ${[...columns, col].join(', ')}`].join('\n');
        if (!replaceTableBlock(selfId, src, next)) showToastMessage('Esta tabla está incrustada: añade la columna en su nota.');
      },
    })
  );
  box.replaceChildren(
    head,
    shown.length ? el('div', { className: 'nt-wrap' }, table) : el('p', { className: 'muted' }, 'Ninguna nota cumple esta tabla. Crea una fila o revisa la carpeta.'),
    el('div', { className: 'row nt-actions' }, [addRow, addCol, rows.length > shown.length ? el('span', { className: 'muted' }, `Se muestran ${shown.length} de ${rows.length}`) : ''])
  );
}

function replaceTableBlock(noteId, oldSrc, newSrc) {
  const note = noteById(noteId);
  if (!note || note.enc) return false;
  const re = new RegExp('(```(?:tabla|table)[ \\t]*\\n)' + escRe(oldSrc) + '(\\n```)');
  if (!re.test(note.body)) return false;
  note.body = note.body.replace(re, (_, a, b) => `${a}${newSrc}${b}`);
  note.updatedAt = Date.now();
  save();
  renderAll();
  return true;
}

// «Ver como tabla» en el menú de una carpeta: abre (o crea) la nota Tablas/<carpeta>.
function openFolderTable(folder) {
  const title = folder.replace(/\//g, ' - ');
  const existing = findNoteByName(`Tablas/${title}`);
  if (existing) return openNote(existing);
  if (!state.folders.includes('Tablas')) state.folders.push('Tablas');
  createNote({ folder: 'Tablas', title, body: `Notas de la carpeta «${folder}» con sus propiedades. Toca una celda para editarla.\n\n\`\`\`tabla\ncarpeta: ${folder}\n\`\`\`\n`, edit: false, log: false });
}
