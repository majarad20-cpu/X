'use strict';

// ---------- Sin sintaxis: vistas de notas con menús ----------
// Un formulario («Insertar vista de notas…») escribe por ti los bloques ```notas, ```tabla, ```tablero y
// ```tareas (y los que añadan otros módulos). Cada vista de la lectura lleva un ⚙ que abre el mismo
// formulario con lo que ya tiene; al guardar se cambian solo las líneas de ese bloque.
// Además, con el clic derecho: «Insertar…» (todos los bloques del menú «/»), estilo del párrafo en la
// lectura, «Propiedades…» de una nota del explorador y «Ver como lista / tabla / tablero…» de una carpeta.

// Tipos de vista: qué campos usa cada uno. Otros módulos pueden añadir el suyo: QB_KINDS.push({ … }).
// «optional»: solo se ofrece si la lectura sabe pintar ese bloque.
const QB_KINDS = [
  { kind: 'notas', label: 'Lista de notas', icon: '📝', limit: 50, fields: ['folder', 'tags', 'links', 'filters', 'sort', 'show', 'limit'] },
  { kind: 'tabla', label: 'Tabla', icon: '▤', limit: 200, fields: ['folder', 'tags', 'filters', 'sort', 'columns', 'totals', 'group', 'limit'] },
  { kind: 'tablero', label: 'Tablero', icon: '▥', limit: 100, fields: ['folder', 'tags', 'filters', 'group', 'boardCols', 'sort', 'show', 'limit'] },
  { kind: 'tareas', label: 'Lista de tareas', icon: '✓', limit: 50, fields: ['folder', 'tags', 'project', 'status', 'when', 'limit'] },
  // «own»: opciones propias del bloque (clave sin acentos -> campo), que no son filtros.
  { kind: 'galeria', label: 'Galería', icon: '▦', optional: true, limit: 200, own: { tamano: 'size', size: 'size' }, fields: ['folder', 'tags', 'filters', 'sort', 'show', 'size', 'limit'] },
  { kind: 'calendario', label: 'Calendario', icon: '📅', optional: true, own: { fecha: 'dateProp', date: 'dateProp' }, fields: ['folder', 'tags', 'dateProp', 'filters', 'show'] },
];
const qbKind = (k) => QB_KINDS.find((d) => d.kind === k) || { kind: k, label: k, icon: '▤', fields: QB_KINDS[0].fields };
// Tipo de vista que pinta la lectura para un lenguaje de bloque (tasks -> tareas…), o null.
const qbLangCache = new Map();
function qbLangKind(lang) {
  const l = String(lang).toLowerCase();
  if (!qbLangCache.has(l)) {
    let k = null;
    try {
      k = renderMd('```' + l + '\n```', {}).match(/class="query" data-kind="([^"]+)"/)?.[1] || null;
    } catch {
      // Sin lectura: ningún tipo.
    }
    qbLangCache.set(l, k);
  }
  return qbLangCache.get(l);
}
const qbKindAvail = (d) => !d.optional || qbLangKind(d.kind) === d.kind;

const QB_OPS = [['=', 'es'], ['!', 'no es'], ['in', 'contiene'], ['>', 'mayor que'], ['<', 'menor que'], ['>=', 'desde (≥)'], ['<=', 'hasta (≤)'], ['has', 'tiene'], ['lacks', 'no tiene']];
const QB_STATUS = [['pending', 'Pendientes'], ['done', 'Hechas'], ['all', 'Todas']];
const QB_WHEN = [['', 'Cualquier fecha'], ['today', 'Para hoy (y vencidas)'], ['overdue', 'Vencidas'], ['week', 'Próximos 7 días'], ['nodate', 'Sin fecha']];
const QB_STATUS_WORD = { pending: 'pendientes', done: 'hechas', all: 'todas' };
const QB_WHEN_WORD = { today: 'hoy', overdue: 'vencidas', week: 'semana', nodate: 'sin fecha' };
// Orden por lo propio de la nota: la tabla usa sus columnas (Nota, Creada…); las demás vistas, nombre/creada/modificada.
const QB_SORT_TABLE = { nombre: 'Nota', creada: 'Creada', modificada: 'Modificada' };

const qbModel = (kind) => ({ kind, folder: '', tags: [], project: '', status: 'pending', when: '', links: '', group: kind === 'tablero' ? 'estado' : '', boardCols: '', filters: [], sort: '', desc: false, columns: [], show: [], limit: '', size: '', dateProp: '', totals: [], extra: [], extraKind: kind });

// Propiedades usadas en las notas: clave -> { key, values, list, n }.
let qbPropsCache = null;
function qbProps() {
  if (qbPropsCache?.rev === dataRev) return qbPropsCache.map;
  const map = new Map();
  state.notes.forEach((n) => {
    if (n.enc || !n.body.startsWith('---')) return;
    parseProps(n.body).props.forEach((p) => {
      const k = p.key.toLowerCase();
      if (!map.has(k)) map.set(k, { key: p.key, values: new Set(), list: false, n: 0 });
      const e = map.get(k);
      e.n++;
      if (p.items) e.list = true;
      (p.items || [p.value]).forEach((v) => v && e.values.size < 200 && e.values.add(v));
    });
  });
  qbPropsCache = { rev: dataRev, map };
  return map;
}
const qbKeys = () => [...qbProps().values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, 'es')).map((e) => e.key);
const qbTags = () => [...new Set([...state.notes.filter((n) => !n.enc).flatMap((n) => [...tagsIn(n.body), ...fmTags(n.body)]), ...allTags()])].sort((a, b) => a.localeCompare(b, 'es'));

// ---------- Texto del bloque <-> formulario ----------
// Lo que no se entiende se guarda tal cual (extra) y se vuelve a escribir al final.
function qbParse(kind, src) {
  const m = qbModel(kind);
  m.group = '';
  String(src).split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const own = line.match(/^([^\s:#]+)\s*:\s*(.*)$/u);
    const field = own && qbKind(kind).own?.[fold(own[1])];
    if (field) return void (m[field] = own[2].trim());
    const kv = line.match(/^(carpeta|folder|enlaza|links|l[ií]mite|limit|orden|sort|mostrar|show|columnas|columns|agrupar|group(?: by)?|totales|totals)\s*:\s*(.*)$/i);
    if (kv) {
      const k = fold(kv[1]);
      const v = kv[2].trim();
      if (k.startsWith('carp') || k === 'folder') m.folder = v;
      else if (k.startsWith('enl') || k === 'links') m.links = v;
      else if (k.startsWith('lim')) m.limit = v;
      else if (k === 'orden' || k === 'sort') {
        const s = parseQuerySort(v);
        m.sort = s.sort || '';
        m.desc = s.desc;
      } else if (k === 'mostrar' || k === 'show') m.show = splitList(v);
      else if (k.startsWith('tot')) {
        m.totals = splitList(v).map((x) => {
          const [col, fn] = x.split('=').map((y) => y.trim());
          return { col, fn: (typeof totalFn === 'function' && totalFn(fn)) || fn || '' };
        });
      } else if (k.startsWith('col')) {
        if (kind === 'tablero') m.boardCols = v;
        else m.columns = splitList(v);
      } else m.group = v;
      return;
    }
    if (kind !== 'tareas') {
      const f = parsePropFilter(line);
      if (f) {
        if (f.op === '=' && qbProps().get(f.key.toLowerCase())?.list) f.op = 'in';
        return m.filters.push(f);
      }
    }
    let known = false;
    line.split(/\s+/).forEach((w) => {
      if (w.startsWith('#') && w.length > 1) {
        m.tags.push(w.slice(1).toLowerCase());
        known = true;
      } else if (kind === 'tareas' && w.startsWith('+') && w.length > 1) {
        m.project = w.slice(1);
        known = true;
      }
    });
    if (kind === 'tareas') {
      const l = line.toLowerCase();
      const st = /\bhechas?\b|\bcompletadas?\b/.test(l) ? 'done' : /\btodas\b/.test(l) ? 'all' : /\bpendientes?\b/.test(l) ? 'pending' : '';
      const wh = /\bhoy\b/.test(l) ? 'today' : /\bvencidas?\b/.test(l) ? 'overdue' : /\bsemana\b/.test(l) ? 'week' : /sin fecha/.test(l) ? 'nodate' : '';
      if (st) m.status = st;
      if (wh) m.when = wh;
      known = known || !!(st || wh);
    }
    if (!known) m.extra.push(line);
  });
  if (kind === 'tablero' && !m.group) m.group = 'estado';
  // «columnas: autor» sin columnas propias lleva Modificada al final.
  if (kind === 'tabla' && m.columns.length && !m.columns.some(builtinCol)) m.columns.push('Modificada');
  return m;
}

// Cada campo: cómo se escribe (emit) y cómo se elige (ui). El orden de este objeto es el de las líneas.
const QB_FIELDS = {
  folder: {
    emit: (m) => (m.folder ? [`carpeta: ${m.folder}`] : []),
    ui: (m, ch) => qbRow('Carpeta', qbSelect([['', 'Todas las carpetas'], ...allFolders().map((f) => [f, f])], m.folder, (v) => ((m.folder = v), ch()), 'folder')),
  },
  tags: {
    emit: (m) => (m.tags.length ? [m.tags.map((t) => `#${t}`).join(' ')] : []),
    ui: (m, ch) => {
      const all = [...new Set([...m.tags, ...qbTags()])];
      return qbRow('Etiquetas', el('div', { className: 'qb-chips filters' }, all.length ? all.map((t) => {
        const on = m.tags.includes(t);
        const b = el('button', { type: 'button', className: `chip${on ? ' active' : ''}`, ariaPressed: String(on) }, `#${t}`);
        b.dataset.qbf = `tag:${t}`;
        b.addEventListener('click', () => {
          m.tags = on ? m.tags.filter((x) => x !== t) : [...m.tags, t];
          ch(true);
        });
        return b;
      }) : el('span', { className: 'muted' }, 'Aún no hay etiquetas.')), true);
    },
  },
  project: {
    emit: (m) => (m.project ? [`+${m.project}`] : []),
    ui: (m, ch) => qbRow('Proyecto', qbSelect([['', 'Cualquier proyecto'], ...state.projects.map((p) => [p.name.replace(/\s+/g, ''), p.name])], m.project, (v) => ((m.project = v), ch()), 'project')),
  },
  status: {
    emit: (m) => [QB_STATUS_WORD[m.status] || 'pendientes'],
    ui: (m, ch) => qbRow('Estado', qbSelect(QB_STATUS, m.status, (v) => ((m.status = v), ch()), 'status')),
  },
  when: {
    emit: (m) => (m.when ? [QB_WHEN_WORD[m.when]] : []),
    ui: (m, ch) => qbRow('Fecha', qbSelect(QB_WHEN, m.when, (v) => ((m.when = v), ch()), 'when')),
  },
  links: {
    emit: (m) => (m.links ? [`enlaza: ${m.links}`] : []),
    ui: (m, ch) => {
      const inp = el('input', { type: 'text', value: m.links, placeholder: 'Nombre de una nota (opcional)' });
      inp.dataset.qbf = 'links';
      inp.setAttribute('list', 'qb-notes');
      inp.addEventListener('input', () => ((m.links = inp.value.trim()), ch()));
      return qbRow('Que enlacen a', el('span', {}, [inp, el('datalist', { id: 'qb-notes' }, state.notes.filter((n) => !n.enc).slice(0, 400).map((n) => el('option', { value: baseName(n.path) })))]));
    },
  },
  group: {
    emit: (m) => (m.group ? [`agrupar: ${m.group}`] : []),
    // En la tabla, agrupar es opcional (filas en grupos plegables); en el tablero, por defecto «estado».
    ui: (m, ch) => qbRow('Agrupar por', qbSelect([...(m.kind === 'tablero' ? [] : [['', 'Sin agrupar']]), ...[...new Set(['estado', ...qbKeys()])].map((k) => [k, k])], m.kind === 'tablero' ? m.group || 'estado' : m.group, (v) => ((m.group = v), ch()), 'group')),
  },
  boardCols: {
    emit: (m) => (m.boardCols.trim() ? [`columnas: ${m.boardCols.trim()}`] : []),
    ui: (m, ch) => {
      const inp = el('input', { type: 'text', value: m.boardCols, placeholder: 'Orden de las columnas (opcional): pendiente, en curso, hecho' });
      inp.dataset.qbf = 'boardCols';
      inp.addEventListener('input', () => ((m.boardCols = inp.value), ch()));
      return qbRow('Columnas', inp);
    },
  },
  dateProp: {
    emit: (m) => (m.dateProp ? [`fecha: ${m.dateProp}`] : []),
    ui: (m, ch) => qbRow('Propiedad de fecha', qbSelect([['', 'fecha (o date, vence, due)'], ...qbKeys().map((k) => [k, k])], m.dateProp, (v) => ((m.dateProp = v), ch()), 'dateProp')),
  },
  filters: {
    emit: (m) => m.filters.filter((f) => f.key && (f.op === 'has' || f.op === 'lacks' || String(f.value).trim())).map((f) => {
      if (f.op === 'has' || f.op === 'lacks') return `${f.key}: ${f.op === 'has' ? '*' : '-'}`;
      const v = String(f.value).trim();
      const op = f.op === '=' || f.op === 'in' ? '' : f.op;
      // Un valor que empezaría como operador va entre comillas.
      return `${f.key}: ${op}${!op && /^(!|>|<|=|\*$|-$)/.test(v) ? `"${v}"` : v}`;
    }),
    ui: (m, ch) => {
      const keys = qbKeys();
      const rows = m.filters.map((f, i) => {
        const key = qbSelect([['', 'Propiedad…'], ...keys.map((k) => [k, k])], f.key, (v) => ((f.key = v), ch(true)), `fk${i}`);
        key.ariaLabel = 'Propiedad';
        const op = qbSelect(QB_OPS, f.op, (v) => ((f.op = v), ch(true)), `fo${i}`);
        op.ariaLabel = 'Condición';
        const lid = `qb-vals-${i}`;
        const val = el('input', { type: 'text', value: f.value, placeholder: 'Valor', ariaLabel: 'Valor', hidden: f.op === 'has' || f.op === 'lacks' });
        val.dataset.qbf = `fv${i}`;
        val.setAttribute('list', lid);
        val.addEventListener('input', () => ((f.value = val.value), ch()));
        const del = el('button', { type: 'button', className: 'qb-x', title: 'Quitar el filtro', ariaLabel: 'Quitar el filtro' }, '✕');
        del.addEventListener('click', () => (m.filters.splice(i, 1), ch(true)));
        const vals = [...(qbProps().get(String(f.key).toLowerCase())?.values || [])];
        return el('div', { className: 'qb-filter' }, [key, op, val, el('datalist', { id: lid }, vals.map((v) => el('option', { value: v }))), del]);
      });
      const add = el('button', { type: 'button', className: 'chip qb-add' }, '+ Añadir filtro');
      add.dataset.qbf = 'addfilter';
      add.addEventListener('click', () => (m.filters.push({ key: keys[0] || '', op: '=', value: '' }), ch(true)));
      return qbRow('Filtros por propiedad', el('div', { className: 'qb-filters' }, [...rows, add]), true);
    },
  },
  sort: {
    emit: (m) => (m.sort ? [`orden: ${m.sort}${m.desc ? ' desc' : ''}`] : []),
    ui: (m, ch) => {
      const own = m.kind === 'tabla' ? [['Nota', 'Nombre'], ['Carpeta', 'Carpeta'], ['Creada', 'Creada'], ['Modificada', 'Modificada']] : [['nombre', 'Nombre'], ['creada', 'Creada'], ['modificada', 'Modificada']];
      const taken = new Set(own.map(([v]) => fold(v)).concat(['nombre', 'nota', 'creada', 'modificada', 'carpeta']));
      const s = qbSelect([['', 'Predeterminado'], ...own, ...qbKeys().filter((k) => !taken.has(fold(k))).map((k) => [k, k])], m.sort, (v) => ((m.sort = v), ch()), 'sort');
      s.ariaLabel = 'Ordenar por';
      const dir = qbSelect([['asc', 'Ascendente'], ['desc', 'Descendente']], m.desc ? 'desc' : 'asc', (v) => ((m.desc = v === 'desc'), ch()), 'desc');
      dir.ariaLabel = 'Sentido';
      return qbRow('Ordenar por', el('div', { className: 'qb-inline' }, [s, dir]), true);
    },
  },
  columns: {
    emit: (m) => {
      const rest = m.columns.filter((c) => c !== 'Nota');
      return rest.length ? [`columnas: ${['Nota', ...rest].join(', ')}`] : [];
    },
    ui: (m, ch) => {
      const seen = new Map();
      ['Nota', ...m.columns, 'Carpeta', 'Creada', 'Modificada', ...qbKeys()].forEach((c) => {
        const id = builtinCol(c) ? c : c.toLowerCase();
        if (!seen.has(id)) seen.set(id, c);
      });
      return qbRow('Columnas', qbChecks([...seen.values()], (c) => c === 'Nota' || m.columns.includes(c), (c, on) => {
        m.columns = on ? [...m.columns, c] : m.columns.filter((x) => x !== c);
        ch();
      }, (c) => c === 'Nota', 'Sin marcar ninguna se ven todas las propiedades.'), true);
    },
  },
  // Fila de totales de la tabla (si 30-tablas.js los admite): columna=función.
  totals: {
    emit: (m) => {
      const t = m.totals.filter((x) => x.col && x.fn);
      return t.length ? [`totales: ${t.map((x) => `${x.col}=${x.fn}`).join(', ')}`] : [];
    },
    ui: (m, ch) => {
      if (typeof TABLE_TOTALS === 'undefined' && !m.totals.length) return '';
      const fns = typeof TABLE_TOTALS === 'undefined' ? [] : Object.keys(TABLE_TOTALS);
      const cols = [...new Set([...m.columns.filter((c) => c !== 'Nota'), ...qbKeys(), ...m.totals.map((x) => x.col)])];
      const rows = m.totals.map((t, i) => {
        const col = qbSelect([['', 'Columna…'], ...cols.map((c) => [c, c])], t.col, (v) => ((t.col = v), ch()), `tc${i}`);
        col.ariaLabel = 'Columna';
        const fn = qbSelect(fns.map((f) => [f, TABLE_TOTALS[f]]), t.fn, (v) => ((t.fn = v), ch()), `tf${i}`);
        fn.ariaLabel = 'Cálculo';
        const del = el('button', { type: 'button', className: 'qb-x', title: 'Quitar el total', ariaLabel: 'Quitar el total' }, '✕');
        del.addEventListener('click', () => (m.totals.splice(i, 1), ch(true)));
        return el('div', { className: 'qb-filter' }, [col, fn, del]);
      });
      const add = el('button', { type: 'button', className: 'chip qb-add' }, '+ Añadir total');
      add.dataset.qbf = 'addtotal';
      add.addEventListener('click', () => (m.totals.push({ col: cols[0] || '', fn: fns[0] || 'suma' }), ch(true)));
      return qbRow('Totales al pie', el('div', { className: 'qb-filters' }, [...rows, add]), true);
    },
  },
  show: {
    emit: (m) => (m.show.length ? [`mostrar: ${m.show.join(', ')}`] : []),
    ui: (m, ch) => {
      const list = [...new Map([...m.show, ...qbKeys()].map((k) => [k.toLowerCase(), k])).values()];
      if (!list.length) return qbRow('Mostrar', el('span', { className: 'muted' }, 'Las notas aún no tienen propiedades.'), true);
      return qbRow('Mostrar', qbChecks(list, (k) => m.show.includes(k), (k, on) => {
        m.show = on ? [...m.show, k] : m.show.filter((x) => x !== k);
        ch();
      }), true);
    },
  },
  size: {
    emit: (m) => (m.size ? [`tamaño: ${m.size}`] : []),
    ui: (m, ch) => qbRow('Tamaño de las tarjetas', qbSelect([['', 'Mediano'], ['pequeño', 'Pequeño'], ['grande', 'Grande']], m.size, (v) => ((m.size = v), ch()), 'size')),
  },
  limit: {
    emit: (m) => (Number(m.limit) > 0 ? [`límite: ${Math.round(Number(m.limit))}`] : []),
    ui: (m, ch) => {
      const inp = el('input', { type: 'number', min: 1, max: 1000, step: 1, value: m.limit, placeholder: String(qbKind(m.kind).limit || '') });
      inp.dataset.qbf = 'limit';
      inp.addEventListener('input', () => ((m.limit = inp.value), ch()));
      return qbRow(m.kind === 'tablero' ? 'Límite por columna' : 'Límite', inp);
    },
  },
};

function qbEmit(m) {
  const d = qbKind(m.kind);
  const lines = Object.keys(QB_FIELDS).filter((f) => d.fields.includes(f)).flatMap((f) => QB_FIELDS[f].emit(m));
  if (m.extraKind === m.kind) lines.push(...m.extra);
  return ['```' + m.kind, ...lines, '```'].join('\n');
}

// Otro tipo de vista con lo que se pueda aprovechar (mostrar <-> columnas, orden por nombre…).
function qbSwitchKind(m, kind) {
  if (m.kind === kind) return m;
  const out = { ...m, kind, tags: [...m.tags], filters: m.filters.map((f) => ({ ...f })), totals: m.totals.map((t) => ({ ...t })), show: [...m.show], columns: [...m.columns] };
  if (kind === 'tabla' && m.kind !== 'tabla') out.columns = m.show.length ? ['Nota', ...m.show] : [];
  if (m.kind === 'tabla' && kind !== 'tabla') out.show = m.columns.filter((c) => !builtinCol(c));
  if (kind === 'tablero' && !out.group) out.group = 'estado';
  if (m.kind === 'tablero' && kind === 'tabla') out.group = '';
  if (kind === 'tabla' && QB_SORT_TABLE[fold(m.sort)]) out.sort = QB_SORT_TABLE[fold(m.sort)];
  if (m.kind === 'tabla' && kind !== 'tabla') {
    const back = Object.entries(QB_SORT_TABLE).find(([, v]) => v === m.sort);
    if (back) out.sort = back[0];
    else if (m.sort === 'Carpeta') out.sort = '';
  }
  return out;
}

// ---------- Piezas del formulario ----------
function qbRow(label, control, group = false) {
  return group
    ? el('div', { className: 'qb-row', role: 'group', ariaLabel: label }, [el('div', { className: 'qb-label' }, label), control])
    : el('label', { className: 'qb-row' }, [el('span', { className: 'qb-label' }, label), control]);
}
function qbSelect(opts, value, on, f) {
  const s = el('select', {}, opts.map(([v, l]) => el('option', { value: v }, l)));
  if (value && !opts.some(([v]) => v === value)) s.append(el('option', { value }, value));
  s.value = value ?? '';
  s.dataset.qbf = f;
  s.addEventListener('change', () => on(s.value));
  return s;
}
function qbChecks(list, isOn, on, isFixed = () => false, hint = '') {
  return el('div', { className: 'qb-checks' }, [
    ...list.map((c) => {
      const cb = el('input', { type: 'checkbox', checked: isOn(c), disabled: isFixed(c) });
      cb.dataset.qbf = `cb:${c}`;
      cb.addEventListener('change', () => on(c, cb.checked));
      return el('label', { className: 'qb-check' }, [cb, ` ${c}`]);
    }),
    hint ? el('span', { className: 'muted qb-hint' }, hint) : '',
  ]);
}

// ---------- El diálogo ----------
let qb = null; // { model, target: { mode: 'insert' | 'after' | 'replace' | 'create', note, line, from, prefix, orig } }

function qbModal() {
  let back = $('#qb');
  if (back) return back;
  const close = el('button', { className: 'iv-close modal-x', type: 'button', ariaLabel: 'Cerrar' }, '✕');
  const cancel = el('button', { type: 'button' }, 'Cancelar');
  const ok = el('button', { id: 'qb-ok', className: 'primary', type: 'button' }, 'Insertar');
  const dialog = el('div', { className: 'modal qb-modal', role: 'dialog' }, [
    el('header', { className: 'modal-head' }, [el('h3', { id: 'qb-title' }, 'Vista de notas'), close]),
    el('div', { className: 'qb-main' }, [
      el('div', { id: 'qb-form', className: 'qb-form' }),
      el('div', { className: 'qb-side' }, [
        el('div', { className: 'qb-label' }, 'Vista previa'),
        el('div', { id: 'qb-preview', className: 'qb-preview md' }),
        el('details', { className: 'qb-code' }, [el('summary', {}, 'Ver código'), el('pre', { id: 'qb-src', className: 'code' })]),
      ]),
    ]),
    el('div', { className: 'row end qb-foot' }, [cancel, ok]),
  ]);
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'qb-title');
  back = el('div', { id: 'qb', className: 'modal-back', hidden: true }, dialog);
  close.addEventListener('click', qbClose);
  cancel.addEventListener('click', qbClose);
  ok.addEventListener('click', qbSubmit);
  back.addEventListener('click', (e) => e.target === back && qbClose());
  // Las teclas no siguen hasta los atajos de la app.
  back.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      qbClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      qbSubmit();
    }
  });
  document.body.append(back);
  return back;
}

function qbOpen({ kind = 'notas', model = null, target }) {
  qb = { model: model || qbModel(kind), target };
  const back = qbModal();
  $('#qb-title').textContent = target.mode === 'replace' ? '⚙ Configurar la vista' : target.mode === 'create' ? 'Nueva vista de notas' : 'Insertar vista de notas';
  $('#qb-ok').textContent = target.mode === 'replace' ? 'Guardar' : target.mode === 'create' ? 'Crear nota con la vista' : 'Insertar';
  back.hidden = false;
  document.body.classList.add('qb-modal-open');
  qbDraw();
  back.querySelector('.qb-kinds .chip.active')?.focus();
}

function qbClose() {
  const back = $('#qb');
  if (back) back.hidden = true;
  qb = null;
  if ($('#qb-props')?.hidden !== false) document.body.classList.remove('qb-modal-open');
}

// Redibuja el formulario (al cambiar de tipo, añadir un filtro…) sin perder el foco.
function qbDraw() {
  const m = qb.model;
  const d = qbKind(m.kind);
  const keep = document.activeElement?.dataset?.qbf;
  const kinds = QB_KINDS.filter((k) => k.kind === m.kind || qbKindAvail(k));
  if (!kinds.some((k) => k.kind === m.kind)) kinds.push(d);
  const chips = el('div', { className: 'filters qb-kinds' }, kinds.map((k) => {
    const on = k.kind === m.kind;
    const b = el('button', { type: 'button', className: `chip${on ? ' active' : ''}`, ariaPressed: String(on) }, `${k.icon} ${k.label}`);
    b.dataset.kind = k.kind;
    b.dataset.qbf = `kind:${k.kind}`;
    b.addEventListener('click', () => {
      qb.model = qbSwitchKind(qb.model, k.kind);
      qbDraw();
    });
    return b;
  }));
  const ch = (redraw) => (redraw ? qbDraw() : qbPreview());
  $('#qb-form').replaceChildren(qbRow('Tipo de vista', chips, true), ...Object.keys(QB_FIELDS).filter((f) => d.fields.includes(f)).map((f) => QB_FIELDS[f].ui(m, ch)));
  if (keep) $(`#qb-form [data-qbf="${CSS.escape(keep)}"]`)?.focus({ preventScroll: true });
  qbPreview();
}

// La vista previa usa los mismos dibujos que la lectura (sin tocarla: no recibe clics).
function qbPreview() {
  const text = qbEmit(qb.model);
  $('#qb-src').textContent = text;
  const pv = $('#qb-preview');
  const self = qb.target.note?.id || '';
  try {
    pv.innerHTML = renderMd(text, { noteId: self });
    hydrateQueries(pv, self);
  } catch {
    pv.replaceChildren(el('p', { className: 'muted' }, 'No se puede mostrar la vista previa.'));
  }
}

function qbSubmit() {
  if (!qb) return;
  const { model, target: t } = qb;
  const text = qbEmit(model);
  qbClose();
  if (t.mode === 'create') return qbCreateNote(model, text);
  const note = noteById(t.note?.id);
  if (!note || noteText(note) === null) return showToastMessage('No se encuentra la nota (¿está bloqueada?).');
  if (t.mode === 'replace') return qbReplace(note, t, text) && showToastMessage('Vista actualizada');
  if (t.mode === 'after') return qbEdit(note, (lines) => qbSplice(lines, t.line, text));
  // En el cursor si se está editando; si no, al final de la nota.
  if (activeNote()?.id === note.id && (blockEdit || isEditing(note.id))) return insertBlockText(`${text}\n‸`);
  qbEdit(note, (lines) => qbSplice(lines, lines.length - 1, text));
}

function qbCreateNote(m, text) {
  if (!state.folders.includes('Vistas')) state.folders.push('Vistas');
  const where = m.folder ? m.folder.replace(/\//g, ' - ') : 'Todas las notas';
  createNote({ folder: 'Vistas', title: `${where} (${qbKind(m.kind).label.toLowerCase()})`, body: `${m.folder ? `Notas de la carpeta «${m.folder}».` : 'Todas las notas.'} Usa ⚙ para cambiar la vista.\n\n${text}\n`, edit: false, log: false });
}

// Abre el diálogo para insertar en la nota abierta (en el cursor, tras el bloque que se editaba o al final).
function qbOpenInsert(kind = 'notas', folder = '') {
  const note = activeNote();
  const model = { ...qbModel(kind), folder };
  if (!note || noteText(note) === null) return qbOpen({ model, target: { mode: 'create' } });
  // Un clic en el diálogo cerraría el bloque que se edita: se cierra antes y se inserta tras él.
  if (blockEdit?.noteId === note.id) {
    const b = blockEdit;
    const line = b.from === null ? null : b.from + b.last.split('\n').length - 1;
    endBlockEdit();
    return qbOpen({ model, target: line === null ? { mode: 'insert', note } : { mode: 'after', note, line } });
  }
  qbOpen({ model, target: { mode: 'insert', note } });
}

// ---------- Cambiar el texto de la nota ----------
// fn(lines) cambia las líneas (false = nada). Sirve también para las notas con contraseña ya abiertas.
function qbEdit(note, fn) {
  if (blockEdit) endBlockEdit({ render: false });
  flushNoteSave();
  const text = noteText(note);
  if (text === null) return false;
  const lines = text.split('\n');
  if (fn(lines) === false) return false;
  const next = lines.join('\n');
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
  renderAll();
  return true;
}

// Mete el texto tras la línea `at`, con una línea en blanco alrededor.
function qbSplice(lines, at, text) {
  const add = text.split('\n');
  if (!lines.join('').trim()) return void lines.splice(0, lines.length, ...add);
  const i = Math.min(at, lines.length - 1) + 1;
  lines.splice(i, 0, ...(lines[i - 1]?.trim() ? [''] : []), ...add, ...(i < lines.length && lines[i]?.trim() ? [''] : []));
}

// Primera línea de un bloque (t.orig) en el texto: donde estaba o donde esté ahora. -1 si ya no está.
function qbFind(lines, t) {
  const n = t.orig.split('\n').length;
  if (lines.slice(t.from, t.from + n).join('\n') === t.orig) return t.from;
  const all = lines.join('\n');
  const k = all.indexOf(t.orig);
  return k < 0 ? -1 : all.slice(0, k).split('\n').length - 1;
}

function qbReplace(note, t, text) {
  return qbEdit(note, (lines) => {
    const from = qbFind(lines, t);
    if (from < 0) {
      showToastMessage('La nota cambió: vuelve a abrir la vista.');
      return false;
    }
    lines.splice(from, t.orig.split('\n').length, ...text.split('\n').map((l) => t.prefix + l));
  });
}

function qbRemove(note, f) {
  flushNoteSave();
  const go = () => qbEdit(note, (lines) => {
    const from = qbFind(lines, f);
    if (from < 0) return false;
    lines.splice(from, f.orig.split('\n').length);
    if (from > 0 && !lines[from - 1].trim() && !lines[from]?.trim()) lines.splice(from, 1);
  });
  if (note.enc) go();
  else withUndo('Vista quitada', go);
}

// Bloques de consulta entre las líneas [from, to] (también dentro de una cita o recuadro: «> »).
function qbFences(lines, from = 0, to = lines.length - 1) {
  const out = [];
  for (let i = from; i <= to && i < lines.length; i++) {
    const m = lines[i].match(/^((?:\s*>)*\s*)```\s*([\w-]+)/);
    if (!m) continue;
    const pre = m[1];
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j].slice(pre.length))) j++;
    const end = Math.min(j, lines.length - 1);
    const kind = qbLangKind(m[2]);
    if (kind) {
      const own = lines.slice(i, end + 1);
      out.push({ from: i, to: end, prefix: pre, kind, code: lines.slice(i + 1, j).map((l) => l.slice(pre.length)).join('\n'), orig: own.join('\n'), text: own.map((l) => l.slice(pre.length)).join('\n') });
    }
    i = j;
  }
  return out;
}

// El bloque de texto de una vista pintada en la lectura.
function qbFenceOf(note, box) {
  const top = box.closest('#note-reading > [data-src]');
  const text = noteText(note);
  if (!top || text === null || box.closest('.embed')) return null;
  const [from, to] = shiftedRange(top.dataset.src);
  const code = decodeURIComponent(box.dataset.code || '');
  const same = qbFences(text.split('\n'), from, to).filter((f) => f.code === code);
  const boxes = (top.matches('.query') ? [top] : [...top.querySelectorAll('.query[data-kind]')]).filter((b) => decodeURIComponent(b.dataset.code || '') === code);
  return same[Math.max(0, boxes.indexOf(box))] || same[0] || null;
}

const qbConfigure = (note, f) => qbOpen({ model: qbParse(f.kind, f.code), target: { mode: 'replace', note, from: f.from, prefix: f.prefix, orig: f.orig } });

function qbConfigureBox(box) {
  const note = noteById($('#note-reading').dataset.note);
  const f = note && qbFenceOf(note, box);
  if (!f) return showToastMessage('Esta vista no se puede configurar aquí (¿está incrustada de otra nota?).');
  qbConfigure(note, f);
}

// ⚙ en cada vista de la lectura (se vuelve a poner si la vista se redibuja).
function qbGears() {
  $$('#note-reading .query[data-kind]').forEach((box) => {
    if (box.querySelector(':scope > .qb-gear') || box.closest('.embed')) return;
    const b = el('button', { type: 'button', className: 'qb-gear', title: 'Configurar esta vista', ariaLabel: 'Configurar esta vista' }, '⚙');
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      qbConfigureBox(box);
    });
    box.append(b);
  });
}
READING_EXTRA.push(() => qbGears());
new MutationObserver(qbGears).observe($('#note-reading'), { childList: true, subtree: true });

// Opciones del clic derecho sobre una vista.
function qbQueryItems(note, box) {
  const f = qbFenceOf(note, box);
  if (!f) return [];
  const switchable = f.kind !== 'tareas' ? QB_KINDS.filter((d) => d.kind !== 'tareas' && d.kind !== f.kind && qbKindAvail(d)) : [];
  return [
    { label: '⚙ Configurar la vista…', action: () => qbConfigure(note, f) },
    ...switchable.map((d) => ({ label: `${d.icon} Cambiar a ${d.label.toLowerCase()}`, action: () => qbReplace(note, f, qbEmit(qbSwitchKind(qbParse(f.kind, f.code), d.kind))) })),
    { label: 'Copiar como texto', action: () => copyText(f.text, 'Bloque copiado') },
    { label: 'Quitar el bloque', danger: true, action: () => qbRemove(note, f) },
  ];
}

// ---------- Estilo de un bloque desde la lectura ----------
const QB_TEXT_BLOCKS = ':is(p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, details, .callout, [align])';

function qbRestyle(note, from, to, kind, arg) {
  qbEdit(note, (lines) => {
    const ls = lines.slice(from, to + 1);
    let out = convertLines(ls, kind, arg);
    // Un título es de una línea.
    if (kind === 'h' && out.length > 1) out = [`${'#'.repeat(arg)} ${unwrapLines(ls).map(bareLine).filter((l) => l.trim()).join(' ')}`];
    lines.splice(from, to - from + 1, ...out);
  });
}
const qbPickCallout = (note, from, to) => pickCallout((type, fold) => qbRestyle(note, from, to, 'callout', { type, fold }));

function qbParaItems(note, from, to) {
  const go = (kind, arg) => () => qbRestyle(note, from, to, kind, arg);
  return [
    { label: '¶ Párrafo', action: go('p') },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `H${n} Título ${n}`, action: go('h', n) })),
    { label: '❝ Cita', action: go('quote') },
    { label: '▣ Recuadro…', action: () => qbPickCallout(note, from, to) },
    { label: '• Lista', action: go('ul') },
    { label: '1. Lista numerada', action: go('ol') },
    { label: '☐ Tarea', action: go('task') },
    { label: '▾ Sección desplegable', action: go('details') },
    { sep: true },
    { label: '⇤ Alinear a la izquierda', action: go('align', 'left') },
    { label: '↔ Centrar', action: go('align', 'center') },
    { label: '⇥ Alinear a la derecha', action: go('align', 'right') },
    { label: '☰ Justificar', action: go('align', 'justify') },
  ];
}

// ---------- Insertar… (todos los bloques del menú «/», por grupos) ----------
const qbRunSlash = (it) => (it.run ? it.run() : insertBlockText(typeof it.text === 'function' ? it.text() : it.text));

// En la lectura: pasa a edición con el cursor en una línea nueva tras el bloque `to` (null = al final).
function qbInsertAfter(note, to, fn) {
  if (blockEdit) endBlockEdit({ render: false });
  flushNoteSave();
  noteMode.set(note.id, preferredEditMode());
  renderNotePane(note);
  const ta = $('#note-editor');
  if (ta.value.trim()) {
    const lines = ta.value.split('\n');
    const at = to == null || to >= lines.length ? lines.length - 1 : to;
    const pos = lines.slice(0, at + 1).join('\n').length;
    // Una línea en blanco antes y otra después (si la siguiente ya lo está, basta con esa).
    const blankNext = at === lines.length - 1 || !lines[at + 1].trim();
    editorInsert(ta, blankNext ? '\n\n' : '\n\n\n', pos, pos, pos + 2);
  } else ta.focus({ preventScroll: true });
  fn();
}

// where: null = en el editor (donde está el cursor); { note, to } = tras ese bloque de la lectura.
function qbInsertPicker(where = null) {
  const run = (it) => (where ? qbInsertAfter(where.note, where.to, () => qbRunSlash(it)) : qbRunSlash(it));
  const view = (kind = 'notas') => () => {
    if (where) qbOpen({ kind, target: where.to == null ? { mode: 'insert', note: where.note } : { mode: 'after', note: where.note, line: where.to } });
    else qbOpenInsert(kind);
  };
  // Las consultas del menú «/» abren el formulario en vez de dejar el código a medias.
  const asItem = (it) => {
    const kind = typeof it.text === 'string' && qbLangKind(it.text.match(/^```([\w-]+)/)?.[1] || '');
    return { label: `${it.icon || '•'} ${it.label}`, detail: it.group, keys: it.keys || '', action: kind ? view(kind) : () => run(it) };
  };
  const items = SLASH_ITEMS.filter((it) => !it.when || it.when()).map(asItem);
  const viewItem = { label: '▤ Vista de notas (lista, tabla, tablero…)…', detail: 'Sin escribir código', keys: 'vista consulta tabla tablero lista galeria notas', action: view() };
  const groups = [...new Set(items.map((it) => it.detail))];
  openPicker({
    placeholder: 'Insertar… (elige un grupo o escribe para buscar)',
    hint: '<kbd>↑↓</kbd> moverse · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cerrar',
    items: (q) => {
      if (q) return [viewItem, ...items].filter((it) => fold(`${it.label} ${it.detail} ${it.keys}`).includes(fold(q)));
      return [viewItem, ...groups.map((g) => {
        const list = items.filter((it) => it.detail === g);
        return { label: `${g} ▸`, detail: plural(list.length, 'bloque', 'bloques'), action: () => pickFrom(`Insertar · ${g}…`, list.map((it) => ({ label: it.label, detail: '', action: it.action }))) };
      })];
    },
  });
}

// ---------- Propiedades de una nota (desde el explorador) ----------
let qbPropsNote = null;

function qbPropsModal() {
  let back = $('#qb-props');
  if (back) return back;
  const close = el('button', { className: 'iv-close modal-x', type: 'button', ariaLabel: 'Cerrar' }, '✕');
  const open = el('button', { type: 'button' }, 'Abrir la nota');
  const done = el('button', { type: 'button', className: 'primary' }, 'Hecho');
  const dialog = el('div', { className: 'modal qbp-modal', role: 'dialog' }, [
    el('header', { className: 'modal-head' }, [el('h3', { id: 'qbp-title' }, 'Propiedades'), close]),
    el('div', { id: 'qbp-body', className: 'qbp-body md' }),
    el('div', { className: 'row end qb-foot' }, [open, done]),
  ]);
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'qbp-title');
  back = el('div', { id: 'qb-props', className: 'modal-back', hidden: true }, dialog);
  close.addEventListener('click', qbPropsClose);
  done.addEventListener('click', qbPropsClose);
  open.addEventListener('click', () => {
    const note = noteById(qbPropsNote);
    qbPropsClose();
    if (note) openNote(note);
  });
  back.addEventListener('click', (e) => e.target === back && qbPropsClose());
  back.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' && $('#note-menu').hidden) {
      e.preventDefault();
      qbPropsClose();
    }
  });
  // Si el panel se queda vacío (se cancela la propiedad nueva), se vuelve a poner.
  new MutationObserver(() => qbPropsNote && !back.hidden && !$('#qbp-body .pe-panel') && qbPropsRender()).observe(dialog, { childList: true, subtree: true });
  document.body.append(back);
  return back;
}

function qbPropsRender(focus) {
  const note = noteById(qbPropsNote);
  const text = note && noteText(note);
  if (text === null || !note) return qbPropsClose();
  peBusy = true;
  try {
    const panel = peBuild(note, text);
    panel.classList.remove('collapsed');
    // Listas de sugerencias propias (las de la lectura tienen los mismos id).
    panel.querySelectorAll('datalist').forEach((d) => {
      const old = d.id;
      d.id = `qbp-${old}`;
      panel.querySelectorAll(`[list="${CSS.escape(old)}"]`).forEach((i) => i.setAttribute('list', d.id));
    });
    $('#qbp-body').replaceChildren(panel);
  } finally {
    peBusy = false;
  }
  if (focus) $(`#qbp-body .pe-panel ${focus}`)?.focus({ preventScroll: true });
}

function qbOpenProps(note) {
  if (noteText(note) === null) return showToastMessage('Desbloquea la nota para ver sus propiedades.');
  const back = qbPropsModal();
  qbPropsNote = note.id;
  $('#qbp-title').textContent = `🏷 Propiedades · ${baseName(note.path)}`;
  back.hidden = false;
  document.body.classList.add('qb-modal-open');
  qbPropsRender();
  const panel = $('#qbp-body .pe-panel');
  if (!parseProps(noteText(note)).props.length) peNewRow(note, panel);
  else panel.querySelector('.pe-value, .pe-add-item, .pe-check')?.focus({ preventScroll: true });
}

function qbPropsClose() {
  qbPropsNote = null;
  const back = $('#qb-props');
  if (back) back.hidden = true;
  if ($('#qb')?.hidden !== false) document.body.classList.remove('qb-modal-open');
}

// Tras cada cambio del editor de propiedades (47-propiedades.js) se redibuja también el del diálogo.
const qbPeRefreshBase = peRefresh;
peRefresh = (note, focus) => {
  qbPeRefreshBase(note, focus);
  if (qbPropsNote === note.id && !$('#qb-props').hidden) qbPropsRender(focus);
};

// Esc cierra los diálogos aunque el foco haya salido de ellos (los campos de propiedades se quedan el Esc).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !$('#picker').hidden || !$('#note-menu').hidden) return;
  if ($('#qb') && !$('#qb').hidden) qbClose();
  else if ($('#qb-props') && !$('#qb-props').hidden) qbPropsClose();
});

// ---------- Menús ----------
CTX_MENU_EXTRA.push((kind, x) => {
  if (kind === 'note') return noteText(x) === null ? [] : [{ label: '🏷 Propiedades…', action: () => qbOpenProps(x) }];
  if (kind === 'editor') return [{ sep: true }, { label: '＋ Insertar…', action: () => qbInsertPicker() }, { label: '▤ Insertar vista de notas…', action: () => qbOpenInsert() }];
  if (kind !== 'reading') return [];
  const { note, e } = x;
  if (noteText(note) === null) return [];
  const items = [];
  const box = e.target.closest('#note-reading .query[data-kind]');
  if (box && !box.closest('.embed')) items.push(...qbQueryItems(note, box));
  if (noteMode.get(note.id) !== 'read') return items.length ? [{ sep: true }, ...items] : [];
  const blk = e.target.closest('#note-reading > [data-src]');
  const [from, to] = blk ? shiftedRange(blk.dataset.src) : [null, null];
  const point = { x: e.clientX, y: e.clientY };
  if (blk && !box && blk.matches(QB_TEXT_BLOCKS)) {
    items.push(
      { sep: true },
      { label: '¶ Estilo de párrafo ▸', action: () => showMenuAt(point.x, point.y, qbParaItems(note, from, to)) },
      { label: '▣ Convertir en recuadro…', action: () => qbPickCallout(note, from, to) },
      { label: '▾ Convertir en sección desplegable', action: () => qbRestyle(note, from, to, 'details') }
    );
  }
  items.push(
    { sep: true },
    { label: '＋ Insertar…', action: () => qbInsertPicker({ note, to }) },
    { label: '▤ Insertar vista de notas…', action: () => qbOpen({ target: to == null ? { mode: 'insert', note } : { mode: 'after', note, line: to } }) }
  );
  return items;
});

// Carpeta (botón ⋯ y clic derecho): el formulario con esa carpeta ya elegida.
const qbFolderMenuBase = folderMenuItems;
folderMenuItems = (f) => {
  const items = qbFolderMenuBase(f);
  const i = items.findIndex((x) => /^Ver como tablero/.test(x.label));
  items.splice(i < 0 ? 1 : i + 1, 0, { label: 'Ver como lista / tabla / tablero / galería…', action: () => qbOpen({ model: { ...qbModel('tabla'), folder: f }, target: { mode: 'create' } }) });
  return items;
};

function qbPickFolderView() {
  pickFrom('Carpeta que ver como lista, tabla o tablero…', [{ path: '', label: 'Todas las notas' }, ...allFolders().map((f) => ({ path: f, label: f }))].map((f) => ({ label: f.label, action: () => qbOpen({ model: { ...qbModel('tabla'), folder: f.path }, target: { mode: 'create' } }) })));
}

function qbPickNoteView(note) {
  const list = qbFences(noteText(note).split('\n'));
  if (list.length === 1) return qbConfigure(note, list[0]);
  pickFrom('Vista que configurar…', list.map((f) => ({ label: `${qbKind(f.kind).icon} ${qbKind(f.kind).label}`, detail: f.code.split('\n').filter((l) => l.trim()).join(' · ').slice(0, 70), action: () => qbConfigure(note, f) })));
}

COMMANDS_EXTRA.push((note) => {
  const ok = note && noteText(note) !== null;
  return [
    ...(ok ? [
      { label: 'Insertar vista de notas (lista, tabla, tablero…)…', action: () => qbOpenInsert() },
      { label: 'Insertar… (todos los bloques, sin escribir código)', action: () => (isEditing(note.id) || blockEdit ? qbInsertPicker() : qbInsertPicker({ note, to: null })) },
      ...(qbFences(noteText(note).split('\n')).length ? [{ label: 'Configurar una vista de esta nota…', action: () => qbPickNoteView(note) }] : []),
      { label: 'Propiedades de la nota…', action: () => qbOpenProps(note) },
    ] : []),
    { label: 'Ver una carpeta como lista, tabla o tablero…', action: qbPickFolderView },
  ];
});
