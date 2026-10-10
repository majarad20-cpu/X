'use strict';

// ---------- Tablas de notas ----------
// Un bloque ```tabla muestra notas como filas y sus propiedades (--- clave: valor ---) como
// columnas, como las bases de datos de Notion o las Bases de Obsidian. Las celdas se editan ahí
// mismo y cambian la propiedad en su nota. Opciones del bloque:
//   carpeta: Libros       #etiqueta        columnas: autor, estado, nota       orden: nota desc
//   estado: !leído (filtros por propiedad, como en ```notas)
// Columnas propias de la nota (solo lectura): Nota, Carpeta, Creada y Modificada. Si «columnas:» nombra
// alguna, se ven solo las que nombra; si no, Modificada va al final como siempre.
const TABLE_BUILTINS = ['Nota', 'Carpeta', 'Creada', 'Modificada'];
const builtinCol = (c) => TABLE_BUILTINS.find((b) => b.toLowerCase() === String(c).trim().toLowerCase()) || null;
const tableSort = new Map(); // orden elegido al tocar una cabecera (por bloque, mientras dura la sesión)

// YAML sencillo: comillas solo cuando hacen falta (dos puntos, #, o un primer carácter especial).
function yamlScalar(v) {
  const s = String(v ?? '').replace(/\n/g, ' ');
  if (!s) return '';
  if (!/[:#]/.test(s) && !/^[\s\-?,[\]{}&*!|>'"%@`]/.test(s) && !/\s$/.test(s)) return s;
  return s.includes('"') && !s.includes("'") ? `'${s}'` : `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function yamlUnquote(v) {
  const s = String(v ?? '').trim();
  if (/^"(.*)"$/.test(s)) return s.slice(1, -1).replace(/\\(["\\])/g, '$1');
  if (/^'(.*)'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}
// «[a, "b, c"]» -> ['a', 'b, c'] (respetando las comillas).
function yamlFlowList(v) {
  const out = [];
  let cur = '';
  let q = '';
  for (const ch of v.trim().slice(1, -1)) {
    if (q) q = ch === q ? '' : q;
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(yamlUnquote).filter(Boolean);
}

function parseProps(body) {
  const lines = body.split('\n');
  if (lines[0]?.trim() !== '---') return { props: [], end: -1 };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { props: [], end: -1 };
  const props = [];
  for (let i = 1; i < end; i++) {
    // La clave es todo lo que hay hasta los primeros dos puntos (¿Leído?, Precio €…), como la escribe setProp.
    const m = lines[i].match(/^\s*([^\s:#-][^:]*?)\s*:\s*(.*)$/u);
    if (!m) continue;
    const p = { key: m[1].trim(), value: m[2].trim(), line: i, to: i };
    // Lista con guiones en las líneas siguientes (y las líneas sangradas que sigan) forman parte de la propiedad.
    while (p.to + 1 < end && /^(\s+\S|-\s|-$)/.test(lines[p.to + 1])) p.to++;
    const items = lines.slice(i + 1, p.to + 1).filter((l) => /^\s*-(\s|$)/.test(l)).map((l) => yamlUnquote(l.replace(/^\s*-\s*/, ''))).filter(Boolean);
    if (/^\[.*\]$/.test(p.value)) p.items = yamlFlowList(p.value);
    else if (!p.value && items.length) p.items = items;
    if (p.items) p.value = p.items.join(', ');
    else p.value = yamlUnquote(p.value);
    props.push(p);
    i = p.to;
  }
  return { props, end };
}

const propOf = (note, key) => parseProps(note.body).props.find((p) => p.key.toLowerCase() === key.toLowerCase())?.value ?? '';

// Cambia (o añade) una propiedad. Si era una lista, se reescribe entera como lista con guiones.
function setProp(note, rawKey, value) {
  const key = String(rawKey).replace(/[:\n]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!key) return;
  const lines = note.body.split('\n');
  const { props, end } = parseProps(note.body);
  const clean = String(value).replace(/\n/g, ' ').trim();
  const found = props.find((p) => p.key.toLowerCase() === key.toLowerCase());
  if (found) {
    const items = clean.split(',').map((x) => x.trim()).filter(Boolean);
    const rows = found.items ? (items.length ? [`${found.key}:`, ...items.map((x) => `  - ${yamlScalar(x)}`)] : [`${found.key}: []`]) : [`${found.key}: ${yamlScalar(clean)}`];
    lines.splice(found.line, found.to - found.line + 1, ...rows);
  } else if (end > 0) lines.splice(end, 0, `${key}: ${yamlScalar(clean)}`);
  else lines.unshift('---', `${key}: ${yamlScalar(clean)}`, '---');
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
}

function parseTableQuery(src) {
  const q = { folder: null, tags: [], columns: null, sort: null, desc: false, limit: 200, filters: [] };
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
    const f = line && parsePropFilter(line);
    if (f) return q.filters.push(f);
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
    .filter((n) => q.tags.every((tag) => tagsIn(n.body).some((x) => x === tag || x.startsWith(`${tag}/`))))
    .filter((n) => matchPropFilters(n, q.filters));
  const seen = new Map();
  rows.forEach((n) => parseProps(n.body).props.forEach((p) => !seen.has(p.key.toLowerCase()) && !builtinCol(p.key) && seen.set(p.key.toLowerCase(), p.key)));
  const explicit = !!q.columns?.some(builtinCol);
  // Columnas visibles tras «Nota» (que siempre va primera, con el enlace).
  const view = q.columns ? q.columns.map((c) => builtinCol(c) || c).filter((c) => c !== 'Nota') : [...seen.values()].slice(0, 10);
  if (!explicit) view.push('Modificada');
  const columns = view.filter((c) => !builtinCol(c));
  const sortKey = `${selfId}|${src}`;
  const sort = tableSort.get(sortKey) || (q.sort ? { col: builtinCol(q.sort) || q.sort, desc: q.desc } : { col: 'Nota', desc: false });
  const cell = (n, col) => {
    const b = builtinCol(col);
    return b === 'Nota' ? baseName(n.path) : b === 'Modificada' ? n.updatedAt || 0 : b === 'Creada' ? n.createdAt || n.updatedAt || 0 : b === 'Carpeta' ? folderOf(n.path) : propOf(n, col);
  };
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
  // Cómo se ve una celda según su tipo: casilla (true/false), fecha o lista (chips).
  const cellView = (n, col) => {
    const p = parseProps(n.body).props.find((x) => x.key.toLowerCase() === col.toLowerCase());
    if (!p) return '';
    if (p.items) return p.items.map((x) => el('span', { className: 'prop-chip' }, x));
    if (/^(true|false)$/i.test(p.value)) {
      const box = el('input', { type: 'checkbox', className: 'nt-check', checked: /^true$/i.test(p.value), ariaLabel: `${col} de ${baseName(n.path)}` });
      box.addEventListener('change', () => {
        setProp(n, p.key, box.checked ? 'true' : 'false');
        save();
        renderAll();
      });
      return box;
    }
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(p.value)) return el('time', { className: 'nt-date-val', dateTime: p.value }, p.value.replace('T', ' '));
    return p.value;
  };
  const editable = (n, col) => {
    const td = el('td', { className: 'nt-cell', tabIndex: 0, title: 'Toca para editar' }, cellView(n, col));
    const edit = (e) => {
      if (td.querySelector('input:not(.nt-check)') || e?.target?.closest?.('.nt-check')) return;
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
  // Columnas propias: solo lectura.
  const builtinCell = (n, col) => {
    const t = col === 'Creada' ? n.createdAt || n.updatedAt : col === 'Modificada' ? n.updatedAt : null;
    return col === 'Carpeta' ? el('td', { className: 'muted nt-folder' }, folderOf(n.path)) : el('td', { className: 'muted nt-date' }, t ? dateKey(new Date(t)) : '');
  };
  const link = (n) => {
    const a = el('a', { href: '#', className: 'wikilink', title: n.path }, baseName(n.path));
    a.dataset.target = n.path;
    a.dataset.heading = '';
    return a;
  };

  const head = el('div', { className: 'query-head' }, `Tabla de notas${q.folder ? ` · ${q.folder}` : ''} · ${plural(rows.length, 'fila', 'filas')}`);
  const table = el('table', { className: 'note-table' }, [
    el('thead', {}, el('tr', {}, [th('Nota'), ...view.map(th)])),
    el('tbody', {}, shown.map((n) => el('tr', {}, [el('td', { className: 'nt-name' }, link(n)), ...view.map((c) => (builtinCol(c) ? builtinCell(n, c) : editable(n, c)))]))),
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
  // Escribe «columnas:». Solo con Modificada al final se queda como siempre; sin ella, «Nota» delante la oculta.
  const setColumns = (list) => {
    const others = list.filter((c) => builtinCol(c) && c !== 'Modificada');
    const out = !others.length && list.at(-1) === 'Modificada' ? list.slice(0, -1) : list.some(builtinCol) ? list : ['Nota', ...list];
    const lines = src.split('\n').filter((l) => !/^\s*(columnas|columns)\s*:/i.test(l));
    const next = [...lines.filter((l) => l.trim()), `columnas: ${out.join(', ')}`].join('\n');
    if (!replaceTableBlock(selfId, src, next)) showToastMessage('Esta tabla está incrustada: cambia las columnas en su nota.');
  };
  // «+ Columna»: añade una propiedad nueva o muestra/oculta las que hay (también Carpeta, Creada y Modificada).
  const addCol = el('button', { className: 'chip' }, '+ Columna');
  addCol.addEventListener('click', () =>
    openPicker({
      placeholder: 'Columna que añadir, mostrar u ocultar (p. ej. estado)',
      hint: 'Carpeta, Creada y Modificada son de la nota y no se editan · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cerrar',
      items: (typed) => {
        const t = typed.replace(/[:\n,]/g, ' ').trim();
        const has = (c) => view.some((x) => x.toLowerCase() === c.toLowerCase());
        const cands = [...TABLE_BUILTINS.slice(1), ...seen.values()].filter((c) => !has(c));
        const match = (c) => fold(c).includes(fold(t));
        const out = [];
        if (t && !has(t) && !cands.some((c) => c.toLowerCase() === t.toLowerCase())) out.push({ label: `Añadir columna: «${t}»`, create: true, action: () => setColumns([...view.filter((c) => c !== 'Modificada' || explicit), builtinCol(t) || t, ...(explicit ? [] : ['Modificada'])]) });
        cands.filter(match).forEach((c) => out.push({ label: `Mostrar «${c}»`, detail: builtinCol(c) ? 'de la nota · solo lectura' : 'propiedad', action: () => setColumns(builtinCol(c) ? [...view, c] : [...view.filter((x) => x !== 'Modificada' || explicit), c, ...(explicit ? [] : ['Modificada'])]) }));
        view.filter(match).forEach((c) => out.push({ label: `Ocultar «${c}»`, action: () => setColumns(view.filter((x) => x !== c)) }));
        return out;
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
