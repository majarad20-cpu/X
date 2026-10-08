'use strict';

// ---------- Plantillas ----------
// Las notas de la carpeta «Plantillas» son plantillas. Variables: {{fecha}}, {{fecha_larga}},
// {{hora}}, {{título}} (o {{titulo}}) y {{semana}}. Si existe «Plantillas/Nota diaria», se usa
// para las notas diarias nuevas.
const TEMPLATE_FOLDER = 'Plantillas';
const EXAMPLE_TEMPLATES = {
  Reunión: `---\nfecha: {{fecha}}\nasistentes: \n---\n\n## Objetivo\n\n## Puntos\n- \n\n## Acuerdos\n- \n\n## Tareas\n- [ ] \n`,
  Proyecto: `**Objetivo:** \n**Fecha límite:** \n\n## Por qué importa\n\n## Tareas\n- [ ] \n\n## Recursos\n- \n\n## Notas\n`,
  Libro: `---\nautor: \nempezado: {{fecha}}\nvaloración: \n---\n\n## De qué trata\n\n## Ideas principales\n- \n\n## Citas\n> \n\n## Qué voy a aplicar\n- [ ] \n`,
  'Revisión semanal': `# Revisión de la semana {{semana}}\n\n## ✅ Lo que logré\n- \n\n## 🧹 Vaciar bandejas\n- [ ] Revisar tareas vencidas\n- [ ] Pasar ideas sueltas a notas o proyectos\n- [ ] Revisar el calendario de la próxima semana\n\n## 🎯 Las 3 prioridades de la próxima semana\n1. \n2. \n3. \n\n## 💭 Reflexión\n`,
};

const templateNotes = () => state.notes.filter((n) => n.path.startsWith(`${TEMPLATE_FOLDER}/`)).sort((a, b) => a.path.localeCompare(b.path, 'es'));

function fillTemplate(body, title = '') {
  const now = new Date();
  const long = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const { year, week } = isoWeek(now);
  return body
    .replace(/\{\{\s*fecha\s*\}\}/gi, dateKey(now))
    .replace(/\{\{\s*fecha_larga\s*\}\}/gi, long.charAt(0).toUpperCase() + long.slice(1))
    .replace(/\{\{\s*hora\s*\}\}/gi, nowHM())
    .replace(/\{\{\s*t[ií]tulo\s*\}\}/gi, title)
    .replace(/\{\{\s*semana\s*\}\}/gi, `${year}-W${String(week).padStart(2, '0')}`);
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
    if (noteMode.get(note.id) !== 'edit') noteMode.set(note.id, 'edit');
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
//   ```                  ```
function parseQuery(src) {
  const q = { tags: [], project: null, status: 'pending', when: null, folder: null, links: null, limit: 50 };
  src.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const kv = line.match(/^(carpeta|folder|enlaza|links|l[ií]mite|limit)\s*:\s*(.+)$/i);
    if (kv) {
      const k = kv[1].toLowerCase();
      if (k.startsWith('carp') || k === 'folder') q.folder = kv[2].trim();
      else if (k.startsWith('enl') || k === 'links') q.links = kv[2].trim();
      else q.limit = Math.max(1, Math.min(500, Number(kv[2]) || 50));
      return;
    }
    line.split(/\s+/).forEach((w) => {
      const lw = w.toLowerCase();
      if (lw.startsWith('#') && lw.length > 1) q.tags.push(lw.slice(1));
      else if (lw.startsWith('+') && lw.length > 1) q.project = w.slice(1);
    });
    const l = line.toLowerCase();
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
  return state.notes
    .filter((n) => n.id !== self)
    .filter((n) => !q.folder || n.path.toLowerCase().startsWith(`${q.folder.toLowerCase()}/`))
    .filter((n) => q.tags.every((tag) => tagsIn(n.body).some((x) => x === tag || x.startsWith(`${tag}/`))))
    .filter((n) => !q.links || (target && linksIn(n.body).some((l) => findNoteByName(l.target)?.id === target.id)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, q.limit);
}

// Sustituye los marcadores de consulta del texto ya pintado por listas reales (con sus botones).
function hydrateQueries(container, selfId) {
  container.querySelectorAll('.query[data-kind]').forEach((box) => {
    if (box.dataset.kind === 'tabla') return renderNoteTable(box, decodeURIComponent(box.dataset.src), selfId);
    const q = parseQuery(decodeURIComponent(box.dataset.src));
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
              return el('li', {}, [a, folderOf(n.path) ? el('span', { className: 'muted' }, ` · ${folderOf(n.path)}`) : '']);
            }))
          : el('p', { className: 'muted' }, 'Ninguna nota cumple esta consulta.')
      );
    }
  });
}
