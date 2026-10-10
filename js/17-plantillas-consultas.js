'use strict';

// ---------- Plantillas ----------
// Las notas de la carpeta «Plantillas» son plantillas. Variables: {{fecha}}, {{fecha_larga}},
// {{hora}}, {{título}} (o {{titulo}}), {{semana}} (AAAA-Wss), {{mes}} (AAAA-MM), {{año}},
// {{inicio_semana}} y {{fin_semana}} (lunes y domingo). Si existe «Plantillas/Nota diaria», se usa
// para las notas diarias nuevas («Plantillas/Semanal» y «Plantillas/Mensual», en 56-notas-extra.js).
const TEMPLATE_FOLDER = 'Plantillas';
const EXAMPLE_TEMPLATES = {
  Reunión: `---\nfecha: {{fecha}}\nasistentes: \n---\n\n## Objetivo\n\n## Puntos\n- \n\n## Acuerdos\n- \n\n## Tareas\n- [ ] \n`,
  Proyecto: `**Objetivo:** \n**Fecha límite:** \n\n## Por qué importa\n\n## Tareas\n- [ ] \n\n## Recursos\n- \n\n## Notas\n`,
  Libro: `---\nautor: \nempezado: {{fecha}}\nvaloración: \n---\n\n## De qué trata\n\n## Ideas principales\n- \n\n## Citas\n> \n\n## Qué voy a aplicar\n- [ ] \n`,
  'Revisión semanal': `# Revisión de la semana {{semana}}\n\n## ✅ Lo que logré\n- \n\n## 🧹 Vaciar bandejas\n- [ ] Revisar tareas vencidas\n- [ ] Pasar ideas sueltas a notas o proyectos\n- [ ] Revisar el calendario de la próxima semana\n\n## 🎯 Las 3 prioridades de la próxima semana\n1. \n2. \n3. \n\n## 💭 Reflexión\n`,
};

const templateNotes = () => state.notes.filter((n) => n.path.startsWith(`${TEMPLATE_FOLDER}/`)).sort((a, b) => a.path.localeCompare(b.path, 'es'));

// `when`: el día al que se refieren semana, mes y año (por defecto, hoy).
function fillTemplate(body, title = '', when = new Date()) {
  const now = new Date();
  const long = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const { year, week } = isoWeek(when);
  const mon = addDays(when, -((when.getDay() + 6) % 7));
  return body
    .replace(/\{\{\s*mes\s*\}\}/gi, () => dateKey(when).slice(0, 7))
    .replace(/\{\{\s*a[ñn]o\s*\}\}/gi, () => String(when.getFullYear()))
    .replace(/\{\{\s*inicio_semana\s*\}\}/gi, () => dateKey(mon))
    .replace(/\{\{\s*fin_semana\s*\}\}/gi, () => dateKey(addDays(mon, 6)))
    .replace(/\{\{\s*fecha\s*\}\}/gi, () => dateKey(now))
    .replace(/\{\{\s*fecha_larga\s*\}\}/gi, () => long.charAt(0).toUpperCase() + long.slice(1))
    .replace(/\{\{\s*hora\s*\}\}/gi, () => nowHM())
    .replace(/\{\{\s*t[ií]tulo\s*\}\}/gi, () => title)
    .replace(/\{\{\s*semana\s*\}\}/gi, () => `${year}-W${String(week).padStart(2, '0')}`);
}

function ensureTemplates() {
  if (templateNotes().length) return false;
  if (!state.folders.includes(TEMPLATE_FOLDER)) state.folders.push(TEMPLATE_FOLDER);
  Object.entries(EXAMPLE_TEMPLATES).forEach(([title, body]) => createNote({ folder: TEMPLATE_FOLDER, title, body, open: false, log: false }));
  showToastMessage('Creadas 4 plantillas de ejemplo en la carpeta «Plantillas». Puedes editarlas o añadir las tuyas.');
  return true;
}

function pickTemplate(onPick, placeholder) {
  ensureTemplates();
  openPicker({
    placeholder,
    hint: 'Las notas de la carpeta «Plantillas» son plantillas · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cerrar',
    items: (q) =>
      templateNotes()
        .filter((n) => baseName(n.path).toLowerCase().includes(q.toLowerCase()))
        .map((n) => ({ label: baseName(n.path), detail: n.body.split('\n').find((l) => l.trim() && l !== '---')?.slice(0, 50) || '', action: () => onPick(n) })),
  });
}

// Inserta la plantilla en la nota abierta: en el cursor si se está editando; si no, al final.
function insertTemplate() {
  const note = activeNote();
  if (!note) return newNoteFromTemplate();
  pickTemplate((tpl) => {
    const text = fillTemplate(tpl.body, baseName(note.path));
    if (!isEditing(note.id)) noteMode.set(note.id, preferredEditMode());
    renderNotePane(note);
    const ta = $('#note-editor');
    const at = ta.dataset.caret ? Number(ta.dataset.caret) : ta.value.length;
    ta.focus({ preventScroll: true });
    ta.setRangeText((at && ta.value[at - 1] !== '\n' ? '\n' : '') + text, at, at, 'end');
    ta.dispatchEvent(new Event('input'));
  }, 'Insertar plantilla…');
}

function newNoteFromTemplate() {
  pickTemplate(
    (tpl) =>
      promptText({
        placeholder: `Título de la nueva nota (plantilla «${baseName(tpl.path)}»)`,
        action: 'Crear nota',
        onSubmit: (title) => createNote({ folder: folderOf(title), title: baseName(title), body: fillTemplate(tpl.body, baseName(title)) }),
      }),
    'Nueva nota desde plantilla…'
  );
}

// El cursor se guarda al salir del editor para insertar ahí la plantilla.
$('#note-editor').addEventListener('blur', (e) => (e.target.dataset.caret = e.target.selectionStart));
$('#note-editor').addEventListener('focus', (e) => delete e.target.dataset.caret);

// ---------- Consultas dentro de las notas ----------
// Un bloque de código con «tareas» o «notas» se convierte en una lista que se actualiza sola:
//   ```tareas            ```notas
//   #trabajo             #ideas
//   +web                 carpeta: Proyectos
//   pendientes | hechas | todas      enlaza: Web nueva
//   hoy | vencidas | semana | sin fecha
//   carpeta: Proyectos   límite: 10
//   ```                  estado: pendiente   (o !leído, >7, >=, <, <=, * la tiene, - no la tiene)
//                        orden: puntuación desc   mostrar: autor, estado
//                        ```
function parseQuery(src) {
  const q = { tags: [], project: null, status: 'pending', when: null, folder: null, links: null, limit: 50, filters: [], sort: null, desc: false, show: [] };
  src.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const kv = line.match(/^(carpeta|folder|enlaza|links|l[ií]mite|limit|orden|sort|mostrar|show)\s*:\s*(.+)$/i);
    if (kv) {
      const k = kv[1].toLowerCase();
      if (k.startsWith('carp') || k === 'folder') q.folder = kv[2].trim();
      else if (k.startsWith('enl') || k === 'links') q.links = kv[2].trim();
      else if (k === 'orden' || k === 'sort') Object.assign(q, parseQuerySort(kv[2]));
      else if (k === 'mostrar' || k === 'show') q.show = splitList(kv[2]);
      else q.limit = Math.max(1, Math.min(500, Number(kv[2]) || 50));
      return;
    }
    const f = parsePropFilter(line);
    if (f) return q.filters.push(f);
    line.split(/\s+/).forEach((w) => {
      const lw = w.toLowerCase();
      if (lw.startsWith('#') && lw.length > 1) q.tags.push(lw.slice(1));
      else if (lw.startsWith('+') && lw.length > 1) q.project = w.slice(1);
    });
    // Las palabras clave no cuentan dentro de #etiquetas ni +proyectos.
    const l = line.toLowerCase().split(/\s+/).filter((w) => !/^[#+]/.test(w)).join(' ');
    if (/\bhechas?\b|\bcompletadas?\b/.test(l)) q.status = 'done';
    else if (/\btodas\b/.test(l)) q.status = 'all';
    else if (/\bpendientes?\b/.test(l)) q.status = 'pending';
    if (/\bhoy\b/.test(l)) q.when = 'today';
    else if (/\bvencidas?\b/.test(l)) q.when = 'overdue';
    else if (/\bsemana\b/.test(l)) q.when = 'week';
    else if (/sin fecha/.test(l)) q.when = 'nodate';
  });
  return q;
}

function runTaskQuery(q) {
  const today = dateKey();
  const weekEnd = dateKey(addDays(new Date(), 7));
  const project = q.project ? projectFromToken(`+${q.project}`) : null;
  return allTasks()
    .concat(noteTasks())
    .filter((t) => (q.status === 'pending' ? !t.done : q.status === 'done' ? t.done : true))
    .filter((t) => q.tags.every((tag) => (t.tags || []).some((x) => x === tag || x.startsWith(`${tag}/`))))
    .filter((t) => !q.project || (project && t.projectId === project.id))
    .filter((t) => !q.folder || (t.virtual && noteById(t.noteId)?.path.toLowerCase().startsWith(`${q.folder.toLowerCase()}/`)))
    .filter((t) => {
      if (q.when === 'today') return t.due && t.due <= today;
      if (q.when === 'overdue') return t.due && t.due < today;
      if (q.when === 'week') return t.due && t.due <= weekEnd;
      if (q.when === 'nodate') return !t.due;
      return true;
    })
    .sort(byImportance)
    .slice(0, q.limit);
}

function runNoteQuery(q, self) {
  const target = q.links ? findNoteByName(q.links) : null;
  const list = state.notes
    .filter((n) => n.id !== self)
    .filter((n) => !q.folder || n.path.toLowerCase().startsWith(`${q.folder.toLowerCase()}/`))
    .filter((n) => q.tags.every((tag) => tagsIn(n.body).some((x) => x === tag || x.startsWith(`${tag}/`))))
    .filter((n) => !q.links || (target && linksIn(n.body).some((l) => findNoteByName(l.target)?.id === target.id)))
    .filter((n) => matchPropFilters(n, q.filters));
  return (q.sort ? sortNotesBy(list, q.sort, q.desc) : list.sort((a, b) => b.updatedAt - a.updatedAt)).slice(0, q.limit);
}

// ---------- Filtros y orden por propiedad (```notas, ```tabla y ```tablero) ----------
// Cualquier línea «clave: valor» que no sea una opción del bloque filtra por esa propiedad.
const QUERY_RESERVED = /^(carpeta|folder|enlaza|links|l[ií]mite|limit|orden|sort|mostrar|show|columnas|columns|agrupar|group|totales|totals)$/i;
const splitList = (v) => String(v).split(',').map((x) => x.trim()).filter(Boolean);

function parseQuerySort(v) {
  const m = String(v).trim().match(/^(.*?)(?:\s+(asc|desc))?$/i);
  return { sort: m[1].trim() || null, desc: /desc/i.test(m[2] || '') };
}

function parsePropFilter(line) {
  const m = line.match(/^([^\s:#+][^:]*?)\s*:\s*(.*)$/u);
  if (!m || QUERY_RESERVED.test(m[1].trim())) return null;
  const v = m[2].trim();
  if (v === '*' || v === '-') return { key: m[1].trim(), op: v === '*' ? 'has' : 'lacks', value: '' };
  const op = v.match(/^(!=|!|>=|<=|>|<|=)/)?.[1] || '';
  return { key: m[1].trim(), op: op === '!=' ? '!' : op || '=', value: yamlUnquote(v.slice(op.length).trim()) };
}

// Valores de una propiedad o campo en línea (una lista da varios). Vacía = no la tiene.
function propValues(n, key) {
  const p = noteFields(n).get(String(key).toLowerCase());
  return p ? (p.items || [p.value]).map((x) => String(x).trim()).filter(Boolean) : [];
}

// Números como números y fechas (AAAA-MM-DD…) como fechas; otra cosa no se compara (NaN).
function propCompare(a, b) {
  const na = tableNum(a);
  const nb = tableNum(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const iso = /^\d{4}-\d{2}-\d{2}/;
  if (iso.test(a) && iso.test(b)) return a < b ? -1 : a > b ? 1 : 0;
  return NaN;
}

function matchPropFilter(n, f) {
  const vals = propValues(n, f.key);
  if (f.op === 'has') return vals.length > 0;
  if (f.op === 'lacks') return !vals.length;
  const eq = vals.some((v) => v.toLowerCase() === f.value.toLowerCase());
  if (f.op === '=') return eq;
  if (f.op === '!') return !eq;
  const want = /^(hoy|today)$/i.test(f.value) ? dateKey() : f.value;
  return vals.some((v) => {
    const c = propCompare(v, want);
    return !Number.isNaN(c) && (f.op === '>' ? c > 0 : f.op === '>=' ? c >= 0 : f.op === '<' ? c < 0 : c <= 0);
  });
}
const matchPropFilters = (n, filters) => !filters?.length || filters.every((f) => matchPropFilter(n, f));

// Valor para ordenar: nombre, creada, modificada o una propiedad (las vacías, al final).
function noteSortValue(n, key) {
  const k = fold(key);
  if (k === 'nombre' || k === 'name') return baseName(n.path);
  if (k === 'creada' || k === 'created') return n.createdAt || n.updatedAt || 0;
  if (k === 'modificada' || k === 'modified') return n.updatedAt || 0;
  return propOf(n, key);
}
function sortNotesBy(list, key, desc) {
  const vals = new Map(list.map((n) => [n.id, noteSortValue(n, key)]));
  return list.sort((a, b) => {
    const va = vals.get(a.id);
    const vb = vals.get(b.id);
    if ((va === '') !== (vb === '')) return va === '' ? 1 : -1;
    return compareCells(va, vb) * (desc ? -1 : 1) || baseName(a.path).localeCompare(baseName(b.path), 'es', { numeric: true });
  });
}

// «autor: Borges · estado: leído» junto a cada nota (lo que pide «mostrar:»).
function queryPropsView(n, keys) {
  const bits = (keys || []).map((k) => [k, propValues(n, k).join(', ')]).filter(([, v]) => v);
  return bits.length ? el('span', { className: 'query-props' }, bits.map(([k, v]) => el('span', { className: 'query-prop' }, [el('span', { className: 'muted' }, `${k}: `), v]))) : '';
}

// Sustituye los marcadores de consulta del texto ya pintado por listas reales (con sus botones).
function hydrateQueries(container, selfId) {
  container.querySelectorAll('.query[data-kind]').forEach((box) => {
    if (box.dataset.kind === 'tabla') return renderNoteTable(box, decodeURIComponent(box.dataset.code), selfId);
    if (box.dataset.kind === 'tablero') return renderNoteBoard(box, decodeURIComponent(box.dataset.code), selfId);
    // Vistas registradas por otros módulos (```galeria, ```calendario… en 55-vistas.js).
    const view = typeof QUERY_KINDS !== 'undefined' && Object.hasOwn(QUERY_KINDS, box.dataset.kind) && QUERY_KINDS[box.dataset.kind];
    if (view) return view.render(box, decodeURIComponent(box.dataset.code), selfId);
    const q = parseQuery(decodeURIComponent(box.dataset.code));
    const head = el('div', { className: 'query-head' });
    if (box.dataset.kind === 'tareas') {
      const list = runTaskQuery(q);
      head.textContent = `Consulta de tareas · ${plural(list.length, 'resultado', 'resultados')}`;
      box.replaceChildren(head, list.length ? el('ul', { className: 'list query-list' }, list.map((t) => taskItem(t))) : el('p', { className: 'muted' }, 'Ninguna tarea cumple esta consulta.'));
    } else {
      const list = runNoteQuery(q, selfId);
      head.textContent = `Consulta de notas · ${plural(list.length, 'resultado', 'resultados')}`;
      box.replaceChildren(
        head,
        list.length
          ? el('ul', { className: 'query-notes' }, list.map((n) => {
              const a = el('a', { href: '#', className: 'wikilink', title: n.path }, baseName(n.path));
              a.dataset.target = n.path;
              a.dataset.heading = '';
              return el('li', {}, [a, folderOf(n.path) ? el('span', { className: 'muted' }, ` · ${folderOf(n.path)}`) : '', queryPropsView(n, q.show)]);
            }))
          : el('p', { className: 'muted' }, 'Ninguna nota cumple esta consulta.')
      );
    }
  });
}
