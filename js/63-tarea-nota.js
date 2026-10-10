'use strict';

// ---------- Nota de cada tarea y notas de un proyecto ----------
// Cada tarea puede tener una nota principal: `t.noteId` (va con la tarea, así que se sincroniza y se
// deshace como el resto). La nota nueva lleva `tarea: "[[tarea:ID|Título]]"` (y `proyecto:` si lo
// tiene) y relIndex (60) suma la arista tarea → nota: «Relacionado» la ve en ambos sentidos.
// - Se crea en la carpeta del proyecto (projectFolder) si su proyecto tiene nota; si no, en «Tareas».
//   Si existe «Plantillas/Tarea», se usa (con las propiedades `tarea` y `proyecto` añadidas).
// - Si la nota va a la papelera, `t.noteId` se queda: se ve como borrada, con «Recuperar» o «Crear otra».
//   Al restaurarla vuelve con el mismo id y la tarea la encuentra sola.
// - Si se borra la tarea, la nota se queda; su cabecera dice «tarea borrada».
// - Una tarea que se repite es el mismo objeto con otra fecha: conserva su nota (una reunión semanal
//   lleva una sola nota que va creciendo).
// El detalle del proyecto (07) lista todas sus notas: la principal, las de sus tareas, las de su
// carpeta, las que lo enlazan y las que tienen `proyecto:` con su nombre o enlace.

const TASK_NOTE_FOLDER = 'Tareas';

// Nota de una tarea (null si no tiene o ya no existe).
const taskNote = (t) => (t && !t.virtual && t.noteId && noteById(t.noteId)) || null;
const taskNoteMissing = (t) => !!(t && !t.virtual && t.noteId && !noteById(t.noteId));
const taskNoteTrashed = (t) => (t?.noteId && trashList().find((x) => x.id === t.noteId)) || null;
const taskOfNote = (note) => allTasks().find((t) => t.noteId === note.id) || null;

// Carpeta propia de un proyecto: la de su nota, salvo si es la general «Proyectos» o la comparte con
// otro proyecto; entonces, una subcarpeta con su nombre («Proyectos/Lanzamiento»).
function projectFolder(p) {
  const main = p.noteId && noteById(p.noteId);
  const f = main ? folderOf(main.path) : '';
  const shared = !f || f === 'Proyectos' || state.projects.some((q) => q !== p && q.noteId && folderOf(noteById(q.noteId)?.path || '\n') === f);
  return shared ? joinPath(f || 'Proyectos', cleanName(p.name) || 'Proyecto') : f;
}

function taskNoteFolder(t) {
  const p = projectById(t.projectId);
  return p?.noteId && noteById(p.noteId) ? projectFolder(p) : TASK_NOTE_FOLDER;
}

function taskNoteBody(t) {
  const p = projectById(t.projectId);
  const props = [['tarea', relLinkText('task', t)], ...(p ? [['proyecto', relLinkText('project', p)]] : [])];
  const tpl = findNoteByName(`${TEMPLATE_FOLDER}/Tarea`);
  if (tpl && tpl.body && !tpl.enc) {
    const n = { body: fillTemplate(tpl.body, t.title) };
    props.forEach(([k, v]) => setProp(n, k, v));
    return n.body;
  }
  return `---\n${props.map(([k, v]) => `${k}: ${yamlScalar(v)}`).join('\n')}\n---\n\n## Notas\n\n\n## Próximos pasos\n- \n`;
}

const ensureFolder = (f) => f && !allFolders().includes(f) && state.folders.push(f);

function createTaskNote(t, { open = true } = {}) {
  const folder = taskNoteFolder(t);
  ensureFolder(folder);
  const note = createNote({ folder, title: t.title, body: taskNoteBody(t), open: false });
  t.noteId = note.id;
  save();
  if (open) {
    const line = note.body.split('\n').findIndex((l) => /^##\s+Notas\s*$/.test(l));
    if (line >= 0) openNoteAtLine(note.id, line + 1);
    else openNote(note);
  } else renderAll();
  return note;
}

// 📝: abre la nota; si no hay, la crea; si está en la papelera, ofrece recuperarla.
function openTaskNote(t, { anchor = null, newTab = false } = {}) {
  if (typeof leaveDayView === 'function') leaveDayView();
  const note = taskNote(t);
  if (note) return openNote(note, { newTab });
  if (taskNoteMissing(t)) return showMenu(anchor || { x: innerWidth / 2 - 120, y: innerHeight / 3 }, taskNoteMissingItems(t));
  return createTaskNote(t);
}

function taskNoteMissingItems(t) {
  const it = taskNoteTrashed(t);
  return [
    ...(it ? [{ label: '↩ Recuperar la nota de la papelera', action: () => restoreFromTrash(it.id, { open: true }) }] : []),
    { label: '📝 Crear una nota nueva', action: () => createTaskNote(t) },
    { label: '🔗 Vincular una nota existente…', action: () => pickTaskNote(t) },
    { label: 'Desvincular', action: () => unlinkTaskNote(t) },
  ];
}

// Vincula una nota ya hecha; si no enlaza a la tarea, se le añade la propiedad `tarea`.
function linkTaskNote(t, note) {
  t.noteId = note.id;
  if (!note.enc && !note.body.includes(`tarea:${t.id}`) && !propOf(note, 'tarea')) setProp(note, 'tarea', relLinkText('task', t));
  save();
  renderAll();
  showToastMessage(`📝 Nota vinculada: «${baseName(note.path)}»`);
}

function pickTaskNote(t) {
  pickEntity({
    types: ['note'],
    exclude: t.noteId ? `note:${t.noteId}` : '',
    placeholder: `Nota para «${t.title}»…`,
    onPick: (e) => linkTaskNote(t, e.item),
  });
}

function unlinkTaskNote(t) {
  withUndo('Nota desvinculada de la tarea', () => {
    delete t.noteId;
  });
}

// ---------- Botón 📝 de la fila de la tarea (02, taskItem) ----------
function taskNoteButton(t) {
  const note = taskNote(t);
  const missing = taskNoteMissing(t);
  const title = note ? `Abrir la nota «${baseName(note.path)}»` : missing ? 'La nota ya no existe: recuperarla o crear otra' : 'Crear una nota para la tarea';
  const b = el('button', { type: 'button', className: `tn-btn${note ? ' on' : ''}${missing ? ' missing' : ''}`, title, ariaLabel: title }, '📝');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    openTaskNote(t, { anchor: b, newTab: e.ctrlKey || e.metaKey });
  });
  if (note) b.dataset.pvNote = note.id;
  return b;
}

// ---------- Fila «📝 Nota» del formulario de la tarea ----------
function taskNoteRow(t) {
  const note = taskNote(t);
  const missing = taskNoteMissing(t);
  const btn = (label, fn, cls = 'chip') => {
    const b = el('button', { type: 'button', className: cls }, label);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      fn(b);
    });
    return b;
  };
  const parts = [el('span', { className: 'tn-row-label' }, '📝 Nota')];
  if (note) {
    const name = btn(baseName(note.path), () => openNote(note), 'tn-name');
    name.dataset.pvNote = note.id;
    parts.push(name, btn('Abrir', () => openNote(note)), btn('Cambiar…', () => pickTaskNote(t)), btn('Desvincular', () => unlinkTaskNote(t)));
  } else if (missing) {
    const it = taskNoteTrashed(t);
    parts.push(el('span', { className: 'tn-name missing' }, el('s', {}, it ? baseName(it.from) : 'Nota borrada')));
    if (it) parts.push(btn('↩ Recuperar', () => restoreFromTrash(it.id)));
    parts.push(btn('Crear otra', () => createTaskNote(t)), btn('Cambiar…', () => pickTaskNote(t)), btn('Desvincular', () => unlinkTaskNote(t)));
  } else {
    parts.push(el('span', { className: 'muted' }, 'Sin nota'), btn('+ Crear nota', () => createTaskNote(t)), btn('Vincular…', () => pickTaskNote(t)));
  }
  return el('div', { className: 'row tn-row' }, parts);
}

// ---------- Clic derecho en una tarea ----------
CTX_MENU_EXTRA.push((kind, t) => {
  if (kind !== 'task' || !t?.id || t.virtual) return [];
  const note = taskNote(t);
  const it = taskNoteMissing(t) && taskNoteTrashed(t);
  return [
    { sep: true },
    note ? { label: '📝 Abrir la nota de la tarea', action: () => openTaskNote(t) } : { label: '📝 Crear nota para la tarea', action: () => createTaskNote(t) },
    ...(it ? [{ label: '↩ Recuperar su nota de la papelera', action: () => restoreFromTrash(it.id, { open: true }) }] : []),
    { label: '🔗 Vincular una nota existente…', action: () => pickTaskNote(t) },
    ...(t.noteId ? [{ label: 'Desvincular la nota', action: () => unlinkTaskNote(t) }] : []),
  ];
});

// ---------- Cabecera «☑ Nota de la tarea» en la lectura ----------
// La tarea que la tiene como nota; si ya no existe, la que nombra su propiedad `tarea` (borrada).
function taskNoteChip(note) {
  if (noteText(note) === null) return null;
  const t = taskOfNote(note);
  if (!t) {
    const m = /\[\[tarea:([A-Za-z0-9_-]+)(?:\|([^\]]*))?\]\]/.exec(String(propOf(note, 'tarea') || ''));
    if (!m || relFind('task', m[1])) return null;
    return el('div', { className: 'tn-chip gone' }, [el('span', {}, '☑ Nota de la tarea: '), el('s', {}, m[2] || 'Tarea'), el('span', { className: 'muted' }, ' · tarea borrada')]);
  }
  const box = el('input', { type: 'checkbox', checked: !!t.done, ariaLabel: `Completar ${t.title}` });
  box.addEventListener('change', () => toggleDone(t, box.checked));
  const name = el('button', { type: 'button', className: 'tn-chip-name', title: 'Abrir la tarea' }, t.title);
  name.addEventListener('click', () => relOpen('task', t));
  const p = projectById(t.projectId);
  const meta = [t.done ? '✓ Hecha' : t.status === 'doing' ? '◐ En curso' : '○ Pendiente', t.due && !t.done && formatDue(t.due), t.repeat && `↻ ${REPEAT_LABEL[t.repeat]}`, p && `📁 ${p.name}`].filter(Boolean).join(' · ');
  const chip = el('div', { className: `tn-chip${t.done ? ' done' : ''}` }, [box, el('span', {}, '☑ Nota de la tarea: '), name, el('span', { className: 'muted tn-chip-meta' }, ` · ${meta}`)]);
  chip.dataset.relType = 'task'; // clic derecho: el menú de la tarea
  chip.dataset.relId = t.id;
  return chip;
}

READING_EXTRA.push((reading, note) => {
  const chip = taskNoteChip(note);
  if (chip) reading.prepend(chip);
});

// ---------- Notas de un proyecto (detalle, 07) ----------
const PN_WHY = { main: 'Principal', task: 'Tarea', folder: 'Carpeta', link: 'Enlace', prop: 'Propiedad' };

function projectNotes(p) {
  const out = new Map(); // id -> { note, why: Set }
  const add = (n, why) => {
    if (!n || n.path.startsWith(`${TEMPLATE_FOLDER}/`)) return;
    if (!out.has(n.id)) out.set(n.id, { note: n, why: new Set() });
    out.get(n.id).why.add(why);
  };
  add(p.noteId && noteById(p.noteId), 'main');
  projectTasks(p).forEach((t) => add(taskNote(t), 'task'));
  const f = projectFolder(p);
  state.notes.forEach((n) => (n.path.startsWith(`${f}/`) ? add(n, 'folder') : null));
  const g = relatedOf('project', p.id);
  g.noteIn.concat(g.noteOut).forEach((n) => add(n, 'link'));
  const name = p.name.trim().toLowerCase();
  for (const n of state.notes) {
    if (n.enc || !/proyecto/i.test(n.body)) continue;
    const v = propOf(n, 'proyecto');
    const vals = (Array.isArray(v) ? v : [v]).map((x) => String(x).trim());
    if (vals.some((x) => x.includes(`proyecto:${p.id}`) || x.replace(/^\[\[|\]\]$/g, '').trim().toLowerCase() === name)) add(n, 'prop');
  }
  return [...out.values()].sort((a, b) => (b.note.updatedAt || 0) - (a.note.updatedAt || 0));
}

function newProjectNote(p) {
  const folder = projectFolder(p);
  ensureFolder(folder);
  return createNote({ folder, body: `---\nproyecto: ${yamlScalar(relLinkText('project', p))}\n---\n\n` });
}

function projectNotesBlock(p) {
  const list = projectNotes(p);
  const add = el('button', { type: 'button', className: 'chip pn-new' }, '+ Nueva nota del proyecto');
  add.addEventListener('click', () => newProjectNote(p));
  const rows = list.map(({ note, why }) => {
    const name = el('button', { type: 'button', className: 'rel-name' }, [el('span', { className: 'rel-ico', ariaHidden: 'true' }, '📝'), el('span', {}, baseName(note.path))]);
    name.addEventListener('click', (e) => openNote(note, { newTab: e.ctrlKey || e.metaKey }));
    name.dataset.pvNote = note.id;
    const row = el('div', { className: 'rel-row pn-row' }, [
      name,
      el('span', { className: 'pn-why' }, [...why].map((w) => PN_WHY[w]).join(' · ')),
      el('span', { className: 'rel-meta pn-folder' }, folderOf(note.path) || '/'),
      el('span', { className: 'rel-meta' }, formatDue(dateKey(new Date(note.updatedAt || note.createdAt || Date.now())))),
    ]);
    row.dataset.relType = 'note';
    row.dataset.relId = note.id;
    return row;
  });
  return el('section', { id: 'pd-notes', className: 'pd-notes' }, [
    el('h2', { className: 'section-title' }, ['Notas ', el('span', { className: 'muted' }, list.length ? String(list.length) : '')]),
    ...(rows.length ? rows : [el('p', { className: 'muted side-empty' }, 'Sin notas todavía. Crea la nota del proyecto o una nota para una de sus tareas.')]),
    el('div', { className: 'row' }, add),
  ]);
}
