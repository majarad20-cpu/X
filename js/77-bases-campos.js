'use strict';

// ---------- Bases: campos con tipo, que se preguntan al crear cada entrada ----------
// La nota de la base guarda sus campos en la propiedad «campos», con su tipo:
//   campos: autor, estado:opción[Por leer|Leyendo|Leído], puntuacion:número, leido:fecha
// Tipos: texto, número, fecha, opción (con sus valores), casilla, lista (varios valores) y enlace.
// Cada campo es una propiedad de la nota de la entrada. «＋ Nueva entrada» abre la ficha vacía con
// todos los campos para rellenarlos antes de crearla; «🏷 Campos» los gestiona para toda la base.
const FIELD_TYPES = [
  ['texto', 'Texto'],
  ['número', 'Número'],
  ['fecha', 'Fecha'],
  ['opción', 'Opción (una de varias)'],
  ['casilla', 'Casilla (sí / no)'],
  ['lista', 'Varios valores'],
  ['enlace', 'Enlace (web)'],
];
const FIELD_PE = { texto: 'text', número: 'number', fecha: 'date', opción: 'text', casilla: 'checkbox', lista: 'list', enlace: 'text' };
const fieldTypeOf = (t) => (FIELD_TYPES.some(([k]) => k === t) ? t : 'texto');

function parseFields(str) {
  return String(str || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^([^:[\]]+?)\s*(?::\s*([^[\]\s]+)\s*(?:\[([^\]]*)\])?)?$/u);
    if (!m) return { key: s, type: 'texto', options: [] };
    return { key: m[1].trim(), type: fieldTypeOf((m[2] || 'texto').toLowerCase()), options: (m[3] || '').split('|').map((x) => x.trim()).filter(Boolean) };
  });
}
const fieldsStr = (list) => list.filter((f) => f.key.trim()).map((f) => `${f.key.trim()}${f.type !== 'texto' ? `:${f.type}` : ''}${f.type === 'opción' && f.options.length ? `[${f.options.join('|')}]` : ''}`).join(', ');

// Carpetas de las entradas de una base: las de sus vistas (o la de su nombre).
function baseFolders(base) {
  const fs = [...new Set(baseViews(base).map(viewFolder).filter(Boolean))];
  return fs.length ? fs : [baseName(base.path)];
}
const baseEntries = (base) => state.notes.filter((n) => !n.enc && baseFolders(base).includes(folderOf(n.path)));

// Los campos de la base; sin «campos», los que ya usan sus entradas (como texto).
function baseFields(base) {
  const own = parseFields(propOf(base, 'campos'));
  if (own.length) return own;
  return [...new Set(baseEntries(base).slice(0, 30).flatMap((n) => parseProps(n.body).props.map((p) => p.key)))].map((key) => ({ key, type: 'texto', options: [] }));
}
const setBaseFields = (base, list) => peSet(base, 'campos', 'text', fieldsStr(list));

// Tipo deducido para las plantillas: por el nombre o por las columnas de su tablero.
function guessField(key, views) {
  const board = views.map(([, code]) => code).filter((c) => c.startsWith('```tablero')).map((c) => qbParse('tablero', c.replace(/^```\w+\n|\n```$/g, ''))).find((q) => q.group === key);
  if (board?.boardCols) return { key, type: 'opción', options: board.boardCols.split(',').map((x) => x.trim()).filter(Boolean) };
  if (/fecha|cumplea|renovacion|garantia|riego|proximo|leido|visto/i.test(key)) return { key, type: 'fecha', options: [] };
  if (/puntuacion|precio|valor|horas|series|repeticiones|peso|presupuesto|progreso/i.test(key)) return { key, type: 'número', options: [] };
  if (/enlace|url|web/i.test(key)) return { key, type: 'enlace', options: [] };
  return { key, type: 'texto', options: [] };
}
const fcPrevCreate = createBase;
createBase = function createBaseWithFields(opts) {
  const base = fcPrevCreate(opts);
  if (base && opts.props) setBaseFields(base, Object.keys(opts.props).map((k) => guessField(k, opts.views || [])));
  return base;
};

// ---------- Controles según el tipo ----------
function fieldInput(f, value) {
  const v = Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value);
  let input;
  if (f.type === 'casilla') {
    input = el('input', { type: 'checkbox', checked: /^(true|s[ií]|yes|1|x)$/i.test(v.trim()), ariaLabel: f.key });
    input.getValue = () => input.checked;
    return input;
  }
  if (f.type === 'número') input = el('input', { type: 'number', step: 'any', value: v.replace(',', '.'), ariaLabel: f.key });
  else if (f.type === 'fecha') input = el('input', { type: /^\d{4}-\d{2}-\d{2}$/.test(v) || !v ? 'date' : 'text', value: v, ariaLabel: f.key });
  else if (f.type === 'enlace') input = el('input', { type: 'url', value: v, placeholder: 'https://…', ariaLabel: f.key });
  else if (f.type === 'lista') input = el('input', { type: 'text', value: v, placeholder: 'Valores separados por comas', ariaLabel: f.key });
  else input = el('input', { type: 'text', value: v, ariaLabel: f.key });
  if (f.type === 'opción' && f.options.length) {
    // Lista de valores sugeridos (se puede escribir otro).
    const id = `dl-${uid()}`;
    input.setAttribute('list', id);
    input.placeholder = f.options.join(' · ');
    input.dataset.list = id;
    input.dl = el('datalist', { id }, f.options.map((o) => el('option', { value: o })));
  }
  input.getValue = () => input.value;
  return input;
}

// ---------- Ficha (nueva o existente) ----------
// note = null: entrada nueva (se crea al pulsar «Crear» en `folder`).
openEntry = function openEntryTyped(note, { base = currentBase(), folder = '' } = {}) {
  const text = note ? noteText(note) : '';
  if (note && text === null) return showToastMessage('Esta entrada tiene contraseña: desbloquéala abriéndola como nota.');
  const { props, end } = parseProps(text || '');
  const body = (text || '').split('\n').slice(end > 0 ? end + 1 : 0).join('\n').replace(/^\n+/, '');
  const schema = base ? baseFields(base) : [];
  const rows = schema.map((f) => ({ ...f, value: props.find((p) => p.key.toLowerCase() === f.key.toLowerCase())?.value ?? '' }));
  props.forEach((p) => rows.some((r) => r.key.toLowerCase() === p.key.toLowerCase()) || rows.push({ key: p.key, type: Array.isArray(p.value) ? 'lista' : 'texto', options: [], value: p.value, own: true }));
  const back = entryModal();
  const title = el('input', { type: 'text', className: 'entry-title', value: note ? baseName(note.path) : '', placeholder: 'Nombre de la entrada', ariaLabel: 'Nombre de la entrada', maxLength: 120 });
  const fieldBox = el('div', { className: 'entry-fields' });
  const drawFields = () => fieldBox.replaceChildren(...rows.map((r, i) => {
    const input = fieldInput(r, r.value);
    input.addEventListener('input', () => (r.value = input.getValue()));
    input.addEventListener('change', () => (r.value = input.getValue()));
    const del = el('button', { type: 'button', className: 'icon-link', title: `Quitar «${r.key}» de esta entrada`, ariaLabel: `Quitar ${r.key}` }, '✕');
    del.addEventListener('click', () => {
      rows.splice(i, 1);
      drawFields();
    });
    const label = el('span', { className: 'entry-key', title: FIELD_TYPES.find(([k]) => k === r.type)?.[1] || '' }, r.key);
    return el('label', { className: `entry-field ft-${r.type}` }, [label, input, ...(input.dl ? [input.dl] : []), del]);
  }));
  drawFields();
  const addField = el('button', { type: 'button', className: 'link' }, '＋ Campo');
  addField.addEventListener('click', () => askNewField((f, everywhere) => {
    if (rows.some((r) => r.key.toLowerCase() === f.key.toLowerCase())) return showToastMessage(`Ya hay un campo «${f.key}»`);
    rows.push({ ...f, value: '' });
    drawFields();
    if (everywhere && base) addFieldsToBase(base, [f], { columns: true });
    fieldBox.lastChild?.querySelector('input')?.focus();
  }, !!base));
  const content = el('textarea', { className: 'notes entry-body', rows: 7, value: body, placeholder: 'Notas, reseña, enlaces, lo que quieras… (Markdown)', ariaLabel: 'Contenido' });
  const save = el('button', { className: 'primary' }, note ? 'Guardar' : 'Crear');
  const cancel = el('button', {}, 'Cancelar');
  save.addEventListener('click', () => {
    const name = cleanName(title.value);
    if (!note && !name) {
      title.focus();
      return showToastMessage('Ponle un nombre a la entrada');
    }
    back.hidden = true;
    writeEntry(note, name, rows, content.value, folder || (base ? baseFolders(base)[0] : ''));
  });
  cancel.addEventListener('click', () => (back.hidden = true));
  [title, content].forEach((x) => x.addEventListener('keydown', (e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && save.click()));
  title.addEventListener('keydown', (e) => e.key === 'Enter' && !e.ctrlKey && !e.metaKey && (e.preventDefault(), fieldBox.querySelector('input')?.focus()));
  const act = (label, fn, cls = 'link') => {
    const b = el('button', { className: cls }, label);
    b.addEventListener('click', () => {
      back.hidden = true;
      fn();
    });
    return b;
  };
  const where = note ? folderOf(note.path) : folder;
  back.replaceChildren(el('div', { className: 'modal entry-card' }, [
    el('div', { className: 'entry-head' }, [
      el('span', { className: 'muted' }, `${note ? '' : '＋ Nueva entrada · '}${base ? `${propOf(base, 'icono') || '📇'} ${baseName(base.path)} · ` : ''}${where}`),
      el('span', { className: 'spacer' }),
      ...(base ? [act('🏷 Campos de la base', () => openFieldsManager(base))] : []),
      ...(note ? [act('📝 Abrir como nota', () => openNote(note))] : []),
    ]),
    title,
    fieldBox,
    addField,
    content,
    el('div', { className: 'row entry-actions' }, [save, cancel, el('span', { className: 'spacer' }), ...(note ? [act('⧉ Duplicar', () => duplicateEntry(note)), act('➕ Nota vinculada', () => linkedNote(note)), act('🗑 Eliminar', () => deleteEntry(note), 'link danger-link')] : [])]),
  ]));
  back.hidden = false;
  title.focus();
  if (note) title.select();
};

function entryYaml(rows) {
  return rows.filter((r) => r.key.trim()).flatMap((r) => {
    const t = FIELD_PE[r.type] || 'text';
    const v = r.value;
    if (t === 'checkbox') return peLines(r.key.trim(), 'checkbox', v === true || /^(true|s[ií]|1)$/i.test(String(v)));
    if (t === 'list') return peLines(r.key.trim(), 'list', Array.isArray(v) ? v : String(v ?? ''));
    return peLines(r.key.trim(), t, String(v ?? '').trim());
  });
}

function writeEntry(note, name, rows, body, folder) {
  const yaml = entryYaml(rows);
  const text = `${yaml.length ? `---\n${yaml.join('\n')}\n---\n` : ''}${body.trim() ? `\n${body.replace(/\s+$/, '')}\n` : '\n'}`;
  if (!note) {
    if (!state.folders.includes(folder)) state.folders.push(folder);
    createNote({ folder, title: name, body: text, open: false });
    showToastMessage(`«${name}» añadida`);
    return renderBases();
  }
  qbEdit(note, (lines) => lines.splice(0, lines.length, ...text.split('\n')));
  if (name && name !== baseName(note.path)) renameNote(note, name);
  showToastMessage('Entrada guardada');
  renderBases();
}
saveEntry = (note, title, rows, body) => writeEntry(note, cleanName(title), rows, body, folderOf(note.path));

// «＋ Nueva entrada»: la ficha vacía con todos los campos de la base.
newEntry = function newEntryAsk(base, v) {
  openEntry(null, { base, folder: viewFolder(v) || baseFolders(base)[0] });
};

// Nombre, tipo y alcance de un campo nuevo.
function askNewField(done, canBase = true) {
  promptText({
    placeholder: 'Nombre del campo nuevo (p. ej. editorial)',
    action: 'Siguiente',
    onSubmit: (q) => {
      const key = q.trim().replace(/\s+/g, '_').replace(/[:,[\]|]/g, '');
      if (!key) return;
      pickFrom(`Tipo del campo «${key}»…`, FIELD_TYPES.map(([type, label]) => ({
        label,
        action: () => {
          const finish = (options = []) => {
            const f = { key, type, options };
            if (!canBase) return done(f, false);
            pickFrom(`¿Dónde añadir «${key}»?`, [
              { label: '📇 En toda la base (todas las entradas lo tendrán)', action: () => done(f, true) },
              { label: '📝 Solo en esta entrada', action: () => done(f, false) },
            ]);
          };
          if (type !== 'opción') return finish();
          promptText({ placeholder: 'Valores separados por comas (p. ej. Alta, Media, Baja)', action: 'Guardar valores', onSubmit: (vals) => finish(vals.split(',').map((x) => x.trim()).filter(Boolean)) });
        },
      })));
    },
  });
}

// Añade campos a la base (y, si se pide, vacíos a sus entradas y como columnas de sus tablas).
function addFieldsToBase(base, fields, { entries = false, columns = false } = {}) {
  const list = baseFields(base);
  fields.forEach((f) => list.some((x) => x.key.toLowerCase() === f.key.toLowerCase()) || list.push(f));
  setBaseFields(base, list);
  if (entries) baseEntries(base).forEach((n) => fields.forEach((f) => parseProps(noteText(n) || '').props.some((p) => p.key.toLowerCase() === f.key.toLowerCase()) || peSet(n, f.key, FIELD_PE[f.type] || 'text', f.type === 'casilla' ? false : '')));
  if (columns) addColumnsToTables(base, fields.map((f) => f.key));
}

// Las tablas de la base con columnas elegidas ganan las nuevas.
function addColumnsToTables(base, keys) {
  baseViews(base).filter((v) => v.kind === 'tabla').forEach((v) => {
    const m = qbParse('tabla', v.code);
    if (!m.columns.length) return; // muestra todas: ya saldrán
    const add = keys.filter((k) => !m.columns.some((c) => c.toLowerCase() === k.toLowerCase()));
    if (!add.length) return;
    m.columns.push(...add);
    qbReplace(base, { from: v.from, prefix: v.prefix, orig: v.orig }, qbEmit(m));
  });
}

function renameInTables(base, from, to) {
  baseViews(base).forEach((v) => {
    if (!new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(v.code)) return;
    const code = v.text.replace(new RegExp(`(?<=[:,=\\s])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s*(?:,|=|$|\\n))`, 'gim'), to);
    if (code !== v.text) qbReplace(base, { from: v.from, prefix: v.prefix, orig: v.orig }, code);
  });
}

function removeProp(note, key) {
  peEdit(note, (lines, { props }) => {
    const p = props.find((x) => x.key.toLowerCase() === key.toLowerCase());
    if (!p) return false;
    lines.splice(p.line, p.to - p.line + 1);
  });
}

// ---------- Gestor de campos de la base ----------
function openFieldsManager(base) {
  const orig = baseFields(base);
  const rows = orig.map((f) => ({ ...f, options: [...f.options], was: f.key }));
  const back = entryModal();
  const list = el('div', { className: 'fm-list' });
  const draw = () => list.replaceChildren(...rows.map((r, i) => {
    const name = el('input', { type: 'text', value: r.key, ariaLabel: 'Nombre del campo', className: 'fm-name' });
    name.addEventListener('input', () => (r.key = name.value.replace(/[:,[\]|]/g, '')));
    const type = el('select', { ariaLabel: 'Tipo' }, FIELD_TYPES.map(([k, l]) => el('option', { value: k }, l)));
    type.value = r.type;
    type.addEventListener('change', () => {
      r.type = type.value;
      draw();
    });
    const opts = r.type === 'opción' ? el('input', { type: 'text', value: r.options.join(', '), placeholder: 'Valores: Alta, Media, Baja', ariaLabel: 'Valores', className: 'fm-opts' }) : null;
    opts?.addEventListener('input', () => (r.options = opts.value.split(',').map((x) => x.trim()).filter(Boolean)));
    const mv = (d, label) => {
      const b = el('button', { type: 'button', className: 'icon-link', title: d < 0 ? 'Subir' : 'Bajar', disabled: !rows[i + d] }, label);
      b.addEventListener('click', () => {
        [rows[i], rows[i + d]] = [rows[i + d], rows[i]];
        draw();
      });
      return b;
    };
    const del = el('button', { type: 'button', className: 'icon-link danger-link', title: 'Quitar el campo' }, '✕');
    del.addEventListener('click', () => {
      rows.splice(i, 1);
      draw();
    });
    return el('div', { className: 'fm-row' }, [name, type, mv(-1, '↑'), mv(1, '↓'), del, ...(opts ? [opts] : [])]);
  }));
  draw();
  const add = el('button', { type: 'button', className: 'link' }, '＋ Añadir campo');
  add.addEventListener('click', () => {
    rows.push({ key: '', type: 'texto', options: [], was: null });
    draw();
    list.lastChild?.querySelector('input')?.focus();
  });
  const chk = (label, on) => {
    const c = el('input', { type: 'checkbox', checked: on });
    return [c, el('label', { className: 'fm-check' }, [c, label])];
  };
  const [toEntries, l1] = chk('Añadir los campos nuevos (vacíos) a las entradas que ya hay', true);
  const [toCols, l2] = chk('Mostrar los campos nuevos como columnas en las tablas', true);
  const [delFromEntries, l3] = chk('Quitar de las entradas los campos borrados (y su valor)', false);
  const save = el('button', { className: 'primary' }, 'Guardar campos');
  const cancel = el('button', {}, 'Cancelar');
  cancel.addEventListener('click', () => (back.hidden = true));
  save.addEventListener('click', () => {
    const clean = rows.filter((r) => r.key.trim()).map((r) => ({ ...r, key: r.key.trim().replace(/\s+/g, '_') }));
    const keys = clean.map((r) => r.key.toLowerCase());
    if (new Set(keys).size !== keys.length) return showToastMessage('Hay dos campos con el mismo nombre');
    back.hidden = true;
    const entries = baseEntries(base);
    // Renombrados: la propiedad cambia de nombre en todas las entradas y en las vistas.
    clean.filter((r) => r.was && r.was !== r.key).forEach((r) => {
      entries.forEach((n) => peRenameKey(n, r.was, r.key));
      renameInTables(base, r.was, r.key);
    });
    const added = clean.filter((r) => !r.was);
    const removed = orig.filter((f) => !clean.some((r) => r.was === f.key));
    setBaseFields(base, clean);
    if (added.length && toEntries.checked) entries.forEach((n) => added.forEach((f) => parseProps(noteText(n) || '').props.some((p) => p.key.toLowerCase() === f.key.toLowerCase()) || peSet(n, f.key, FIELD_PE[f.type] || 'text', f.type === 'casilla' ? false : '')));
    if (added.length && toCols.checked) addColumnsToTables(base, added.map((f) => f.key));
    if (removed.length && delFromEntries.checked) entries.forEach((n) => removed.forEach((f) => removeProp(n, f.key)));
    showToastMessage('Campos de la base guardados');
    renderBases();
  });
  back.replaceChildren(el('div', { className: 'modal entry-card fm-card' }, [
    el('h3', {}, `🏷 Campos de «${baseName(base.path)}»`),
    el('p', { className: 'muted' }, 'Cada campo es una propiedad de las notas de la base. Al crear una entrada nueva se pregunta por todos. Renombrar un campo lo cambia también en las entradas que ya hay.'),
    list,
    add,
    el('div', { className: 'fm-checks' }, [l1, l2, l3]),
    el('div', { className: 'row entry-actions' }, [save, cancel]),
  ]));
  back.hidden = false;
  list.querySelector('input')?.focus();
}

// Botón «🏷 Campos» en la pantalla de la base.
const fcPrevScreen = baseScreen;
baseScreen = function baseScreenWithFields(note) {
  const parts = fcPrevScreen(note);
  const top = parts[0];
  const btn = el('button', { title: 'Campos de la base: nombre, tipo y valores' }, '🏷 Campos');
  btn.addEventListener('click', () => openFieldsManager(note));
  top.querySelector('.side-btn')?.before(btn);
  return parts;
};
