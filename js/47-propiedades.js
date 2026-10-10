'use strict';

// ---------- Propiedades (como en Obsidian) ----------
// En la vista de lectura (y en la vista previa), el bloque --- clave: valor --- del principio de
// la nota se convierte en un panel editable: cada propiedad tiene un tipo (texto, lista, número,
// casilla, fecha, fecha y hora), su clave se puede renombrar y su valor se edita en su sitio.
// Al escribir se cambian solo las líneas de esa propiedad (lo demás del YAML se queda como está).
// Usa parseProps / yamlScalar / yamlUnquote de 30-tablas.js. Doble clic en la cabecera del panel
// edita el YAML como texto (40-edicion-bloques.js).
const PE_TYPES = {
  text: ['Aa', 'Texto'],
  list: ['☰', 'Lista'],
  number: ['#', 'Número'],
  checkbox: ['☑', 'Casilla'],
  date: ['📅', 'Fecha'],
  datetime: ['🕒', 'Fecha y hora'],
};
const PE_LIST_KEYS = /^(tags?|alias(es)?|cssclass(es)?)$/i;
const PE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
const PE_NUM = /^-?\d+(\.\d+)?$/;
const peTypeHint = new Map(); // clave (minúsculas) -> tipo elegido, para valores aún vacíos
let peBusy = false; // mientras se redibuja el panel no cuentan los blur/change de lo que desaparece
let peKnownCache = null;

const peKeyClean = (k) => String(k).replace(/[:\n]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[-#\s]+/, '');
const peRaw = (line) => line.slice(line.indexOf(':') + 1).trim();

// Tipo de una propiedad a partir de su valor (las comillas fuerzan texto).
function peTypeOf(p, raw) {
  if (p.items || PE_LIST_KEYS.test(p.key)) return 'list';
  const hint = peTypeHint.get(p.key.toLowerCase());
  if (!p.value && hint) return hint;
  if (/^["']/.test(raw)) return 'text';
  if (/^(true|false)$/i.test(p.value)) return 'checkbox';
  if (PE_NUM.test(p.value)) return 'number';
  if (PE_DATE.test(p.value)) return 'date';
  if (PE_DATETIME.test(p.value)) return 'datetime';
  return 'text';
}

const peSplit = (key, v) => (Array.isArray(v) ? v : String(v ?? '').split(/^tags?$/i.test(key) ? /[,\s]+/ : ',')).map((x) => String(x).trim()).map((x) => (/^tags?$/i.test(key) ? x.replace(/^#/, '') : x)).filter(Boolean);

// Valor convertido al pasar de un tipo a otro.
function peConvert(key, value, type) {
  const s = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  if (type === 'list') return peSplit(key, value);
  if (type === 'checkbox') return /^(true|s[ií]|yes|1|x)$/i.test(s.trim());
  if (type === 'number') return PE_NUM.test(s.trim().replace(',', '.')) ? s.trim().replace(',', '.') : '';
  if (type === 'date') return s.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  if (type === 'datetime') return s.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/)?.[0].replace(' ', 'T') || (s.match(/\d{4}-\d{2}-\d{2}/) ? `${s.match(/\d{4}-\d{2}-\d{2}/)[0]}T00:00` : '');
  return s;
}

// Líneas YAML de una propiedad. Las listas van con guiones; un texto que parezca otro tipo, entre comillas.
function peLines(key, type, value) {
  if (type === 'list') {
    const items = peSplit(key, value);
    return items.length ? [`${key}:`, ...items.map((x) => `  - ${yamlScalar(x)}`)] : [`${key}: []`];
  }
  if (type === 'checkbox') return [`${key}: ${value === true || value === 'true' ? 'true' : 'false'}`];
  const v = String(value ?? '').replace(/\n/g, ' ').trim();
  if (!v) return [`${key}:`];
  if (type === 'text' && (/^(true|false|null|~)$/i.test(v) || PE_NUM.test(v) || PE_DATE.test(v) || PE_DATETIME.test(v) || /^\[.*\]$/.test(v))) return [`${key}: "${v}"`];
  return [`${key}: ${type === 'text' ? yamlScalar(v) : v}`];
}

// Cambia el texto de la nota con `fn(lines, parsed)`; quita el bloque si se queda sin nada.
function peEdit(note, fn, focus) {
  if (typeof blockEdit !== 'undefined' && blockEdit) endBlockEdit({ render: false });
  flushNoteSave();
  const text = noteText(note);
  if (text === null) return false;
  const lines = text.split('\n');
  if (fn(lines, parseProps(text)) === false) return false;
  let next = lines.join('\n');
  const after = parseProps(next);
  if (after.end > 0 && !after.props.length && lines.slice(1, after.end).every((l) => !l.trim())) next = lines.slice(after.end + 1).join('\n');
  if (next === text) return false;
  if (note.enc) {
    unlockedNotes.set(note.id, next);
    scheduleEncrypt(note);
  } else note.body = next;
  note.updatedAt = Date.now();
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(note);
  const ta = $('#note-editor');
  if (ta.dataset.note === note.id) ta.value = next;
  peRefresh(note, focus);
  return true;
}

function peSet(note, key, type, value, { rename = null, focus } = {}) {
  return peEdit(note, (lines, { props, end }) => {
    const found = props.find((p) => p.key.toLowerCase() === key.toLowerCase());
    const k = rename || found?.key || key;
    if (rename && rename.toLowerCase() !== key.toLowerCase() && props.some((p) => p.key.toLowerCase() === rename.toLowerCase())) {
      showToastMessage(`Ya hay una propiedad «${rename}»`);
      return false;
    }
    const rows = peLines(k, type, value);
    if (found) lines.splice(found.line, found.to - found.line + 1, ...rows);
    else if (end > 0) lines.splice(end, 0, ...rows);
    else lines.unshift('---', ...rows, '---');
  }, focus);
}

// Solo cambia el nombre en la línea de la clave; las líneas que siguen (valor de varias líneas o
// anidado) se quedan tal cual.
function peRenameKey(note, key, rename) {
  return peEdit(note, (lines, { props }) => {
    const found = props.find((p) => p.key.toLowerCase() === key.toLowerCase());
    if (!found) return false;
    if (rename.toLowerCase() !== key.toLowerCase() && props.some((p) => p.key.toLowerCase() === rename.toLowerCase())) {
      showToastMessage(`Ya hay una propiedad «${rename}»`);
      return false;
    }
    const line = lines[found.line];
    const colon = line.indexOf(':', line.indexOf(found.key) + found.key.length);
    if (colon < 0) return false;
    lines[found.line] = `${line.match(/^\s*/)[0]}${rename}${line.slice(colon)}`;
  });
}

function peDelete(note, key) {
  peEdit(note, (lines, { props }) => {
    const found = props.find((p) => p.key.toLowerCase() === key.toLowerCase());
    if (!found) return false;
    lines.splice(found.line, found.to - found.line + 1);
  });
}

// Redibuja la nota sin perder el desplazamiento (ni el foco, si se indica dónde).
function peRefresh(note, focus) {
  const sc = $('#note-scroll');
  const rd = $('#note-reading');
  const keep = [sc.scrollTop, rd.scrollTop];
  peBusy = true;
  try {
    if (activeNote()?.id === note.id) renderNotePane(note);
    peHydrate();
    renderSidePanes();
    renderRightPanel();
  } finally {
    peBusy = false;
  }
  [sc.scrollTop, rd.scrollTop] = keep;
  if (focus) $(`#note-reading .pe-panel ${focus}`)?.focus({ preventScroll: true });
}

// Claves usadas en todas las notas y los valores de cada una (para sugerirlos). Cada tecla cambia
// dataRev: mientras se escribe (y no cambia el número de notas) la lista vale un momento, y cada
// cuerpo de nota se lee una sola vez (peKnownProps), así la vista previa no relee la bóveda.
const peKnownProps = new Map();
function peKnown() {
  const c = peKnownCache;
  if (c && (c.rev === dataRev || (c.n === state.notes.length && Date.now() - c.at < 1500 && document.activeElement === $('#note-editor')))) return c.keys;
  const keys = new Map();
  for (const n of state.notes) {
    if (n.enc || !n.body.startsWith('---')) continue;
    for (const p of memoBy(peKnownProps, n.body, (b) => parseProps(b).props)) {
      const k = p.key.toLowerCase();
      if (!keys.has(k)) keys.set(k, { key: p.key, values: new Set() });
      const vals = keys.get(k).values;
      (p.items || [p.value]).forEach((v) => v && vals.size < 200 && vals.add(v));
    }
  }
  peKnownCache = { rev: dataRev, n: state.notes.length, at: Date.now(), keys };
  return keys;
}
const peDatalist = (id, values) => el('datalist', { id }, [...values].slice(0, 200).map((v) => el('option', { value: v })));
const peSel = (key) => `.pe-row[data-key="${CSS.escape(key.toLowerCase())}"]`;

// Entrada de texto que guarda con Intro o al salir, y deshace con Esc.
function peInput(props, onCommit) {
  const input = el('input', props);
  const start = input.value;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      input.value = start;
      input.blur();
    }
  });
  input.addEventListener('change', () => !peBusy && input.value !== start && onCommit(input.value));
  return input;
}

function peValueEditor(note, p, type, idx, ro) {
  const key = p.key;
  const label = `Valor de ${key}`;
  const listId = `pe-vals-${idx}`;
  const known = peKnown().get(key.toLowerCase())?.values || new Set();
  if (ro) return el('span', { className: 'pe-raw muted', title: 'Valor con varias líneas: edítalo en el texto' }, p.value || '…');
  if (type === 'checkbox') {
    const box = el('input', { type: 'checkbox', className: 'pe-check', checked: /^true$/i.test(p.value), ariaLabel: label });
    box.addEventListener('change', () => peSet(note, key, 'checkbox', box.checked, { focus: `${peSel(key)} .pe-check` }));
    return box;
  }
  if (type === 'list') {
    const items = p.items || peSplit(key, p.value);
    const tags = /^tags?$/i.test(key);
    const chips = items.map((x, i) => {
      const del = el('button', { className: 'pe-x', type: 'button', title: `Quitar ${x}`, ariaLabel: `Quitar ${x}` }, '×');
      del.addEventListener('click', () => peSet(note, key, 'list', items.filter((_, j) => j !== i), { focus: `${peSel(key)} .pe-add-item` }));
      const txt = tags ? el('a', { href: '#', className: 'tag-link' }, `#${x}`) : el('span', {}, x);
      if (tags) txt.dataset.tag = x.toLowerCase();
      return el('span', { className: 'pe-chip' }, [txt, del]);
    });
    const add = el('input', { type: 'text', className: 'pe-add-item', placeholder: items.length ? '' : 'Vacío', ariaLabel: `Añadir a ${key}` });
    add.setAttribute('list', listId);
    const push = () => {
      const more = peSplit(key, add.value).filter((x) => !items.includes(x));
      add.value = '';
      if (more.length) peSet(note, key, 'list', [...items, ...more], { focus: `${peSel(key)} .pe-add-item` });
    };
    add.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || (e.key === ',' && add.value.trim())) {
        e.preventDefault();
        push();
      } else if (e.key === 'Backspace' && !add.value && items.length) {
        e.preventDefault();
        peSet(note, key, 'list', items.slice(0, -1), { focus: `${peSel(key)} .pe-add-item` });
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        add.value = '';
        add.blur();
      }
    });
    add.addEventListener('blur', () => !peBusy && add.value.trim() && push());
    return el('div', { className: 'pe-list' }, [...chips, add, peDatalist(listId, [...known].filter((v) => !items.includes(v)))]);
  }
  const kind = { number: 'number', date: 'date', datetime: 'datetime-local' }[type] || 'text';
  const value = type === 'datetime' ? p.value.replace(' ', 'T').slice(0, 16) : p.value;
  const input = peInput({ type: kind, className: 'pe-value', value, ariaLabel: label, placeholder: 'Vacío', ...(kind === 'number' ? { step: 'any' } : {}) }, (v) => peSet(note, key, type, v));
  if (kind === 'text') {
    input.setAttribute('list', listId);
    return el('span', { className: 'pe-valbox' }, [input, peDatalist(listId, known)]);
  }
  return input;
}

function peRow(note, p, lines, idx) {
  const raw = peRaw(lines[p.line]);
  // Varias líneas que no son una lista sencilla (texto en bloque, YAML anidado): solo se lee.
  const ro = p.to > p.line && (!p.items || lines.slice(p.line + 1, p.to + 1).some((l) => l.trim() && !/^\s*-(\s|$)/.test(l)));
  const type = ro ? 'text' : peTypeOf(p, raw);
  const [ico, name] = PE_TYPES[type];
  const typeBtn = el('button', { className: 'pe-ico', type: 'button', title: `${name} · cambiar el tipo o eliminar`, ariaLabel: `Tipo de ${p.key}: ${name}` }, ico);
  typeBtn.addEventListener('click', () =>
    showMenu(typeBtn, [
      ...(ro ? [] : Object.entries(PE_TYPES).map(([t, [i, l]]) => ({
        label: `${i}  ${l}${t === type ? ' ✓' : ''}`,
        action: () => {
          peTypeHint.set(p.key.toLowerCase(), t);
          if (t === type) return;
          if (!peSet(note, p.key, t, peConvert(p.key, p.items || p.value, t))) peRefresh(note);
        },
      }))),
      { sep: true },
      { label: 'Eliminar', danger: true, action: () => peDelete(note, p.key) },
    ])
  );
  const keyInput = peInput({ type: 'text', className: 'pe-key', value: p.key, ariaLabel: 'Nombre de la propiedad', spellcheck: false }, (v) => {
    const k = peKeyClean(v);
    if (!k) return peRefresh(note);
    if (ro) return k === p.key || peRenameKey(note, p.key, k) || peRefresh(note);
    if (!peSet(note, p.key, type, p.items || (type === 'checkbox' ? /^true$/i.test(p.value) : p.value), { rename: k })) peRefresh(note);
  });
  keyInput.setAttribute('list', 'pe-keys');
  const row = el('div', { className: 'pe-row' }, [typeBtn, keyInput, el('div', { className: 'pe-val' }, peValueEditor(note, p, type, idx, ro))]);
  row.dataset.key = p.key.toLowerCase();
  row.dataset.type = type;
  return row;
}

// Fila nueva: se escribe la clave y, al confirmarla, se pasa al valor.
function peNewRow(note, panel) {
  panel.querySelector('.pe-new')?.remove();
  let done = false;
  const key = el('input', { type: 'text', className: 'pe-key', placeholder: 'Nombre', ariaLabel: 'Nombre de la propiedad nueva', spellcheck: false });
  key.setAttribute('list', 'pe-keys');
  const row = el('div', { className: 'pe-row pe-new' }, [el('span', { className: 'pe-ico' }, '+'), key, el('div', { className: 'pe-val muted' }, 'Vacío')]);
  const finish = (keep) => {
    if (done || peBusy) return;
    done = true;
    const k = peKeyClean(key.value);
    if (!keep || !k) {
      row.remove();
      if (!panel.querySelector('.pe-row')) panel.remove();
      return;
    }
    const existing = parseProps(noteText(note) || '').props.find((x) => x.key.toLowerCase() === k.toLowerCase());
    const focus = `${peSel(k)} .pe-val :is(input, .pe-add-item)`;
    if (existing) return peRefresh(note, focus);
    const known = peKnown().get(k.toLowerCase());
    const type = peTypeHint.get(k.toLowerCase()) || (PE_LIST_KEYS.test(k) ? 'list' : known && [...known.values].length && [...known.values].every((v) => /^(true|false)$/i.test(v)) ? 'checkbox' : 'text');
    peSet(note, k, type, type === 'list' ? [] : type === 'checkbox' ? false : '', { focus });
  };
  key.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  });
  key.addEventListener('blur', () => finish(true));
  panel.querySelector('.pe-body').insertBefore(row, panel.querySelector('.pe-addbtn'));
  key.focus({ preventScroll: true });
}

function peBuild(note, text) {
  const lines = text.split('\n');
  const { props } = parseProps(text);
  const hidden = !!state.settings.propsHidden;
  const toggle = el('button', { className: 'pe-toggle', type: 'button', ariaExpanded: String(!hidden), title: 'Mostrar u ocultar las propiedades · doble clic en la cabecera para editar el YAML' }, [el('span', { className: 'pe-chev' }, '▾'), ' Propiedades']);
  const addBtn = el('button', { className: 'pe-addbtn', type: 'button' }, '+ Añadir propiedad');
  const body = el('div', { className: 'pe-body' }, [...props.map((p, i) => peRow(note, p, lines, i)), addBtn, peDatalist('pe-keys', [...peKnown().values()].map((x) => x.key))]);
  const panel = el('div', { className: `pe-panel${hidden ? ' collapsed' : ''}` }, [el('div', { className: 'pe-head' }, [toggle, el('span', { className: 'pe-count muted' }, props.length ? String(props.length) : '')]), body]);
  panel.dataset.note = note.id;
  toggle.addEventListener('click', () => peToggleHidden());
  addBtn.addEventListener('click', () => {
    panel.classList.remove('collapsed');
    peNewRow(note, panel);
  });
  // Dentro del panel, el doble clic no abre la edición del bloque (solo en la cabecera).
  body.addEventListener('dblclick', (e) => e.stopPropagation());
  return panel;
}

// Cambia el bloque <dl class="props"> de la vista de lectura por el panel editable.
function peHydrate() {
  const reading = $('#note-reading');
  const dl = reading.querySelector(':scope > dl.props');
  if (!dl) return;
  const note = noteById(reading.dataset.note);
  const text = note && noteText(note);
  if (!text) return;
  const panel = peBuild(note, text);
  if (dl.dataset.src) panel.dataset.src = dl.dataset.src;
  dl.replaceWith(panel);
}
new MutationObserver(() => !peBusy && peHydrate()).observe($('#note-reading'), { childList: true });

function peToggleHidden() {
  state.settings.propsHidden = !state.settings.propsHidden;
  save();
  $$('.pe-panel').forEach((p) => {
    p.classList.toggle('collapsed', state.settings.propsHidden);
    p.querySelector('.pe-toggle').ariaExpanded = String(!state.settings.propsHidden);
  });
  if (!$('#note-reading .pe-panel')) showToastMessage(state.settings.propsHidden ? 'Propiedades ocultas' : 'Propiedades visibles');
}

function peAddProperty() {
  const note = activeNote();
  if (!note) return showToastMessage('Abre una nota para añadirle propiedades.');
  if (noteText(note) === null) return showToastMessage('Desbloquea la nota para editar sus propiedades.');
  flushNoteSave();
  if (noteMode.get(note.id) === 'edit') setNoteMode(note, 'read');
  peRefresh(note);
  const reading = $('#note-reading');
  let panel = reading.querySelector(':scope > .pe-panel');
  if (!panel) {
    panel = peBuild(note, '');
    reading.querySelector(':scope > .note-empty')?.remove();
    reading.prepend(panel);
  }
  panel.classList.remove('collapsed');
  peNewRow(note, panel);
}

COMMANDS_EXTRA.push((note) => (note && noteText(note) !== null ? [
  { label: 'Añadir propiedad', action: peAddProperty },
  { label: 'Mostrar/ocultar propiedades', action: peToggleHidden },
] : []));
NOTE_MENU_EXTRA.push((note) => (noteText(note) === null ? null : { label: '🏷 Añadir propiedad', action: peAddProperty }));
